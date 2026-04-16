import { useCallback, useState } from "react";
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

  const waitForHeartbeat = useCallback(async () => {
    const deadline = Date.now() + heartbeatTimeoutMs;
    await sleep(Math.min(heartbeatIntervalMs, 3000));
    while (Date.now() < deadline) {
      try {
        await apiClient.get("/system-stats", {
          timeoutMs: Math.min(5000, heartbeatIntervalMs + 3000),
        });
        return true;
      } catch {
        await sleep(heartbeatIntervalMs);
      }
    }
    return false;
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
      await updateApi.apply();
      const ok = await waitForHeartbeat();
      if (!ok) {
        notify({ type: "warning", message: t("auto_update.timeout") });
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
  }, [notify, t, waitForHeartbeat]);

  const releaseNotes = candidate?.release_notes?.trim() || t("auto_update.no_release_notes");
  const canUpdate = Boolean(
    candidate?.enabled && candidate.update_available && candidate.updater_available,
  );

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
        title={t("auto_update.title")}
        description={t("auto_update.description")}
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
              <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                    {t("auto_update.current")}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-sm text-slate-900 dark:text-white">
                    {candidate.current_version || candidate.current_commit || "--"}
                  </dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                    {t("auto_update.target")}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-sm text-slate-900 dark:text-white">
                    {candidate.latest_version || candidate.latest_commit || "--"}
                  </dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                    {t("auto_update.image")}
                  </dt>
                  <dd
                    data-testid="update-image-value"
                    className="mt-1 break-all font-mono text-sm text-slate-900 dark:text-white"
                  >
                    {candidate.docker_image}:{candidate.docker_tag}
                  </dd>
                </div>
              </dl>

              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {t("auto_update.release_notes")}
                </h3>
                <pre
                  data-testid="update-release-notes"
                  className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-200"
                >
                  {releaseNotes}
                </pre>
              </div>

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
