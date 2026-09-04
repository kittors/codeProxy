import type { AuthFileTrendResponse } from "@code-proxy/api-client";

type TrendQuotaSeries = AuthFileTrendResponse["quota_series"][number];
type TrendUsagePoint = AuthFileTrendResponse["hourly_usage"][number];

export const FIVE_HOUR_WINDOW_SECONDS = 18000;
export const WEEK_WINDOW_SECONDS = 604800;

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const formatCurrency = (value: number) =>
  `$${(Number.isFinite(value) ? value : 0).toFixed(4)}`;

export const formatPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(clampPercent(value))}%`;
};

export const toQuotaUsedPercent = (remainingPercent: number | null | undefined) => {
  if (typeof remainingPercent !== "number" || !Number.isFinite(remainingPercent)) return null;
  return clampPercent(100 - clampPercent(remainingPercent));
};

export const sumUsageCost = (points: TrendUsagePoint[]) =>
  points.reduce((total, point) => {
    const cost = typeof point.cost === "number" && Number.isFinite(point.cost) ? point.cost : 0;
    return total + Math.max(0, cost);
  }, 0);

export const latestQuotaUsedPercent = (
  seriesList: TrendQuotaSeries[],
  quotaKey: string,
  matchesWindow: (windowSeconds: number) => boolean,
) => {
  let latestTimestamp = -Infinity;
  let latestUsedPercent: number | null = null;

  seriesList.forEach((series) => {
    if (!matchesWindow(series.window_seconds) || series.quota_key !== quotaKey) return;

    series.points.forEach((point) => {
      const usedPercent = toQuotaUsedPercent(point.percent);
      if (usedPercent === null) return;
      const timestamp = Date.parse(point.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < latestTimestamp) return;
      latestTimestamp = timestamp;
      latestUsedPercent = usedPercent;
    });
  });

  return latestUsedPercent;
};

/** cost / (used%/100) → full-window budget; 0 when underdetermined. */
export const estimateQuotaBudget = (cost: number, usedPercent: number | null | undefined) => {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) return 0;
  const normalizedUsedPercent = clampPercent(usedPercent);
  if (normalizedUsedPercent <= 0) return 0;
  return cost / (normalizedUsedPercent / 100);
};

export type TrendQuotaSummaryInput = {
  trend: AuthFileTrendResponse;
  /** Null for providers with no 5h window (xAI reports weekly only). */
  fiveHourQuotaKey: string | null;
  weeklyQuotaKey: string;
  showPredictedWeeklyQuota: boolean;
  cycleCostTotal: number;
};

export type TrendQuotaSummary = {
  fiveHourQuotaUsedPercent: number | null;
  /** Pool-wide consumption — what the account spent across every surface. */
  weeklyQuotaUsedPercent: number | null;
  /** Divisor actually used for the weekly projection. */
  projectionQuotaUsedPercent: number | null;
  /** True when the divisor is narrower than the pool-wide figure. */
  projectionIsAttributable: boolean;
  /** Pool share spent outside the proxy, or null when not knowable. */
  externalQuotaUsedPercent: number | null;
  estimatedFiveHourQuota: number;
  estimatedWeeklyQuota: number;
};

/**
 * Derives the quota figures shown above the trend chart.
 *
 * The subtle part is the weekly projection's divisor. It divides cycle cost,
 * which only covers requests this proxy forwarded, so the divisor has to cover
 * the same requests. xAI bills Grok Chat against the same weekly pool as Grok
 * Build: dividing by the pool-wide percentage shrank the projected budget by
 * however much the account spent on the web, so an account that browsed more
 * looked like it had less budget. The backend reports the attributable share
 * separately; the pool-wide figure is only a fallback for when it cannot.
 */
export const buildTrendQuotaSummary = ({
  trend,
  fiveHourQuotaKey,
  weeklyQuotaKey,
  showPredictedWeeklyQuota,
  cycleCostTotal,
}: TrendQuotaSummaryInput): TrendQuotaSummary => {
  const fiveHourQuotaUsedPercent = fiveHourQuotaKey
    ? latestQuotaUsedPercent(
        trend.quota_series,
        fiveHourQuotaKey,
        (windowSeconds) => windowSeconds === FIVE_HOUR_WINDOW_SECONDS,
      )
    : null;

  // Prefer the backend weekly used percent; fall back to the latest weekly
  // snapshot so xAI cards are not blank before the backend field exists.
  const weeklyQuotaUsedPercent =
    trend.weekly_quota_used_percent ??
    (showPredictedWeeklyQuota
      ? latestQuotaUsedPercent(
          trend.quota_series,
          weeklyQuotaKey,
          (windowSeconds) => windowSeconds >= WEEK_WINDOW_SECONDS,
        )
      : null);

  // Prefer the backend projection used percent; when absent, for xAI attempt to find
  // attributable product series (e.g. product:GrokBuild) before falling back to weeklyQuotaUsedPercent.
  let fallbackProjectionUsedPercent = weeklyQuotaUsedPercent;
  if (
    trend.projection_quota_used_percent == null &&
    (weeklyQuotaKey === "weekly_limit" || weeklyQuotaKey.startsWith("product:"))
  ) {
    const grokBuildSeries = trend.quota_series.filter(
      (s) => s.window_seconds >= WEEK_WINDOW_SECONDS && s.quota_key.startsWith("product:"),
    );
    if (grokBuildSeries.length > 0) {
      let sumUsed = 0;
      let hasValid = false;
      for (const s of grokBuildSeries) {
        const used = latestQuotaUsedPercent(
          [s],
          s.quota_key,
          (windowSeconds) => windowSeconds >= WEEK_WINDOW_SECONDS,
        );
        if (typeof used === "number" && Number.isFinite(used)) {
          sumUsed += used;
          hasValid = true;
        }
      }
      if (hasValid) {
        fallbackProjectionUsedPercent = Math.min(100, Math.max(0, sumUsed));
      }
    }
  }

  const projectionQuotaUsedPercent =
    trend.projection_quota_used_percent ?? fallbackProjectionUsedPercent;
  const projectionIsAttributable =
    (trend.projection_quota_attributable === true &&
      typeof trend.projection_quota_used_percent === "number" &&
      Number.isFinite(trend.projection_quota_used_percent)) ||
    (trend.projection_quota_used_percent == null &&
      fallbackProjectionUsedPercent !== null &&
      weeklyQuotaUsedPercent !== null &&
      fallbackProjectionUsedPercent !== weeklyQuotaUsedPercent);

  const externalQuotaUsedPercent =
    projectionIsAttributable &&
    typeof weeklyQuotaUsedPercent === "number" &&
    Number.isFinite(weeklyQuotaUsedPercent) &&
    typeof projectionQuotaUsedPercent === "number"
      ? Math.max(0, weeklyQuotaUsedPercent - projectionQuotaUsedPercent)
      : null;

  return {
    fiveHourQuotaUsedPercent,
    weeklyQuotaUsedPercent,
    projectionQuotaUsedPercent,
    projectionIsAttributable,
    externalQuotaUsedPercent,
    estimatedFiveHourQuota: estimateQuotaBudget(
      sumUsageCost(trend.hourly_usage),
      fiveHourQuotaUsedPercent,
    ),
    estimatedWeeklyQuota: estimateQuotaBudget(cycleCostTotal, projectionQuotaUsedPercent),
  };
};
