import type { AuthFileItem } from "@code-proxy/api-client";
import type { QuotaItem } from "@features/quota-preview/quota-types";
import {
  clampPercent,
  isRecord,
  normalizeNumberValue,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@features/quota-preview/quota-normalizers";

type XaiBillingCent = { val?: number | string };

type XaiBillingPeriod = {
  type?: string;
  start?: string;
  end?: string;
};

type XaiBillingProductUsage = {
  product?: string;
  usagePercent?: number | string | null;
  usage_percent?: number | string | null;
};

export type XaiBillingConfig = {
  currentPeriod?: XaiBillingPeriod | null;
  current_period?: XaiBillingPeriod | null;
  creditUsagePercent?: number | string | null;
  credit_usage_percent?: number | string | null;
  productUsage?: XaiBillingProductUsage[] | null;
  product_usage?: XaiBillingProductUsage[] | null;
  monthlyLimit?: XaiBillingCent | number | string | null;
  monthly_limit?: XaiBillingCent | number | string | null;
  used?: XaiBillingCent | number | string | null;
  onDemandCap?: XaiBillingCent | number | string | null;
  on_demand_cap?: XaiBillingCent | number | string | null;
  onDemandUsed?: XaiBillingCent | number | string | null;
  on_demand_used?: XaiBillingCent | number | string | null;
  billingPeriodStart?: string;
  billing_period_start?: string;
  billingPeriodEnd?: string;
  billing_period_end?: string;
};

export type XaiBillingPayload = {
  config?: XaiBillingConfig | null;
};

type XaiBillingPeriodType = "weekly" | "monthly" | "unknown";

type XaiProductUsageSummary = {
  product: string;
  usagePercent: number | null;
};

export type XaiBillingSummary = {
  periodType: XaiBillingPeriodType;
  usagePercent: number | null;
  periodStart?: string;
  periodEnd?: string;
  productUsage: XaiProductUsageSummary[];
  monthlyLimitCents: number | null;
  usedCents: number | null;
  includedUsedCents: number | null;
  onDemandCapCents: number | null;
  onDemandUsedCents: number | null;
  onDemandUsedPercent: number | null;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  usedPercent: number | null;
};

/** xAI weekly billing window length used for cycle tracking snapshots. */
export const XAI_WEEKLY_WINDOW_SECONDS = 604_800;

export const parseXaiBillingPayload = (payload: unknown): XaiBillingPayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as XaiBillingPayload;
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? (payload as XaiBillingPayload) : null;
};

const normalizeXaiCentValue = (
  value: XaiBillingCent | number | string | null | undefined,
): number | null => {
  if (value === undefined || value === null) return null;
  if (isRecord(value)) return normalizeNumberValue(value.val);
  return normalizeNumberValue(value);
};

const resolveXaiPeriodType = (period?: XaiBillingPeriod | null): XaiBillingPeriodType => {
  const rawType = normalizeStringValue(period?.type)?.toLowerCase() ?? "";
  if (rawType.includes("weekly")) return "weekly";
  if (rawType.includes("monthly")) return "monthly";
  return "unknown";
};

const normalizeXaiProductUsage = (
  productUsage: XaiBillingProductUsage[] | null | undefined,
): XaiProductUsageSummary[] => {
  if (!Array.isArray(productUsage)) return [];
  return productUsage
    .map((item, index): XaiProductUsageSummary | null => {
      if (!item || typeof item !== "object") return null;
      const product = normalizeStringValue(item.product) ?? `Product ${index + 1}`;
      const usagePercent = normalizeNumberValue(item.usagePercent ?? item.usage_percent);
      return { product, usagePercent };
    })
    .filter((item): item is XaiProductUsageSummary => item !== null);
};

const emptyXaiBillingSummary = (): XaiBillingSummary => ({
  periodType: "unknown",
  usagePercent: null,
  productUsage: [],
  monthlyLimitCents: null,
  usedCents: null,
  includedUsedCents: null,
  onDemandCapCents: null,
  onDemandUsedCents: null,
  onDemandUsedPercent: null,
  usedPercent: null,
});

