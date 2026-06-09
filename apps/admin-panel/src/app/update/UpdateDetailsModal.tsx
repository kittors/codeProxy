import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import type { UpdateCheckResponse, UpdateProgressResponse } from "@code-proxy/api-client/endpoints/update";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import {
  formatUpdateStatusMessage,
  isAlreadyUpToDateMessage,
  shortCommit,
  uiVersionLabel,
  versionLabel,
} from "@app/update/updateShared";

const LazyRichMarkdown = lazy(() =>
  import("@features/log-content-viewer/log-content/rendering-markdown").then((mod) => ({
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
const UPDATE_PROGRESS_TICK_MS = 180;
const UPDATE_STAGE_LABEL_KEYS: Record<string, string> = {
  preparing: "auto_update.progress_stage_preparing",
  pulling: "auto_update.progress_stage_pulling",
  restarting: "auto_update.progress_stage_restarting",
  verifying: "auto_update.progress_stage_verifying",
  completed: "auto_update.progress_stage_completed",
  failed: "auto_update.progress_stage_failed",
  idle: "auto_update.progress_stage_idle",
};
const UPDATE_PROGRESS_MESSAGE_KEYS: Record<string, string> = {
  "preparing update": "auto_update.progress_message_preparing_update",
  "pulling target image": "auto_update.progress_message_pulling_target_image",
  "restarting container": "auto_update.progress_message_restarting_container",
  "restarting service": "auto_update.progress_message_restarting_container",
  "verifying service health": "auto_update.progress_message_verifying_service",
  "waiting for service health": "auto_update.progress_message_verifying_service",
  "update completed": "auto_update.progress_message_completed",
};
const UPDATE_STAGE_PROGRESS_SEGMENTS: Record<
  string,
  { start: number; end: number; durationMs: number }
> = {
  idle: { start: 0, end: 0, durationMs: 0 },
  preparing: { start: 8, end: 18, durationMs: 2200 },
  pulling: { start: 18, end: 68, durationMs: 16000 },
  restarting: { start: 68, end: 84, durationMs: 7000 },
  verifying: { start: 84, end: 97, durationMs: 9000 },
  completed: { start: 100, end: 100, durationMs: 0 },
  failed: { start: 24, end: 90, durationMs: 0 },
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

function normalizedProgressStatus(progress?: UpdateProgressResponse | null) {
  return progress?.status?.trim().toLowerCase() ?? "";
}

function translateProgressMessage(
  t: TFunction,
  progress?: UpdateProgressResponse | null,
  fallbackStage?: string,
) {
  const raw = progress?.message?.trim() ?? "";
  if (!raw) return t("auto_update.progress_default_message");
  const key = UPDATE_PROGRESS_MESSAGE_KEYS[raw.toLowerCase()];
  if (key) return t(key);
  if (fallbackStage && UPDATE_STAGE_LABEL_KEYS[fallbackStage]) {
    return t("auto_update.progress_message_stage_generic", {
      stage: stageLabel(t, fallbackStage),
    });
  }
  return raw;
}

function stageProgressSegment(stage: string, status: string) {
  if (status === "completed") return UPDATE_STAGE_PROGRESS_SEGMENTS.completed;
  if (status === "failed") {
    return UPDATE_STAGE_PROGRESS_SEGMENTS[stage] ?? UPDATE_STAGE_PROGRESS_SEGMENTS.failed;
  }
  return UPDATE_STAGE_PROGRESS_SEGMENTS[stage] ?? { start: 22, end: 78, durationMs: 9000 };
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function visualProgressTarget(status: string, stage: string, stageElapsedMs: number) {
  if (status === "idle") return 0;
  if (status === "completed") return 100;
  const segment = stageProgressSegment(stage, status);
  if (status === "failed" || segment.durationMs <= 0) {
    return segment.end;
  }
  const phase = Math.min(1, stageElapsedMs / segment.durationMs);
  const span = Math.max(0, segment.end - segment.start);
  return segment.start + span * easeOutCubic(phase);
}

function useAnimatedProgressValue(target: number, snap = false) {
  const [displayValue, setDisplayValue] = useState(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (snap || Math.abs(displayValue - target) < 0.1) {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setDisplayValue(target);
      return;
    }

    const tick = () => {
      setDisplayValue((current) => {
        const delta = target - current;
        if (Math.abs(delta) < 0.1) return target;
        const next = current + delta * 0.18;
        return delta > 0 ? Math.min(target, next) : Math.max(target, next);
      });
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [displayValue, snap, target]);

  return displayValue;
}

function useVisualProgressTarget(progress?: UpdateProgressResponse | null) {
  const stage = normalizedStage(progress);
  const status = normalizedProgressStatus(progress);
  const [now, setNow] = useState(() => Date.now());
  const markerRef = useRef({
    key: "",
    enteredAt: Date.now(),
  });
  const markerKey = `${status}:${stage}:${progress?.started_at ?? ""}:${progress?.finished_at ?? ""}`;

  useEffect(() => {
    if (markerRef.current.key === markerKey) return;
    markerRef.current = {
      key: markerKey,
      enteredAt: Date.now(),
    };
    setNow(Date.now());
  }, [markerKey]);

  useEffect(() => {
    if (status !== "running") return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, UPDATE_PROGRESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [status, stage]);

  if (status === "completed") return 100;
  return visualProgressTarget(status, stage, Math.max(0, now - markerRef.current.enteredAt));
}

function UpdateProgressConsole({
  candidate,
  progress,
}: {
  candidate: UpdateCheckResponse;
  progress?: UpdateProgressResponse | null;
}) {
  const { t } = useTranslation();
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
  const progressStatus = normalizedProgressStatus(progress);
  const isCompleted = progressStatus === "completed";
  const isFailed = progressStatus === "failed";
  const isRunning = progressStatus === "running";
  const progressTarget = useVisualProgressTarget(progress);
  const animatedPercent = useAnimatedProgressValue(progressTarget, isFailed);
  const progressMessage = translateProgressMessage(t, progress, stage);
  const StatusIcon = isCompleted
    ? CheckCircle2
    : isFailed
      ? XCircle
      : isRunning
        ? LoaderCircle
        : Circle;
  const statusTone = isCompleted ? "emerald" : isFailed ? "rose" : isRunning ? "sky" : "slate";
  const statusIconClass =
    statusTone === "emerald"
      ? "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20"
      : statusTone === "rose"
        ? "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20"
        : statusTone === "sky"
          ? "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20"
          : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-white/10 dark:text-white/60 dark:ring-white/10";
  const statusChipClass =
    statusTone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20"
      : statusTone === "rose"
        ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20"
        : statusTone === "sky"
          ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20"
          : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/60 dark:ring-white/10";
  const progressBarClass =
    statusTone === "emerald"
      ? "bg-emerald-500"
      : statusTone === "rose"
        ? "bg-rose-500"
        : statusTone === "sky"
          ? "bg-sky-500"
          : "bg-slate-400";

  return (
    <div
      data-testid="update-progress-console"
      className={`min-w-0 ${isCompleted ? "space-y-3" : "space-y-4"}`}
    >
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_45%),linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,1)_100%)] p-4 shadow-sm dark:border-neutral-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_42%),linear-gradient(180deg,_rgba(10,15,27,1)_0%,_rgba(8,12,22,1)_100%)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={[
                "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1",
                statusIconClass,
              ].join(" ")}
            >
              <StatusIcon size={18} className={isRunning ? "animate-spin" : ""} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("auto_update.progress_title")}
              </h3>
              <p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-white/60">
                {progressMessage}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium ring-1",
                statusChipClass,
              ].join(" ")}
            >
              {stageLabel(t, stage)}
            </span>
            <span className="font-mono text-lg font-semibold text-slate-900 dark:text-white">
              {Math.round(animatedPercent)}%
            </span>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
          <div
            className={[
              "relative h-full rounded-full transition-[width] duration-500 ease-out",
              progressBarClass,
            ].join(" ")}
            style={{ width: `${animatedPercent}%` }}
          >
            {isRunning ? (
              <span className="absolute inset-y-0 right-0 w-16 bg-white/30 blur-md dark:bg-white/20" />
            ) : null}
          </div>
        </div>

        <dl className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-white/60 bg-white/80 p-3 backdrop-blur-sm dark:border-white/8 dark:bg-white/5">
            <dt className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-white/45">
              {t("auto_update.progress_service_path")}
            </dt>
            <dd className="mt-2 break-words font-mono text-sm text-slate-900 dark:text-white">
              {currentVersion} <span className="text-slate-400">-&gt;</span> {targetVersion}
            </dd>
          </div>
          <div className="min-w-0 rounded-2xl border border-white/60 bg-white/80 p-3 backdrop-blur-sm dark:border-white/8 dark:bg-white/5">
            <dt className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-white/45">
              {t("auto_update.progress_ui_path")}
            </dt>
            <dd className="mt-2 break-words font-mono text-sm text-slate-900 dark:text-white">
              {currentUIVersion} <span className="text-slate-400">-&gt;</span> {targetUIVersion}
            </dd>
          </div>
        </dl>
      </section>
    </div>
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
  const progressStatus = normalizedProgressStatus(progress);
  const showProgressConsole = Boolean(progress && progressStatus !== "idle");
  const progressCompleted = showProgressConsole && progressStatus === "completed";
  const progressFailed = showProgressConsole && progressStatus === "failed";
  const activeUpdate =
    !progressCompleted && !progressFailed && (updating || progressStatus === "running");
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
  const handleReloadPage = () => {
    window.location.reload();
  };

  useEffect(() => {
    setReleaseNotesExpanded(false);
  }, [candidate?.latest_commit, candidate?.latest_ui_commit, open]);

  return (
    <Modal
      open={open}
      title={modalTitle}
      description={modalDescription}
      maxWidth="max-w-[min(92vw,900px)]"
      bodyHeightClassName={
        progressCompleted ? "max-h-[min(62vh,520px)]" : "max-h-[min(72vh,640px)]"
      }
      bodyTestId="update-details-modal-body"
      onClose={() => {
        if (!activeUpdate) onClose();
      }}
      footer={
        progressCompleted ? (
          <Button variant="primary" onClick={handleReloadPage}>
            {t("auto_update.refresh_page")}
          </Button>
        ) : (
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
        )
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
                  <dt className={versionCardLabelClass}>{t("auto_update.current_service")}</dt>
                  <dd className={versionCardValueClass}>{currentVersion}</dd>
                  {displayCandidate.current_commit ? (
                    <p className={versionCardMetaClass}>
                      {t("auto_update.commit")}: {shortCommit(displayCandidate.current_commit)}
                    </p>
                  ) : null}
                </div>
                <div className={versionCardClass}>
                  <dt className={versionCardLabelClass}>{t("auto_update.target_service")}</dt>
                  <dd className={versionCardValueClass}>{targetVersion}</dd>
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
                  <dt className={versionCardLabelClass}>{t("auto_update.current_ui")}</dt>
                  <dd className={versionCardValueClass}>{currentUIVersion}</dd>
                  {displayCandidate.current_ui_commit ? (
                    <p className={versionCardMetaClass}>
                      {t("auto_update.commit")}: {shortCommit(displayCandidate.current_ui_commit)}
                    </p>
                  ) : null}
                </div>
                <div className={versionCardClass}>
                  <dt className={versionCardLabelClass}>{t("auto_update.target_ui")}</dt>
                  <dd className={versionCardValueClass}>{targetUIVersion}</dd>
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
                  <dt className={versionCardLabelClass}>{t("auto_update.image")}</dt>
                  <dd data-testid="update-image-value" className={versionCardValueClass}>
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
