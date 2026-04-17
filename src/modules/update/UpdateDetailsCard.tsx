import { Suspense, lazy, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/http/client";
import { updateApi, type UpdateCheckResponse } from "@/lib/http/apis/update";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { Modal } from "@/modules/ui/Modal";
import { useToast } from "@/modules/ui/ToastProvider";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 2000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const LazyRichMarkdown = lazy(() =>
  import("@/modules/monitor/log-content/rendering-markdown").then((mod) => ({
    default: mod.RichMarkdown,
  })),
);
const RELEASE_NOTES_PROSE_CLASSES = `prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed
  prose-headings:mt-3 prose-headings:mb-2 prose-headings:font-semibold
  prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
  prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
  prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none
  dark:prose-code:bg-neutral-800 dark:prose-code:text-slate-300
  prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-xs dark:prose-pre:bg-neutral-900
  prose-a:break-all prose-a:text-indigo-600 dark:prose-a:text-indigo-300
  prose-table:border-collapse prose-table:text-sm prose-table:w-full
  prose-th:border prose-th:border-slate-300 prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left
  dark:prose-th:border-neutral-700 dark:prose-th:bg-neutral-800
  prose-td:border prose-td:border-slate-300 prose-td:px-3 prose-td:py-2 dark:prose-td:border-neutral-700`;

const shortCommit = (commit?: string) => {
  const trimmed = commit?.trim() ?? "";
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed;
};

const sameCommit = (left?: string, right?: string) => {
  const normalizedLeft = left?.trim().toLowerCase() ?? "";
  const normalizedRight = right?.trim().toLowerCase() ?? "";
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft);
};

const matchesAppliedTarget = (
  info: UpdateCheckResponse,
  target?: UpdateCheckResponse | null,
) => {
  if (!target) return !info.update_available;
  if (sameCommit(info.current_commit, target.latest_commit)) return true;
  const currentVersion = info.current_version?.trim() ?? "";
  const targetVersion = target.latest_version?.trim() ?? "";
  if (currentVersion && targetVersion && currentVersion === targetVersion) return true;
  return false;
};

const versionLabel = (version?: string, commit?: string, channel?: string) => {
  const trimmedVersion = version?.trim();
  if (trimmedVersion) return trimmedVersion;
  const short = shortCommit(commit);
  if (short && channel) return `${channel}-${short}`;
  return short || "--";
};

function ReleaseNotesMarkdown({ text }: { text: string }) {
  return (
    <div
      data-testid="update-release-notes"
      className="max-h-[42vh] overflow-y-auto break-words rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-200"
    >
      <Suspense
        fallback={
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
            {text}
          </pre>
        }
      >
        <LazyRichMarkdown proseClasses={RELEASE_NOTES_PROSE_CLASSES} text={text} />
      </Suspense>
    </div>
  );
}