export const buildXaiBillingSummary = (
  config: XaiBillingConfig | null | undefined,
): XaiBillingSummary | null => {
  if (!config || typeof config !== "object") return null;

  const summary = emptyXaiBillingSummary();
  const currentPeriod = config.currentPeriod ?? config.current_period ?? null;
  const periodType = resolveXaiPeriodType(currentPeriod);
  const creditUsagePercent = normalizeNumberValue(
    config.creditUsagePercent ?? config.credit_usage_percent,
  );
  const periodStart =
    normalizeStringValue(currentPeriod?.start) ??
    normalizeStringValue(config.billingPeriodStart ?? config.billing_period_start) ??
    undefined;
  const periodEnd =
    normalizeStringValue(currentPeriod?.end) ??
    normalizeStringValue(config.billingPeriodEnd ?? config.billing_period_end) ??
    undefined;
  const productUsage = normalizeXaiProductUsage(config.productUsage ?? config.product_usage);

  const monthlyLimitCents = normalizeXaiCentValue(config.monthlyLimit ?? config.monthly_limit);
  const usedCents = normalizeXaiCentValue(config.used);
  const onDemandCapCents = normalizeXaiCentValue(config.onDemandCap ?? config.on_demand_cap);
  const explicitOnDemandUsedCents = normalizeXaiCentValue(
    config.onDemandUsed ?? config.on_demand_used,
  );
  const billingPeriodStart =
    normalizeStringValue(config.billingPeriodStart ?? config.billing_period_start) ?? undefined;
  const billingPeriodEnd =
    normalizeStringValue(config.billingPeriodEnd ?? config.billing_period_end) ?? undefined;

  const includedUsedCents =
    usedCents === null
      ? null
      : monthlyLimitCents !== null && monthlyLimitCents > 0
        ? Math.min(usedCents, monthlyLimitCents)
        : usedCents;
  const derivedOnDemandUsedCents =
    usedCents !== null && monthlyLimitCents !== null
      ? Math.max(0, usedCents - monthlyLimitCents)
      : null;
  const onDemandUsedCents = explicitOnDemandUsedCents ?? derivedOnDemandUsedCents;
  const usedPercent =
    monthlyLimitCents !== null && monthlyLimitCents > 0 && includedUsedCents !== null
      ? (includedUsedCents / monthlyLimitCents) * 100
      : null;
  const onDemandUsedPercent =
    onDemandCapCents !== null && onDemandCapCents > 0 && onDemandUsedCents !== null
      ? (onDemandUsedCents / onDemandCapCents) * 100
      : null;

  const hasWeeklyData =
    creditUsagePercent !== null || periodType === "weekly" || productUsage.length > 0;
  const hasMonthlyData =
    monthlyLimitCents !== null ||
    usedCents !== null ||
    (!hasWeeklyData && (onDemandCapCents !== null || Boolean(billingPeriodEnd)));

  if (!hasWeeklyData && !hasMonthlyData) return null;

  summary.periodType = hasWeeklyData
    ? periodType === "unknown"
      ? "weekly"
      : periodType
    : "monthly";
  summary.usagePercent = hasWeeklyData ? creditUsagePercent : usedPercent;
  summary.periodStart = hasWeeklyData ? periodStart : billingPeriodStart;
  summary.periodEnd = hasWeeklyData ? periodEnd : billingPeriodEnd;
  summary.productUsage = productUsage;
  summary.monthlyLimitCents = monthlyLimitCents;
  summary.usedCents = usedCents;
  summary.includedUsedCents = includedUsedCents;
  summary.onDemandCapCents = onDemandCapCents;
  summary.onDemandUsedCents = onDemandUsedCents;
  summary.onDemandUsedPercent = onDemandUsedPercent;
  summary.billingPeriodStart = hasMonthlyData ? billingPeriodStart : undefined;
  summary.billingPeriodEnd = hasMonthlyData ? billingPeriodEnd : undefined;
  summary.usedPercent = usedPercent;

  return summary;
};

export const mergeXaiBillingSummaries = (
  primary: XaiBillingSummary | null,
  fallback: XaiBillingSummary | null,
): XaiBillingSummary | null => {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    periodType: primary.periodType !== "unknown" ? primary.periodType : fallback.periodType,
    usagePercent: primary.usagePercent ?? fallback.usagePercent,
    periodStart: primary.periodStart ?? fallback.periodStart,
    periodEnd: primary.periodEnd ?? fallback.periodEnd,
    productUsage: primary.productUsage.length > 0 ? primary.productUsage : fallback.productUsage,
    monthlyLimitCents: primary.monthlyLimitCents ?? fallback.monthlyLimitCents,
    usedCents: primary.usedCents ?? fallback.usedCents,
    includedUsedCents: primary.includedUsedCents ?? fallback.includedUsedCents,
    onDemandCapCents: primary.onDemandCapCents ?? fallback.onDemandCapCents,
    onDemandUsedCents: primary.onDemandUsedCents ?? fallback.onDemandUsedCents,
    onDemandUsedPercent: primary.onDemandUsedPercent ?? fallback.onDemandUsedPercent,
    billingPeriodStart: primary.billingPeriodStart ?? fallback.billingPeriodStart,
    billingPeriodEnd: primary.billingPeriodEnd ?? fallback.billingPeriodEnd,
    usedPercent: primary.usedPercent ?? fallback.usedPercent,
  };
};

