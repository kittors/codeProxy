import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import type {
  UpdateCheckResponse,
  UpdateProgressLogEntry,
  UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";
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
const UPDATE_STAGE_ORDER = ["preparing", "pulling", "restarting", "verifying", "completed"];
const UPDATE_LOG_MAX_VISIBLE_LINES = 60;
const UPDATE_LOG_FRAME_INTERVAL_MS = 1000 / 30;
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

function progressPercent(status: string, activeStageIndex: number) {
  if (status === "completed") return 100;
  const safeStageIndex = Math.max(0, activeStageIndex);
  if (status === "failed") {
    return Math.min(100, Math.max(14, ((safeStageIndex + 1) / UPDATE_STAGE_ORDER.length) * 100));
  }
  return Math.min(94, Math.max(10, ((safeStageIndex + 0.5) / UPDATE_STAGE_ORDER.length) * 100));
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

function formatLogTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function sameLogEntry(left: UpdateProgressLogEntry, right: UpdateProgressLogEntry) {
  return (
    left.timestamp === right.timestamp &&
    left.stream === right.stream &&
    left.message === right.message
  );
}

function findLogOverlap(previous: UpdateProgressLogEntry[], next: UpdateProgressLogEntry[]) {
  const maxOverlap = Math.min(previous.length, next.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    let matches = true;
    for (let index = 0; index < size; index += 1) {
      if (!sameLogEntry(previous[previous.length - size + index], next[index])) {
        matches = false;
        break;
      }
    }
    if (matches) return size;
  }
  return 0;
}

function sameLogEntries(left: UpdateProgressLogEntry[], right: UpdateProgressLogEntry[]) {
  return (
    left.length === right.length && left.every((entry, index) => sameLogEntry(entry, right[index]))
  );
}

function limitVisibleLogs(logs: UpdateProgressLogEntry[]) {
  return logs.slice(-UPDATE_LOG_MAX_VISIBLE_LINES);
}

function frameNow() {
  return window.performance?.now?.() ?? Date.now();
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

type AnimationFrameHandle =
  | { kind: "animation-frame"; id: number }
  | { kind: "timeout"; id: number };

function useSmoothUpdateLogs(sourceLogs: UpdateProgressLogEntry[], flushImmediately = false) {
  const [visibleLogs, setVisibleLogs] = useState<UpdateProgressLogEntry[]>([]);
  const visibleLogsRef = useRef<UpdateProgressLogEntry[]>([]);
  const queuedLogsRef = useRef<UpdateProgressLogEntry[]>([]);
  const frameHandleRef = useRef<AnimationFrameHandle | null>(null);
  const lastFrameTimeRef = useRef(0);

  const commitVisibleLogs = (
    updater:
      | UpdateProgressLogEntry[]
      | ((current: UpdateProgressLogEntry[]) => UpdateProgressLogEntry[]),
  ) => {
    setVisibleLogs((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      visibleLogsRef.current = next;
      return next;
    });
  };

  const cancelFrame = () => {
    const handle = frameHandleRef.current;
    if (!handle) return;
    if (handle.kind === "animation-frame" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(handle.id);
    } else {
      window.clearTimeout(handle.id);
    }
    frameHandleRef.current = null;
  };

  const scheduleFrame = () => {
    if (frameHandleRef.current || !queuedLogsRef.current.length) return;

    const flushFrame = (timestamp: number) => {
      frameHandleRef.current = null;
      if (!queuedLogsRef.current.length) return;

      if (timestamp - lastFrameTimeRef.current < UPDATE_LOG_FRAME_INTERVAL_MS) {
        scheduleFrame();
        return;
      }

      lastFrameTimeRef.current = timestamp;
      const nextLog = queuedLogsRef.current.shift();
      if (nextLog) {
        commitVisibleLogs((current) => limitVisibleLogs([...current, nextLog]));
      }
      scheduleFrame();
    };

    if (typeof window.requestAnimationFrame === "function") {
      frameHandleRef.current = {
        kind: "animation-frame",
        id: window.requestAnimationFrame(flushFrame),
      };
    } else {
      frameHandleRef.current = {
        kind: "timeout",
        id: window.setTimeout(() => flushFrame(frameNow()), UPDATE_LOG_FRAME_INTERVAL_MS),
      };
    }
  };

  useEffect(() => cancelFrame, []);

  useEffect(() => {
    const targetLogs = limitVisibleLogs(sourceLogs);
    const currentVisibleLogs = visibleLogsRef.current;
    const currentQueuedLogs = queuedLogsRef.current;

    if (flushImmediately) {
      queuedLogsRef.current = [];
      cancelFrame();
      if (!sameLogEntries(currentVisibleLogs, targetLogs)) {
        commitVisibleLogs(targetLogs);
      }
      return;
    }

    if (!targetLogs.length) {
      queuedLogsRef.current = [];
      cancelFrame();
      if (currentVisibleLogs.length) {
        commitVisibleLogs([]);
      }
      return;
    }

    const plannedLogs = limitVisibleLogs([...currentVisibleLogs, ...currentQueuedLogs]);
    const overlap = findLogOverlap(plannedLogs, targetLogs);
    const overlapStart = plannedLogs.length - overlap;
    const visibleOverlap =
      overlap > 0 && overlapStart < currentVisibleLogs.length
        ? currentVisibleLogs.slice(overlapStart)
        : [];
    const hadPendingLogs = currentQueuedLogs.length > 0;
    const nextVisibleLogs = visibleOverlap.length ? visibleOverlap : targetLogs.slice(0, 1);
    const nextQueuedLogs = targetLogs.slice(nextVisibleLogs.length);

    queuedLogsRef.current = nextQueuedLogs;
    if (!sameLogEntries(currentVisibleLogs, nextVisibleLogs)) {
      lastFrameTimeRef.current = frameNow();
      commitVisibleLogs(nextVisibleLogs);
    }
    if (nextQueuedLogs.length && (!hadPendingLogs || !frameHandleRef.current)) {
      scheduleFrame();
    }
  }, [flushImmediately, sourceLogs]);

  return visibleLogs;
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
  const dockerImage =
    [progress?.target_image, progress?.target_tag].filter(Boolean).join(":") ||
    [candidate.docker_image, candidate.docker_tag].filter(Boolean).join(":") ||
    "--";
  const progressStatus = normalizedProgressStatus(progress);
  const rawStageIndex = UPDATE_STAGE_ORDER.indexOf(stage);
  const activeStageIndex = Math.max(0, rawStageIndex);
  const isCompleted = progressStatus === "completed";
  const isFailed = progressStatus === "failed";
  const isRunning = progressStatus === "running";
  const percent = progressPercent(progressStatus, activeStageIndex);
  const animatedPercent = useAnimatedProgressValue(percent, isCompleted || isFailed);
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
    <section
      data-testid="update-progress-console"
      className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={[
                "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1",
                statusIconClass,
              ].join(" ")}
            >
              <StatusIcon size={16} className={isRunning ? "animate-spin" : ""} />
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
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
              {Math.round(animatedPercent)}%
            </span>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div
            className={[
              "h-full rounded-full transition-[width] duration-700 ease-out",
              progressBarClass,
            ].join(" ")}
            style={{ width: `${animatedPercent}%` }}
          />
        </div>
      </div>

      <dl className="grid min-w-0 gap-2 lg:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
          <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
            {t("auto_update.progress_service_path")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
            {currentVersion} <span className="text-slate-400">-&gt;</span> {targetVersion}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
          <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
            {t("auto_update.progress_ui_path")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
            {currentUIVersion} <span className="text-slate-400">-&gt;</span> {targetUIVersion}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50 lg:col-span-2">
          <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
            {t("auto_update.image")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
            {dockerImage}
          </dd>
        </div>
      </dl>

      <ol className="grid gap-2 text-xs sm:grid-cols-5">
        {UPDATE_STAGE_ORDER.map((item, index) => {
          const completed = isCompleted || (!isFailed && index < activeStageIndex);
          const active = !isCompleted && item === stage;
          const StageIcon = completed
            ? CheckCircle2
            : active && isFailed
              ? XCircle
              : active && isRunning
                ? LoaderCircle
                : Circle;
          return (
            <li
              key={item}
              className={[
                "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                completed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                  : active && isFailed
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
                    : active
                      ? "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/15 dark:text-sky-100"
                      : "border-slate-200 bg-white/70 text-slate-500 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/45",
              ].join(" ")}
            >
              <StageIcon size={13} className={active && isRunning ? "animate-spin" : ""} />
              <span className="min-w-0 truncate">{stageLabel(t, item)}</span>
            </li>
          );
        })}
      </ol>
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
