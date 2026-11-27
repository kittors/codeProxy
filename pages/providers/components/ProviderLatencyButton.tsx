import { Zap } from "@code-proxy/ui/icons";
import { Loader } from "satin-ui/react";
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
 * 延迟分档：快是绿、出错是红。简约风格与代理池一致——慢是琥珀，200–500ms 属于正常范围，
 * 中性数字就够了；多彩风格是三档绿 / 琥珀 / 红。
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
      ? "text-sn-label3"
      : latencyMs < 200
        ? "text-emerald-700 dark:text-emerald-300"
        : latencyMs < 500
          ? "text-sn-label2 colorful:text-amber-700 colorful:dark:text-amber-300"
          : "text-amber-700 dark:text-amber-300 colorful:text-rose-700 colorful:dark:text-rose-300";
  const label = baseUrl
    ? `Check latency: ${baseUrl}`
    : "No base URL configured";

  return (
    <button
      type="button"
      className={[
        "sn-btn !h-5 shrink-0 gap-1 !rounded-md !bg-sn-label/[0.05] !px-1.5 !text-2xs font-semibold leading-none tabular-nums !shadow-none hover:!bg-sn-label/[0.08] dark:!bg-white/[0.07] dark:hover:!bg-white/[0.1]",
        entry.loading
          ? "!text-sn-label3"
          : entry.error
            ? "!text-rose-700 dark:!text-rose-300"
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
        <Loader variant="arc" size={10} label={label} />
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