export const resolveXaiUserId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? file.metadata : null;
  const attributes = isRecord(file.attributes) ? file.attributes : null;
  const oauth = isRecord(file.oauth)
    ? file.oauth
    : isRecord(metadata?.oauth)
      ? metadata.oauth
      : isRecord(attributes?.oauth)
        ? attributes.oauth
        : null;
  const user = isRecord(file.user)
    ? file.user
    : isRecord(metadata?.user)
      ? metadata.user
      : isRecord(attributes?.user)
        ? attributes.user
        : null;
  const candidates = [
    file.sub,
    file.subject,
    file.user_id,
    file.userId,
    metadata?.sub,
    metadata?.subject,
    metadata?.user_id,
    metadata?.userId,
    attributes?.sub,
    attributes?.subject,
    attributes?.user_id,
    attributes?.userId,
    oauth?.sub,
    oauth?.subject,
    user?.sub,
    user?.id,
  ];
  for (const candidate of candidates) {
    const userId = normalizeStringValue(candidate);
    if (userId) return userId;
  }
  return null;
};

const formatUsdFromCents = (cents: number | null): string => {
  if (cents === null) return "--";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
};

// Bar + label both mean "remaining". Null/unknown usage is treated as fully remaining (100%).
const remainingPercent = (usedPercent: number | null): number =>
  usedPercent === null ? 100 : Math.round(clampPercent(100 - usedPercent));

const formatRemainingPercent = (usedPercent: number | null): string =>
  `${remainingPercent(usedPercent)}%`;

export const resolveXaiPlanType = (monthlyLimitCents: number | null): string | null => {
  if (monthlyLimitCents === 15_000) return "supergrok";
  if (monthlyLimitCents === 150_000) return "supergrok-heavy";
  return null;
};

export const buildXaiItems = (billing: XaiBillingSummary): QuotaItem[] => {
  const items: QuotaItem[] = [];
  const weeklyUsed =
    billing.periodType === "weekly" && billing.usagePercent !== null
      ? clampPercent(billing.usagePercent)
      : null;
  if (
    billing.periodType === "weekly" &&
    (weeklyUsed !== null || Boolean(billing.periodEnd) || billing.productUsage.length > 0)
  ) {
    items.push({
      key: "weekly_limit",
      label: "xai_quota.weekly_limit",
      percent: remainingPercent(weeklyUsed),
      value: formatRemainingPercent(weeklyUsed),
      resetAtMs: parseResetTimeToMs(billing.periodEnd),
      // Required so backend can record weekly cycle start and power cycle call totals.
      windowSeconds: XAI_WEEKLY_WINDOW_SECONDS,
      // Cards show relative reset from resetAtMs; skip raw period meta.
    });
  }

  billing.productUsage.forEach((item) => {
    const used = item.usagePercent === null ? null : clampPercent(item.usagePercent);
    items.push({
      key: `product:${item.product}`,
      label: `xai_quota.product_usage_named::${item.product}`,
      percent: remainingPercent(used),
      value: formatRemainingPercent(used),
    });
  });

  if ((billing.onDemandCapCents ?? 0) > 0) {
    const onDemandUsed =
      billing.onDemandUsedPercent === null ? null : clampPercent(billing.onDemandUsedPercent);
    const remainingCents =
      billing.onDemandCapCents !== null && billing.onDemandUsedCents !== null
        ? Math.max(0, billing.onDemandCapCents - billing.onDemandUsedCents)
        : null;
    items.push({
      key: "pay_as_you_go",
      label: "xai_quota.pay_as_you_go_label",
      percent: remainingPercent(onDemandUsed),
      value: formatRemainingPercent(onDemandUsed),
      meta: `${formatUsdFromCents(remainingCents)} / ${formatUsdFromCents(billing.onDemandCapCents)}`,
    });
  } else {
    // Not enabled: treat as full remaining (100% green bar), no "disabled" status text.
    items.push({
      key: "pay_as_you_go",
      label: "xai_quota.pay_as_you_go_label",
      percent: 100,
      value: "100%",
    });
  }

  if (
    billing.monthlyLimitCents !== null ||
    billing.usedCents !== null ||
    Boolean(billing.billingPeriodEnd)
  ) {
    const monthlyUsed = billing.usedPercent === null ? null : clampPercent(billing.usedPercent);
    const remainingCents =
      billing.monthlyLimitCents !== null && billing.includedUsedCents !== null
        ? Math.max(0, billing.monthlyLimitCents - billing.includedUsedCents)
        : null;
    items.push({
      key: "monthly_credits",
      label: "xai_quota.monthly_credits",
      percent: remainingPercent(monthlyUsed),
      value: formatRemainingPercent(monthlyUsed),
      resetAtMs: parseResetTimeToMs(billing.billingPeriodEnd),
      meta: `${formatUsdFromCents(remainingCents)} / ${formatUsdFromCents(billing.monthlyLimitCents)}`,
    });
  }

  return items;
};
