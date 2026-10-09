import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import { formatDelta, type MonitorDelta } from "../model/monitorDelta";

const TONE_CLASS: Record<MonitorDelta["tone"], string> = {
  good: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  bad: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
};

/** 环比小胶囊：箭头 + 变化量，颜色按指标的好坏方向（见 monitorDelta）。 */
export function DeltaBadge({ delta, hint }: { delta: MonitorDelta; hint: string }) {
  if (delta.noBaseline) {
    return (
      <HoverTooltip content={hint}>
        <span className="rounded-full bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-3 dark:bg-white/[0.07]">
          —
        </span>
      </HoverTooltip>
    );
  }
  const Icon =
    delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  return (
    <HoverTooltip content={hint}>
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ${TONE_CLASS[delta.tone]}`}
      >
        <Icon size={14} strokeWidth={2} aria-hidden="true" className="-my-0.5" />
        {formatDelta(delta)}
      </span>
    </HoverTooltip>
  );
}
