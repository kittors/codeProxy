export type CompactNumberUnit = {
  value: number;
  suffix: string;
};

export type CompactNumberParts = {
  value: number;
  displayValue: number;
  suffix: string;
  text: string;
  compact: boolean;
};

export type CompactNumberOptions = {
  locale?: string;
  units?: CompactNumberUnit[];
  threshold?: number;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  standardMaximumFractionDigits?: number;
  standardMinimumFractionDigits?: number;
};

export type FixedNumberOptions = {
  locale?: string;
  fractionDigits?: number;
};

export type UsageMetricFormatOptions = {
  locale?: string;
};

export type UsageMetricVariant = "number" | "currency";

export const USAGE_METRIC_COMPACT_OPTIONS = {
  threshold: 10_000,
  maximumFractionDigits: 1,
  standardMaximumFractionDigits: 0,
} satisfies CompactNumberOptions;

export const USAGE_COST_COMPACT_OPTIONS = {
  threshold: 10_000,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  standardMinimumFractionDigits: 4,
  standardMaximumFractionDigits: 4,
} satisfies CompactNumberOptions;

const DEFAULT_COMPACT_UNITS: CompactNumberUnit[] = [
  { value: 1, suffix: "" },
  { value: 1_000, suffix: "K" },
  { value: 1_000_000, suffix: "M" },
  { value: 1_000_000_000, suffix: "B" },
  { value: 1_000_000_000_000, suffix: "T" },
  { value: 1_000_000_000_000_000, suffix: "P" },
  { value: 1_000_000_000_000_000_000, suffix: "E" },
];

const toFiniteNumber = (value: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatNumberWithOptions = (
  value: number,
  locale: string | undefined,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
) =>
  value.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });

export function formatFixedNumber(value: number, options: FixedNumberOptions = {}): string {
  const fractionDigits = options.fractionDigits ?? 2;
  return formatNumberWithOptions(
    toFiniteNumber(value),
    options.locale,
    fractionDigits,
    fractionDigits,
  );
}

export function getCompactNumberParts(
  value: number,
  options: CompactNumberOptions = {},
): CompactNumberParts {
  const num = toFiniteNumber(value);
  const abs = Math.abs(num);
  const threshold = options.threshold ?? 1_000;
  const units = [...(options.units ?? DEFAULT_COMPACT_UNITS)].sort((a, b) => a.value - b.value);
  const fallbackUnit = units[0] ?? { value: 1, suffix: "" };
  const unit =
    abs >= threshold
      ? ([...units].reverse().find((candidate) => abs >= candidate.value) ?? fallbackUnit)
      : fallbackUnit;
  const compact = unit.value > 1;
  const displayValue = compact ? num / unit.value : num;
  const maximumFractionDigits = compact
    ? (options.maximumFractionDigits ?? 1)
    : (options.standardMaximumFractionDigits ?? 0);
  const minimumFractionDigits = compact
    ? (options.minimumFractionDigits ?? 0)
    : (options.standardMinimumFractionDigits ?? 0);

  return {
    value: num,
    displayValue,
    suffix: unit.suffix,
    compact,
    text: `${formatNumberWithOptions(
      displayValue,
      options.locale,
      minimumFractionDigits,
      maximumFractionDigits,
    )}${unit.suffix}`,
  };
}

export function formatPerMinuteValue(value: number): string {
  const num = toFiniteNumber(value);
  const abs = Math.abs(num);
  if (abs >= 1000) return Math.round(num).toLocaleString();
  if (abs >= 100) return num.toFixed(0);
  if (abs >= 10) return num.toFixed(1);
  return num.toFixed(2);
}

export function formatCompactNumber(value: number, options: CompactNumberOptions = {}): string {
  return getCompactNumberParts(value, {
    standardMaximumFractionDigits: 2,
    ...options,
  }).text;
}

export function formatCompactUsd(value: number, options: CompactNumberOptions = {}): string {
  return `$${
    getCompactNumberParts(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      standardMinimumFractionDigits: 4,
      standardMaximumFractionDigits: 4,
      ...options,
    }).text
  }`;
}

export function formatUsd(value: number, options: FixedNumberOptions = {}): string {
  return `$${formatFixedNumber(value, {
    locale: options.locale,
    fractionDigits: options.fractionDigits ?? 2,
  })}`;
}

export function formatUsageMetricNumber(
  value: number,
  options: UsageMetricFormatOptions = {},
): string {
  return formatCompactNumber(value, {
    ...USAGE_METRIC_COMPACT_OPTIONS,
    locale: options.locale,
  });
}

export function formatUsageMetricTooltipNumber(
  value: number,
  options: UsageMetricFormatOptions = {},
): string {
  return formatFixedNumber(value, { locale: options.locale, fractionDigits: 2 });
}

export function formatUsageMetricCost(
  value: number,
  options: UsageMetricFormatOptions = {},
): string {
  return formatCompactUsd(value, {
    ...USAGE_COST_COMPACT_OPTIONS,
    locale: options.locale,
  });
}

export function formatUsageMetricTooltipCost(
  value: number,
  options: UsageMetricFormatOptions = {},
): string {
  return formatUsd(value, { locale: options.locale, fractionDigits: 4 });
}

export function isUsageMetricCompact(
  value: number,
  variant: UsageMetricVariant = "number",
): boolean {
  return getCompactNumberParts(
    value,
    variant === "currency" ? USAGE_COST_COMPACT_OPTIONS : USAGE_METRIC_COMPACT_OPTIONS,
  ).compact;
}

export function formatUsageMetricRate(value: number): string {
  return `${formatFixedNumber(value, { fractionDigits: 2 })}%`;
}

export function formatHourLabel(date: Date): string {
  if (!(date instanceof Date)) return "";
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  return `${month}-${day} ${hour}:00`;
}

export function formatDayLabel(date: Date): string {
  if (!(date instanceof Date)) return "";
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}
