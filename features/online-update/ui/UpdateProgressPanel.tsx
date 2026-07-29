import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, ChevronDown, CircleAlert, Loader, Minus, Terminal, WifiOff } from "lucide-react";
import type { UpdateProgressResponse } from "@code-proxy/api-client/endpoints/update";
import { Button } from "@code-proxy/ui";
import type { UpdateLinkState } from "../progress/progressStream";
import { formatBytes, progressPercent } from "../model/updateModel";

const STAGE_LABEL_KEYS: Record<string, string> = {
  preparing: "auto_update.progress_stage_preparing",
  pulling: "auto_update.progress_stage_pulling",
  dependencies: "auto_update.progress_stage_starting_dependencies",
  application: "auto_update.progress_stage_recreating",
  verifying: "auto_update.progress_stage_verifying",
  finalizing: "auto_update.progress_stage_finalizing",
  completed: "auto_update.progress_stage_completed",
  failed: "auto_update.progress_stage_failed",
  idle: "auto_update.progress_stage_idle",
};

const stageLabel = (t: TFunction, id: string) =>
  t(STAGE_LABEL_KEYS[id] ?? "auto_update.progress_stage_unknown");

/**
 * Translates the updater's message code, falling back to the raw message.
 *
 * A plan may introduce stages this build has never heard of, so an unknown code
 * must degrade to the server's own wording rather than to an error.
 */
const progressMessage = (t: TFunction, progress?: UpdateProgressResponse | null) => {
  const raw = progress?.message?.trim() ?? "";
  const code = progress?.message_code?.trim().toLowerCase() ?? "";
  if (code && /^[a-z0-9_]+$/.test(code)) {
    return t(`auto_update.progress_message_${code}`, {
      defaultValue: raw || t("auto_update.progress_default_message"),
    });
  }
  return raw || t("auto_update.progress_default_message");
};

function StageTimeline({ progress }: { progress?: UpdateProgressResponse | null }) {
  const { t } = useTranslation();
  const stages = progress?.stages ?? [];
  if (stages.length === 0) return null;

  return (
    <ol data-testid="update-stage-timeline" className="mt-4 grid gap-1.5">
      {stages.map((stage) => {
        const state = stage.state ?? "pending";
        const icon =
          state === "done" ? (
            <Check size={12} className="text-emerald-600 dark:text-emerald-300" />
          ) : state === "failed" ? (
            <CircleAlert size={12} className="text-rose-600 dark:text-rose-300" />
          ) : state === "skipped" ? (
            <Minus size={12} className="text-slate-400 dark:text-white/35" />
          ) : state === "active" ? (
            <Loader size={12} className="animate-spin text-sky-600 dark:text-sky-300" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-white/20" />
          );

        return (
          <li key={stage.id} className="flex items-center gap-2 text-xs">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
            <span
              className={
                state === "active"
                  ? "font-medium text-slate-900 dark:text-white"
                  : state === "skipped"
                    ? "text-slate-400 line-through dark:text-white/35"
                    : "text-slate-600 dark:text-white/55"
              }
            >
              {stageLabel(t, stage.id ?? "")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The streamed docker output.
 *
 * The updater has always sent these and the translations have always existed, but
 * nothing rendered them — so when an update stalled there was no way to see why
 * without shelling into the host.
 */
function LogConsole({ progress }: { progress?: UpdateProgressResponse | null }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const logs = progress?.logs ?? [];

  useEffect(() => {
    if (!expanded) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [expanded, logs.length]);

  return (
    <div className="mt-4 border-t border-slate-900/8 pt-3 dark:border-white/8">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
      >
        <Terminal size={12} />
        {t("auto_update.progress_logs")}
        <span className="text-slate-400 dark:text-white/40">
          {t("auto_update.progress_log_count", { count: logs.length })}
        </span>
        <ChevronDown
          size={12}
          className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </Button>

      {expanded ? (
        <div
          ref={scrollRef}
          data-testid="update-log-console"
          className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3 dark:bg-neutral-950"
        >
          {logs.length === 0 ? (
            <p className="font-mono text-xs text-slate-400">
              {t("auto_update.progress_logs_empty")}
            </p>
          ) : (
            logs.map((entry, index) => (
              <p
                key={`${entry.timestamp ?? index}-${index}`}
                className={
                  entry.stream === "stderr"
                    ? "whitespace-pre-wrap break-all font-mono text-xs leading-5 text-rose-300"
                    : "whitespace-pre-wrap break-all font-mono text-xs leading-5 text-slate-300"
                }
              >
                {entry.message}
              </p>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UpdateProgressPanel({
  progress,
  link,
  stale,
  failed,
  completed,
}: {
  progress?: UpdateProgressResponse | null;
  link: UpdateLinkState;
  stale: boolean;
  failed: boolean;
  completed: boolean;
}) {
  const { t } = useTranslation();
  const percent = progressPercent(progress);
  const running = !completed && !failed;

  // The stream dropping mid-update is the application container being recreated —
  // expected, and worth saying out loud. Showing a frozen bar instead was the main
  // reason a working update looked broken.
  const reconnecting = running && link === "reconnecting";

  const tone = completed ? "emerald" : failed ? "rose" : "sky";
  const barClass =
    tone === "emerald" ? "bg-emerald-500" : tone === "rose" ? "bg-rose-500" : "bg-sky-500";

  const bytes = formatBytes(progress?.progress_bytes);
  const totalBytes = formatBytes(progress?.progress_total_bytes);

  // Step counts are the only progress detail an older updater reports — it sends
  // progress_current/progress_total but no stage timeline. Rendering them keeps
  // those deployments from showing a bare percentage with no context.
  const steps =
    typeof progress?.progress_current === "number" &&
    typeof progress.progress_total === "number" &&
    progress.progress_total > 0
      ? t("auto_update.progress_detail_steps", {
          current: progress.progress_current,
          total: progress.progress_total,
        })
      : "";

  return (
    <div data-testid="update-progress-console" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-slate-700 dark:text-white/70">
          {progressMessage(t, progress)}
        </p>
        <span
          data-testid="update-progress-percent"
          className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white"
        >
          {percent === null ? "--" : `${Math.round(percent)}%`}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div
          data-testid="update-progress-fill"
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClass}`}
          // A null percent renders an empty bar rather than a full one; see
          // progressPercent for why that distinction matters.
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>

      {bytes && totalBytes ? (
        <p
          data-testid="update-progress-bytes"
          className="mt-1.5 font-mono text-xs text-slate-500 dark:text-white/45"
        >
          {bytes} / {totalBytes}
        </p>
      ) : null}

      {steps ? (
        <p
          data-testid="update-progress-details"
          className="mt-1.5 text-xs text-slate-500 dark:text-white/45"
        >
          {steps}
        </p>
      ) : null}

      {reconnecting ? (
        <p
          data-testid="update-reconnecting"
          className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50 p-2.5 text-xs leading-5 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200"
        >
          <WifiOff size={14} className="mt-0.5 shrink-0" />
          {stale ? t("auto_update.reconnecting_slow") : t("auto_update.reconnecting")}
        </p>
      ) : null}

      <StageTimeline progress={progress} />
      <LogConsole progress={progress} />
    </div>
  );
}
