import type { QuotaMetric } from "@code-proxy/api-client";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const usdAmountFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const safeAmount = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;

/**
 * 按度量格式化一个额度或用量：花费是美元，请求次数是整数，Token 数量级大，
 * 一万以上用 K / M / B 缩写（表格里 12,500,000 这种长串既占地方又难比较）。
 */
export const formatQuotaAmount = (
  metric: QuotaMetric,
  value: number | null | undefined,
  options: { compact?: boolean } = {},
): string => {
  const amount = safeAmount(value);
  if (metric === "cost") {
    // 列表格子很窄：一千美元以上缩写成 $1.2K，否则 "$612.4 / $1,000" 会被截断。
    return options.compact && amount >= 1000 ? usdCompactFormatter.format(amount) : usdFormatter.format(amount);
  }
  if (metric === "tokens" || options.compact) {
    return amount >= 10_000 ? compactFormatter.format(amount) : integerFormatter.format(amount);
  }
  return integerFormatter.format(amount);
};

/** 消费事实（今日、累计花了多少）精确到分；额度上限是整美元，用 formatQuotaAmount。 */
export const formatUsdAmount = (value: number | null | undefined): string =>
  usdAmountFormatter.format(safeAmount(value));

export type UsageTone = "healthy" | "warning" | "danger";

/** 用量占比：上限为 0（不限制）时没有占比。 */
export const usageRatio = (used: number | null | undefined, limit: number): number =>
  limit > 0 ? safeAmount(used) / limit : 0;

/** 用满（≥100%）红色，接近上限（≥80%）琥珀，其余正常。 */
export const usageTone = (ratio: number): UsageTone => {
  if (ratio >= 1) return "danger";
  if (ratio >= 0.8) return "warning";
  return "healthy";
};

/*
 * 进度条颜色跟随「外观 → 进度条」设置：语义模式下正常是绿色渐变、接近上限琥珀、用尽红色；
 * 强调色模式下正常时用强调色。与 features/quota-preview 的额度条是同一套档位颜色。
 */
export const USAGE_BAR_FILL: Record<UsageTone, string> = {
  healthy:
    "bg-accent bar-semantic:bg-gradient-to-r bar-semantic:from-emerald-400 bar-semantic:to-emerald-500 bar-semantic:dark:from-emerald-500 bar-semantic:dark:to-emerald-400",
  warning:
    "bg-amber-500 dark:bg-amber-400 bar-semantic:bg-gradient-to-r bar-semantic:from-amber-300 bar-semantic:to-amber-500 bar-semantic:dark:from-amber-500 bar-semantic:dark:to-amber-300",
  danger:
    "bg-rose-500 dark:bg-rose-400 bar-semantic:bg-gradient-to-r bar-semantic:from-rose-400 bar-semantic:to-rose-500 bar-semantic:dark:from-rose-500 bar-semantic:dark:to-rose-400",
};

export const USAGE_BAR_TRACK: Record<UsageTone, string> = {
  healthy: "bg-track bar-semantic:bg-emerald-500/12 bar-semantic:dark:bg-emerald-400/15",
  warning: "bg-track bar-semantic:bg-amber-500/15 bar-semantic:dark:bg-amber-400/15",
  danger: "bg-track bar-semantic:bg-rose-500/12 bar-semantic:dark:bg-rose-400/15",
};

export const USAGE_TEXT: Record<UsageTone, string> = {
  healthy: "text-ink-2",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-rose-600 dark:text-rose-400",
};
