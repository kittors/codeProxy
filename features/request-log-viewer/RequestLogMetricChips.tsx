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
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs whitespace-nowrap",
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
      className={
        streaming
          ? "inline-flex shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-600 dark:border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-300"
          : "inline-flex shrink-0 items-center justify-center rounded-full border border-slate-900/8 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-neutral-900 dark:text-white/55"
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
