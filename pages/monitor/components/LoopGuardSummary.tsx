import { useTranslation } from "react-i18next";
import type { MonitorLoopGuard } from "@code-proxy/api-client";
import { formatMonitorCompact, formatMonitorCost } from "../model/monitorFormat";

/**
 * Whether loop protection stopped anything in the window. A backend without it sends
 * no summary at all, and one with it sends zeros for tenants that never turned a check
 * on: neither gets a section that only says "0".
 */
export const hasLoopGuardActivity = (guard: MonitorLoopGuard | null): guard is MonitorLoopGuard =>
  guard !== null && guard.reply_loops + guard.tool_loops > 0;

/**
 * What loop protection stopped, as part of the failure analysis: its interceptions are
 * failed requests of their own kind, counted in the failures above them, and a reader
 * who sees them there should know they were stopped on purpose.
 *
 * The saving is the backend's estimate and covers answered tool-call loops only; a row
 * with nothing to show is left out rather than shown as zero.
 */
export function LoopGuardSummary({ guard }: { guard: MonitorLoopGuard }) {
  const { t } = useTranslation();
  const rows = [
    {
      key: "reply_loops",
      label: t("monitor_center.loop_guard.reply_loops"),
      value: guard.reply_loops,
    },
    {
      key: "tool_loops",
      label: t("monitor_center.loop_guard.tool_loops"),
      value: guard.tool_loops,
    },
  ].filter((row) => row.value > 0);

  return (
    <section aria-label={t("monitor_center.loop_guard.title")} className="space-y-1">
      <h4 className="text-xs font-medium text-ink-3">{t("monitor_center.loop_guard.title")}</h4>
      <dl className="space-y-1 px-2.5 text-xs">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-ink-2">{row.label}</dt>
            <dd className="shrink-0 font-semibold tabular-nums text-amber-600 dark:text-amber-300">
              {formatMonitorCompact(row.value)}
            </dd>
          </div>
        ))}
        {guard.estimated_saved_cost > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-ink-2">{t("monitor_center.loop_guard.saved")}</dt>
            <dd className="shrink-0 tabular-nums text-ink-2">
              {formatMonitorCost(guard.estimated_saved_cost)}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="px-2.5 text-xs text-ink-3">{t("monitor_center.loop_guard.hint")}</p>
    </section>
  );
}
