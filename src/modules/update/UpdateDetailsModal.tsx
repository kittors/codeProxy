import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { UpdateCheckResponse, UpdateProgressResponse } from "@/lib/http/apis/update";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";
import {
  formatUpdateStatusMessage,
  isAlreadyUpToDateMessage,
  shortCommit,
  uiVersionLabel,
  versionLabel,
} from "@/modules/update/updateShared";

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

function ReleaseNotesMarkdown({ text }: { text: string }) {
  return (
    <div
      data-testid="update-release-notes"
      className="max-h-60 overflow-y-auto break-words rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-200"
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

const MAX_RELEASE_NOTE_ITEMS = 5;
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+/;
const UPDATE_STAGE_ORDER = ["preparing", "pulling", "restarting", "verifying", "completed"];
const UPDATE_STAGE_LABEL_KEYS: Record<string, string> = {
  preparing: "auto_update.progress_stage_preparing",
  pulling: "auto_update.progress_stage_pulling",
  restarting: "auto_update.progress_stage_restarting",
  verifying: "auto_update.progress_stage_verifying",
  completed: "auto_update.progress_stage_completed",
  failed: "auto_update.progress_stage_failed",
  idle: "auto_update.progress_stage_idle",
};

function buildReleaseNotesPreview(text: string) {
  const lines = text.split("\n");
  let itemCount = 0;
  let cutoffIndex = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (!LIST_ITEM_PATTERN.test(lines[index])) continue;
    itemCount += 1;
    if (itemCount > MAX_RELEASE_NOTE_ITEMS) {
      cutoffIndex = index;
      break;
    }
  }
  if (cutoffIndex === lines.length) {
    return { text, truncated: false };
  }
  return { text: lines.slice(0, cutoffIndex).join("\n").trimEnd(), truncated: true };
}

function normalizedStage(progress?: UpdateProgressResponse | null) {
  const stage = progress?.stage?.trim().toLowerCase();
  if (stage) return stage;
  return progress?.status === "completed" ? "completed" : "preparing";
}

function stageLabel(t: TFunction, stage: string) {
  return t(UPDATE_STAGE_LABEL_KEYS[stage] ?? "auto_update.progress_stage_unknown");
}

function formatLogTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function UpdateProgressConsole({
  candidate,
  progress,
}: {
  candidate: UpdateCheckResponse;
  progress?: UpdateProgressResponse | null;
}) {
  const { t } = useTranslation();
  const logStreamRef = useRef<HTMLDivElement | null>(null);
  const stage = normalizedStage(progress);
  const currentVersion = versionLabel(
    candidate.current_version,
    candidate.current_commit,
    candidate.target_channel,
  );
  const targetVersion =
    progress?.target_version?.trim() ||
    versionLabel(candidate.latest_version, candidate.latest_commit, candidate.target_channel);
  const currentUIVersion = uiVersionLabel(
    candidate.current_ui_version,
    candidate.current_ui_commit,
    candidate.target_channel,
  );
  const targetUIVersion =
    progress?.target_ui_version?.trim() ||
    uiVersionLabel(
      candidate.latest_ui_version,
      candidate.latest_ui_commit,
      candidate.target_channel,
    );
  const dockerImage =
    [progress?.target_image, progress?.target_tag].filter(Boolean).join(":") ||
    [candidate.docker_image, candidate.docker_tag].filter(Boolean).join(":") ||
    "--";
  const logs = progress?.logs ?? [];
  const activeStageIndex = Math.max(0, UPDATE_STAGE_ORDER.indexOf(stage));
  const isRunning = progress?.status === "running";

  useEffect(() => {
    const node = logStreamRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs]);

  return (
    <section
      data-testid="update-progress-console"
      className="min-w-0 space-y-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-500/20 dark:bg-sky-500/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <RefreshCw
              size={14}
              className={[isRunning ? "animate-spin" : "", "text-sky-600 dark:text-sky-300"].join(
                " ",
              )}
            />
            {t("auto_update.progress_title")}
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
            {progress?.message?.trim() || t("auto_update.progress_default_message")}
          </p>
        </div>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-200">
          {stageLabel(t, stage)}
        </span>
      </div>

      <dl className="grid min-w-0 gap-2 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-sky-200/70 bg-white/80 p-3 dark:border-sky-500/15 dark:bg-neutral-950/50">
          <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
            {t("auto_update.progress_service_path")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
            {currentVersion} <span className="text-slate-400">-&gt;</span> {targetVersion}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-sky-200/70 bg-white/80 p-3 dark:border-sky-500/15 dark:bg-neutral-950/50">
          <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
            {t("auto_update.progress_ui_path")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
            {currentUIVersion} <span className="text-slate-400">-&gt;</span> {targetUIVersion}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-sky-200/70 bg-white/80 p-3 dark:border-sky-500/15 dark:bg-neutral-950/50 lg:col-span-2">
          <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
            {t("auto_update.image")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
            {dockerImage}
          </dd>
        </div>
      </dl>

      <ol className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        {UPDATE_STAGE_ORDER.map((item, index) => {
          const completed = progress?.status === "completed" || index < activeStageIndex;
          const active = progress?.status !== "completed" && item === stage;
          return (
            <li
              key={item}
              className={[
                "rounded-lg border px-2.5 py-2",
                completed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                  : active
                    ? "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-100"
                    : "border-slate-200 bg-white/70 text-slate-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/45",
              ].join(" ")}
            >
              {stageLabel(t, item)}
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 overflow-hidden rounded-xl border border-neutral-900 bg-neutral-950 text-xs text-slate-100 shadow-inner">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
          <span>{t("auto_update.progress_logs")}</span>
          <span>
            {logs.length ? t("auto_update.progress_log_count", { count: logs.length }) : ""}
          </span>
        </div>
        <div
          data-testid="update-log-stream"
          ref={logStreamRef}
          className="max-h-64 min-h-32 overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono leading-5"
        >
          {logs.length ? (
            logs.map((entry, index) => (
              <div key={`${entry.timestamp ?? "log"}-${index}`} className="break-words">
                <span className="text-slate-500">{formatLogTimestamp(entry.timestamp)}</span>{" "}
                <span className="text-sky-300">{entry.stream || "log"}</span>{" "}
                <span>{entry.message}</span>
              </div>
            ))
          ) : (
            <p className="text-slate-400">{t("auto_update.progress_logs_empty")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function UpdateDetailsModal({
  open,
  candidate,
  updateTarget = null,
  progress = null,
  checking = false,
  updating = false,
  error = null,
  onApply,
  onClose,
}: {
  open: boolean;
  candidate: UpdateCheckResponse | null;
  updateTarget?: UpdateCheckResponse | null;
  progress?: UpdateProgressResponse | null;
  checking?: boolean;
  updating?: boolean;
  error?: string | null;
  onApply: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [releaseNotesExpanded, setReleaseNotesExpanded] = useState(false);
  const showProgressConsole = Boolean(progress && progress.status !== "idle");
  const progressStatus = progress?.status?.trim().toLowerCase();
  const progressCompleted = showProgressConsole && progressStatus === "completed";
  const progressFailed = showProgressConsole && progressStatus === "failed";
  const activeUpdate = updating || progress?.status === "running";
  const displayCandidate = showProgressConsole ? (updateTarget ?? candidate) : candidate;
  const alreadyUpToDate = Boolean(
    displayCandidate &&
      !displayCandidate.update_available &&
      (!displayCandidate.message || isAlreadyUpToDateMessage(displayCandidate.message)),
  );

  const canUpdate = Boolean(
    displayCandidate?.enabled &&
    displayCandidate.update_available &&
    displayCandidate.updater_available,
  );
  const modalTitle = progressCompleted
    ? t("auto_update.completed_title")
    : progressFailed
      ? t("auto_update.failed")
      : showProgressConsole
        ? t("auto_update.updating_title")
        : alreadyUpToDate
          ? t("auto_update.up_to_date_title")
          : t("auto_update.title");
  const modalDescription = progressCompleted
    ? t("auto_update.completed_description")
    : progressFailed
      ? t("auto_update.failed_description")
      : showProgressConsole
        ? t("auto_update.updating_description")
        : alreadyUpToDate
          ? t("auto_update.up_to_date_description")
          : t("auto_update.description");
  const releaseNotes = displayCandidate?.release_notes?.trim() || t("auto_update.no_release_notes");
  const showReleaseNotes = Boolean(displayCandidate?.update_available) && !showProgressConsole;
  const releaseNotesPreview = useMemo(() => buildReleaseNotesPreview(releaseNotes), [releaseNotes]);
  const visibleReleaseNotes =
    releaseNotesExpanded || !releaseNotesPreview.truncated
      ? releaseNotes
      : releaseNotesPreview.text;
  const currentVersion = displayCandidate
    ? versionLabel(
        displayCandidate.current_version,
        displayCandidate.current_commit,
        displayCandidate.target_channel,
      )
    : "--";
  const targetVersion = displayCandidate
    ? versionLabel(
        displayCandidate.latest_version,
        displayCandidate.latest_commit,
        displayCandidate.target_channel,
      )
    : "--";
  const currentUIVersion = displayCandidate
    ? uiVersionLabel(
        displayCandidate.current_ui_version,
        displayCandidate.current_ui_commit,
        displayCandidate.target_channel,
      )
    : "--";
  const targetUIVersion = displayCandidate
    ? uiVersionLabel(
        displayCandidate.latest_ui_version,
        displayCandidate.latest_ui_commit,
        displayCandidate.target_channel,
      )
    : "--";
  const dockerImage = displayCandidate
    ? [displayCandidate.docker_image, displayCandidate.docker_tag].filter(Boolean).join(":")
    : "--";
  const formattedCandidateMessage =
    alreadyUpToDate && isAlreadyUpToDateMessage(displayCandidate?.message)
      ? ""
      : formatUpdateStatusMessage(displayCandidate?.message);
  const versionCardClass = alreadyUpToDate
    ? "min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10"
    : "min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50";
  const versionCardLabelClass = alreadyUpToDate
    ? "text-xs font-medium text-emerald-700 dark:text-emerald-200"
    : "text-xs font-medium text-slate-500 dark:text-white/55";
  const versionCardValueClass = alreadyUpToDate
    ? "mt-1 break-words font-mono text-sm text-emerald-900 dark:text-emerald-100"
    : "mt-1 break-words font-mono text-sm text-slate-900 dark:text-white";
  const versionCardMetaClass = alreadyUpToDate
    ? "mt-1 truncate text-xs text-emerald-700/80 dark:text-emerald-200/80"
    : "mt-1 truncate text-xs text-slate-500 dark:text-white/50";

  useEffect(() => {
    setReleaseNotesExpanded(false);
  }, [candidate?.latest_commit, candidate?.latest_ui_commit, open]);

  return (
    <Modal
      open={open}
      title={modalTitle}
      description={modalDescription}
      maxWidth="max-w-[min(92vw,900px)]"
      bodyHeightClassName="h-[min(68vh,560px)]"
      bodyTestId="update-details-modal-body"
      onClose={() => {
        if (!activeUpdate) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={activeUpdate}>
            {t("common.close")}
          </Button>
          {!showProgressConsole || activeUpdate ? (
            <Button
              variant="primary"
              onClick={onApply}
              disabled={checking || activeUpdate || !canUpdate}
            >
              {activeUpdate ? <RefreshCw size={14} className="animate-spin" /> : null}
              {activeUpdate ? t("auto_update.updating") : t("auto_update.update_now")}
            </Button>
          ) : null}
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

        {displayCandidate ? (
          <>
            {showProgressConsole ? (
              <UpdateProgressConsole candidate={displayCandidate} progress={progress} />
            ) : formattedCandidateMessage ? (
              <p className="whitespace-pre-line break-words rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {formattedCandidateMessage}
              </p>
            ) : null}

            {!showProgressConsole ? (
              <dl className="grid min-w-0 gap-3 lg:grid-cols-2">
                <div className={versionCardClass}>
                  <dt className={versionCardLabelClass}>
                    {t("auto_update.current_service")}
                  </dt>
                  <dd className={versionCardValueClass}>
                    {currentVersion}
                  </dd>
                  {displayCandidate.current_commit ? (
                    <p className={versionCardMetaClass}>
                      {t("auto_update.commit")}: {shortCommit(displayCandidate.current_commit)}
                    </p>
                  ) : null}
                </div>
                <div className={versionCardClass}>
                  <dt className={versionCardLabelClass}>
                    {t("auto_update.target_service")}
                  </dt>
                  <dd className={versionCardValueClass}>
                    {targetVersion}
                  </dd>
                  {displayCandidate.latest_commit ? (
                    displayCandidate.latest_commit_url ? (
                      <a
                        href={displayCandidate.latest_commit_url}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          alreadyUpToDate
                            ? "mt-1 block truncate text-xs text-emerald-700 hover:underline dark:text-emerald-200"
                            : "mt-1 block truncate text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                        }
                      >
                        {t("auto_update.commit")}: {shortCommit(displayCandidate.latest_commit)}
                      </a>
                    ) : (
                      <p className={versionCardMetaClass}>
                        {t("auto_update.commit")}: {shortCommit(displayCandidate.latest_commit)}
                      </p>
                    )
                  ) : null}
                </div>
                <div className={versionCardClass}>
                  <dt className={versionCardLabelClass}>
                    {t("auto_update.current_ui")}
                  </dt>
                  <dd className={versionCardValueClass}>
                    {currentUIVersion}
                  </dd>
                  {displayCandidate.current_ui_commit ? (
                    <p className={versionCardMetaClass}>
                      {t("auto_update.commit")}: {shortCommit(displayCandidate.current_ui_commit)}
                    </p>
                  ) : null}
                </div>
                <div className={versionCardClass}>
                  <dt className={versionCardLabelClass}>
                    {t("auto_update.target_ui")}
                  </dt>
                  <dd className={versionCardValueClass}>
                    {targetUIVersion}
                  </dd>
                  {displayCandidate.latest_ui_commit ? (
                    displayCandidate.latest_ui_commit_url ? (
                      <a
                        href={displayCandidate.latest_ui_commit_url}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          alreadyUpToDate
                            ? "mt-1 block truncate text-xs text-emerald-700 hover:underline dark:text-emerald-200"
                            : "mt-1 block truncate text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                        }
                      >
                        {t("auto_update.commit")}: {shortCommit(displayCandidate.latest_ui_commit)}
                      </a>
                    ) : (
                      <p className={versionCardMetaClass}>
                        {t("auto_update.commit")}: {shortCommit(displayCandidate.latest_ui_commit)}
                      </p>
                    )
                  ) : null}
                </div>
                <div className={`${versionCardClass} lg:col-span-2`}>
                  <dt className={versionCardLabelClass}>
                    {t("auto_update.image")}
                  </dt>
                  <dd
                    data-testid="update-image-value"
                    className={versionCardValueClass}
                  >
                    {dockerImage}
                  </dd>
                </div>
              </dl>
            ) : null}

            {showReleaseNotes ? (
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auto_update.release_notes")}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {releaseNotesPreview.truncated ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setReleaseNotesExpanded((prev) => !prev)}
                      >
                        {releaseNotesExpanded
                          ? t("auto_update.release_notes_show_less")
                          : t("auto_update.release_notes_show_more")}
                      </Button>
                    ) : null}
                    {displayCandidate.release_url ? (
                      <a
                        href={displayCandidate.release_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                      >
                        {t("auto_update.release_notes_open")}
                      </a>
                    ) : null}
                  </div>
                </div>
                {!releaseNotesExpanded && releaseNotesPreview.truncated ? (
                  <p className="mb-2 text-xs text-slate-500 dark:text-white/55">
                    {t("auto_update.release_notes_preview_notice", {
                      count: MAX_RELEASE_NOTE_ITEMS,
                    })}
                  </p>
                ) : null}
                <ReleaseNotesMarkdown text={visibleReleaseNotes} />
              </div>
            ) : null}

            {!showProgressConsole && !displayCandidate.updater_available ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {t("auto_update.updater_unavailable")}
              </p>
            ) : null}

            {!showProgressConsole && (!displayCandidate.enabled || alreadyUpToDate) ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {!displayCandidate.enabled ? t("auto_update.disabled") : t("auto_update.no_update")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
