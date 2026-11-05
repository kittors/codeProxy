import { useTranslation } from "react-i18next";
import { formatFixedNumber, type RequestCacheUse } from "@code-proxy/domain";
import { HoverTooltip } from "@code-proxy/ui";
import { RequestLogUsageMetricValue } from "./RequestLogMetricChips";

const metricClassName = (value: number) => (value > 0 ? "font-medium text-ink" : "text-ink-4");

/**
 * One side of a request's cache use: what it read from the upstream's cache, or
 * wrote to it.
 *
 * A request whose cache use is unknown shows "—", not 0: its upstream reported
 * no cache accounting, or it was logged before reads and writes were stored
 * apart. For such an old row the tooltip gives the one figure it has, which
 * may be either reads or writes.
 */
export function RequestLogCacheCell({
  use,
  side,
}: {
  use: RequestCacheUse;
  side: "read" | "write";
}) {
  const { t } = useTranslation();
  if (use.kind === "legacy") {
    // An older backend: cached_tokens, which is shown in the read column only.
    const value = side === "read" ? use.cachedTokens : 0;
    return <RequestLogUsageMetricValue value={value} className={metricClassName(value)} />;
  }
  if (use.kind === "unknown") {
    const hint =
      use.legacyCachedTokens > 0
        ? t("request_logs.cache_unknown_legacy", {
            cached: formatFixedNumber(use.legacyCachedTokens, { fractionDigits: 0 }),
          })
        : t("request_logs.cache_unknown");
    return (
      <HoverTooltip content={hint} placement="top" className="cursor-help">
        <span className="block text-ink-4" aria-label={hint}>
          —
        </span>
      </HoverTooltip>
    );
  }
  const value = side === "read" ? use.readTokens : use.writeTokens;
  return <RequestLogUsageMetricValue value={value} className={metricClassName(value)} />;
}
