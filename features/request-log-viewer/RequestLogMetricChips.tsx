import type { UsageMetricVariant } from "@code-proxy/domain";
import {
  formatFixedNumber,
  formatUsageMetricCost,
  formatUsageMetricNumber,
  formatUsageMetricTooltipCost,
  formatUsageMetricTooltipNumber,
  isUsageMetricCompact,
} from "@code-proxy/domain";
import { HoverTooltip } from "@code-proxy/ui";

export function RequestLogUsageMetricValue({
  value,
  variant = "number",
  compact = false,
  className,
}: {
  value: number;
  variant?: UsageMetricVariant;
  compact?: boolean;
  className?: string;
}) {
  const useCompact = compact && isUsageMetricCompact(value, variant);
  const display =
    variant === "currency"
      ? useCompact
        ? formatUsageMetricCost(value)
        : formatUsageMetricTooltipCost(value)
      : useCompact
        ? formatUsageMetricNumber(value)
        : formatFixedNumber(value, { fractionDigits: 0 });
  const tooltip =
    variant === "currency"
      ? formatUsageMetricTooltipCost(value)
      : formatUsageMetricTooltipNumber(value);

  return (
    <HoverTooltip
      content={tooltip}
      disabled={!useCompact}
      placement="top"
      className={useCompact ? "cursor-help" : undefined}
    >
      <span className={["block min-w-0 truncate", className].filter(Boolean).join(" ")}>
        {display}
      </span>
    </HoverTooltip>
  );
}
