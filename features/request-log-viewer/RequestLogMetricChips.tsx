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

export function RequestLogMetricChip({
  ariaLabel,
  value,
  className,
}: {
  ariaLabel: string;
  value: string;
  className: string;
}) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs whitespace-nowrap",
        className,
      ].join(" ")}
      aria-label={ariaLabel}
    >
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

export function RequestLogModeChip({ label, streaming }: { label: string; streaming: boolean }) {
  return (
    <span
      // 流式 / 非流式只是请求方式，不是状态：都用中性灰，流式垫一层淡底、稍重一档以便扫读。
      className={
        streaming
          ? "inline-flex shrink-0 items-center justify-center rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink-2 dark:bg-white/[0.07]"
          : "inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium text-ink-3"
      }
    >
      {label}
    </span>
  );
}

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
