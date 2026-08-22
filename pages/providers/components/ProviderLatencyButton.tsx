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
      ? "text-slate-500 dark:text-white/55"
      : latencyMs < 200
        ? "text-emerald-700 dark:text-emerald-300"
        : latencyMs < 500
          ? "text-amber-700 dark:text-amber-300"
          : "text-rose-700 dark:text-rose-300";
  const label = baseUrl
    ? `Check latency: ${baseUrl}`
    : "No base URL configured";

  return (
    <button
      type="button"
      className={[
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 text-2xs font-semibold leading-none tabular-nums transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 dark:bg-white/10 dark:hover:bg-white/15 dark:focus-visible:ring-white/20",
        entry.loading
          ? "text-slate-500 dark:text-white/55"
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