export function UpdateDetailsCard({
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS,
}: {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [candidate, setCandidate] = useState<UpdateCheckResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waitForAppliedTarget = useCallback(async (target?: UpdateCheckResponse | null) => {
    const deadline = Date.now() + heartbeatTimeoutMs;
    let lastCheck: UpdateCheckResponse | null = null;
    await sleep(Math.min(heartbeatIntervalMs, 3000));
    while (true) {
      try {
        await apiClient.get("/system-stats", {
          timeoutMs: Math.min(5000, heartbeatIntervalMs + 3000),
        });
        const info = await updateApi.check({
          timeoutMs: Math.min(8000, heartbeatIntervalMs + 5000),
        });
        lastCheck = info;
        setCandidate(info);
        if (matchesAppliedTarget(info, target)) {
          return { ok: true, latest: info };
        }
      } catch {
        // Keep polling until timeout so restarts and short network blips do not look like failures.
      }
      if (Date.now() >= deadline) return { ok: false, latest: lastCheck };
      await sleep(heartbeatIntervalMs);
    }
  }, [heartbeatIntervalMs, heartbeatTimeoutMs]);

  const checkUpdate = useCallback(async () => {
    setModalOpen(true);
    setChecking(true);
    setChecked(true);
    setError(null);
    try {
      const info = await updateApi.check();
      setCandidate(info);
      if (!info.enabled) {
        notify({ type: "info", message: t("auto_update.disabled") });
      } else if (!info.update_available) {
        notify({ type: "success", message: t("auto_update.no_update") });
      }
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.check_failed"),
      });
      setCandidate(null);
      setError(err instanceof Error ? err.message : t("auto_update.check_failed"));
    } finally {
      setChecking(false);
    }
  }, [notify, t]);

  const applyUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const response = await updateApi.apply();
      const target = response.target ?? candidate;
      const result = await waitForAppliedTarget(target);
      if (!result.ok) {
        notify({
          type: "warning",
          message:
            result.latest || target
              ? t("auto_update.version_mismatch", {
                  version: versionLabel(
                    target?.latest_version,
                    target?.latest_commit,
                    target?.target_channel,
                  ),
                })
              : t("auto_update.timeout"),
        });
        setUpdating(false);
        return;
      }
      notify({ type: "success", message: t("auto_update.success") });
      window.location.reload();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.failed"),
      });
      setUpdating(false);
    }
  }, [candidate, notify, t, waitForAppliedTarget]);

  const releaseNotes = candidate?.release_notes?.trim() || t("auto_update.no_release_notes");
  const canUpdate = Boolean(
    candidate?.enabled && candidate.update_available && candidate.updater_available,
  );
  const modalTitle =
    candidate && !candidate.update_available
      ? t("auto_update.up_to_date_title")
      : t("auto_update.title");
  const modalDescription =
    candidate && !candidate.update_available
      ? t("auto_update.up_to_date_description")
      : t("auto_update.description");
  const showReleaseNotes = Boolean(candidate?.update_available);
  const currentVersion = candidate
    ? versionLabel(candidate.current_version, candidate.current_commit, candidate.target_channel)
    : "--";
  const targetVersion = candidate
    ? versionLabel(candidate.latest_version, candidate.latest_commit, candidate.target_channel)
    : "--";
  const dockerImage = candidate
    ? [candidate.docker_image, candidate.docker_tag].filter(Boolean).join(":")
    : "--";

  return (
    <>
      <Card
        title={t("auto_update.system_title")}
        description={t("auto_update.system_description")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void checkUpdate()}
            disabled={checking}
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
            {t("auto_update.check_button")}
          </Button>
        }
      >
        <p className="text-sm text-slate-600 dark:text-white/60">
          {checked && candidate?.enabled === false
            ? t("auto_update.disabled")
            : checked && candidate && !candidate.update_available
              ? t("auto_update.no_update")
              : t("auto_update.system_idle")}
        </p>
      </Card>

      <Modal
        open={modalOpen}
        title={modalTitle}
        description={modalDescription}
        maxWidth="max-w-[min(92vw,900px)]"
        bodyHeightClassName="max-h-[min(76vh,720px)]"
        onClose={() => {
          if (!updating) setModalOpen(false);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={updating}>
              {t("common.close")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void applyUpdate()}
              disabled={checking || updating || !canUpdate}
            >
              {updating ? <RefreshCw size={14} className="animate-spin" /> : null}
              {updating ? t("auto_update.updating") : t("auto_update.update_now")}
            </Button>
          </>
        }
      >
        <div className="min-w-0 space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-slate-200">
              <RefreshCw size={14} className="animate-spin" />
              {t("common.loading")}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          {candidate ? (
            <>
              <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                    {t("auto_update.current")}
                  </dt>
                  <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
                    {currentVersion}
                  </dd>
                  {candidate.current_commit ? (
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/50">
                      {t("auto_update.commit")}: {shortCommit(candidate.current_commit)}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                    {t("auto_update.target")}
                  </dt>
                  <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
                    {targetVersion}
                  </dd>
                  {candidate.latest_commit ? (
                    candidate.latest_commit_url ? (
                      <a
                        href={candidate.latest_commit_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                      >
                        {t("auto_update.commit")}: {shortCommit(candidate.latest_commit)}
                      </a>
                    ) : (
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/50">
                        {t("auto_update.commit")}: {shortCommit(candidate.latest_commit)}
                      </p>
                    )
                  ) : null}
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50 sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                    {t("auto_update.image")}
                  </dt>
                  <dd
                    data-testid="update-image-value"
                    className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white"
                  >
                    {dockerImage}
                  </dd>
                </div>
              </dl>

              {showReleaseNotes ? (
                <div className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auto_update.release_notes")}
                  </h3>
                  <ReleaseNotesMarkdown text={releaseNotes} />
                </div>
              ) : null}

              {!candidate.updater_available ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  {t("auto_update.updater_unavailable")}
                </p>
              ) : null}

              {!candidate.enabled || !candidate.update_available ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {!candidate.enabled ? t("auto_update.disabled") : t("auto_update.no_update")}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
