import { Loader2, Zap } from "lucide-react";
import { formatLatency } from "@features/provider-latency";

export interface ProviderLatencyEntry {
  latencyMs: number | null;
  loading: boolean;
  error: boolean;
}

/**
 * Latency probe badge, styled like the card's other header badges.
 *
 * Extracted from ProviderKeyListCard so the header can decide whether it has
 * anything to render before it renders a row for it.
 *
 * 延迟分档与代理池一致：快是绿、慢是琥珀、出错是红；200–500ms 属于正常范围，中性数字就够了
 * （以前三档绿 / 琥珀 / 红，一排卡片几乎每张都带颜色）。
 */
export function ProviderLatencyButton({
  entry,
  baseUrl,
  onCheck,
}: {
  entry: ProviderLatencyEntry;
  baseUrl: string;
  onCheck: () => void;
}) {
  const { latencyMs } = entry;
  const latencyColor =
    latencyMs === null
      ? "text-ink-3"
      : latencyMs < 200
        ? "text-emerald-700 dark:text-emerald-300"
        : latencyMs < 500
          ? "text-ink-2"
          : "text-amber-700 dark:text-amber-300";
  const label = baseUrl
    ? `Check latency: ${baseUrl}`
    : "No base URL configured";

  return (
    <button
      type="button"
      className={[
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-ink/[0.05] px-1.5 text-2xs font-semibold leading-none tabular-nums transition-colors hover:bg-ink/[0.08] focus-visible:outline-none focus-visible:shadow-control-focus dark:bg-white/[0.07] dark:hover:bg-white/[0.1]",
        entry.loading
          ? "text-ink-3"
          : entry.error
            ? "text-rose-700 dark:text-rose-300"
            : latencyColor,
      ].join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        if (baseUrl) onCheck();
      }}
      aria-label={label}
      title={label}
    >
      {entry.loading ? (
        <Loader2 size={10} className="animate-spin" />
      ) : entry.error ? (
        <span>×</span>
      ) : latencyMs !== null ? (
        <span>{formatLatency(latencyMs)}</span>
      ) : (
        <Zap size={10} />
      )}
    </button>
  );
}
