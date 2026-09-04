import type { AuthFileTrendResponse } from "@code-proxy/api-client";
import { describe, expect, test } from "vitest";
import { buildTrendQuotaSummary, estimateQuotaBudget } from "../trendQuotaSummary";

const baseTrend = (overrides: Partial<AuthFileTrendResponse> = {}): AuthFileTrendResponse => ({
  auth_index: "auth-1",
  days: 7,
  hours: 5,
  request_total: 0,
  cycle_request_total: 0,
  cycle_cost_total: 0,
  weekly_quota_used_percent: null,
  cycle_start: "2026-08-20T06:45:51Z",
  daily_usage: [],
  hourly_usage: [],
  quota_series: [],
  ...overrides,
});

describe("buildTrendQuotaSummary", () => {
  // The regression this whole change exists for. A live SuperGrok account spent
  // 19% of its shared weekly pool: 16% through this proxy (Grok Build) and 3%
  // through Grok Chat on the web. Dividing $128.4874 of recorded cost by the
  // pool-wide 19% reported a $676 weekly budget for a pool worth ~$803, and the
  // figure fell further every time the account was used outside the proxy.
  test("divides by the attributable share, not the shared pool", () => {
    const summary = buildTrendQuotaSummary({
      trend: baseTrend({
        cycle_cost_total: 128.4874,
        weekly_quota_used_percent: 19,
        projection_quota_used_percent: 16,
        projection_quota_attributable: true,
      }),
      fiveHourQuotaKey: null,
      weeklyQuotaKey: "weekly_limit",
      showPredictedWeeklyQuota: true,
      cycleCostTotal: 128.4874,
    });

    expect(summary.weeklyQuotaUsedPercent).toBe(19);
    expect(summary.projectionQuotaUsedPercent).toBe(16);
    expect(summary.projectionIsAttributable).toBe(true);
    expect(summary.externalQuotaUsedPercent).toBe(3);
    expect(summary.estimatedWeeklyQuota).toBeCloseTo(803.0462, 4);
    // The old, pool-wide answer.
    expect(summary.estimatedWeeklyQuota).not.toBeCloseTo(676.2496, 4);
  });

  // Chat burning most of the pool used to collapse the projection toward zero.
  // With the divisor fixed, the projected pool size is stable regardless of how
  // much was spent elsewhere.
  test("projection is unmoved by consumption outside the proxy", () => {
    const budgets = [3, 20, 60].map(
      (chatPercent) =>
        buildTrendQuotaSummary({
          trend: baseTrend({
            cycle_cost_total: 128.4874,
            weekly_quota_used_percent: 16 + chatPercent,
            projection_quota_used_percent: 16,
            projection_quota_attributable: true,
          }),
          fiveHourQuotaKey: null,
          weeklyQuotaKey: "weekly_limit",
          showPredictedWeeklyQuota: true,
          cycleCostTotal: 128.4874,
        }).estimatedWeeklyQuota,
    );

    for (const budget of budgets) {
      expect(budget).toBeCloseTo(budgets[0], 6);
    }
  });

  // No attributable window (no product breakdown upstream) must not zero the
  // projection; the pool-wide figure is still the best available answer.
  test("falls back to the pool-wide percent when nothing is attributable", () => {
    const summary = buildTrendQuotaSummary({
      trend: baseTrend({
        cycle_cost_total: 7.352,
        weekly_quota_used_percent: 6,
        projection_quota_used_percent: null,
        projection_quota_attributable: true,
      }),
      fiveHourQuotaKey: null,
      weeklyQuotaKey: "weekly_limit",
      showPredictedWeeklyQuota: true,
      cycleCostTotal: 7.352,
    });

    expect(summary.projectionQuotaUsedPercent).toBe(6);
    expect(summary.projectionIsAttributable).toBe(false);
    expect(summary.externalQuotaUsedPercent).toBeNull();
    expect(summary.estimatedWeeklyQuota).toBeCloseTo(122.5333, 4);
  });

  // Providers that bill one pool per surface are untouched by the change.
  test("leaves single-pool providers on their existing divisor", () => {
    const summary = buildTrendQuotaSummary({
      trend: baseTrend({
        cycle_cost_total: 1.2,
        weekly_quota_used_percent: 8,
        hourly_usage: [{ hour: "2026-07-26 10:00", requests: 5, cost: 0.05 }],
        quota_series: [
          {
            quota_key: "five_hour",
            quota_label: "claude_quota.five_hour",
            window_seconds: 18000,
            points: [{ timestamp: "2026-07-26T10:00:00Z", percent: 80 }],
          },
        ],
      }),
      fiveHourQuotaKey: "five_hour",
      weeklyQuotaKey: "seven_day",
      showPredictedWeeklyQuota: true,
      cycleCostTotal: 1.2,
    });

    expect(summary.projectionQuotaUsedPercent).toBe(8);
    expect(summary.projectionIsAttributable).toBe(false);
    expect(summary.estimatedWeeklyQuota).toBeCloseTo(15, 4);
    // 80% remaining => 20% used; $0.05 / 20% = $0.25.
    expect(summary.fiveHourQuotaUsedPercent).toBe(20);
    expect(summary.estimatedFiveHourQuota).toBeCloseTo(0.25, 4);
  });

  // Backend field absent (older server) — the weekly snapshot still drives both.
  test("reads the weekly snapshot when the backend sends no percentages", () => {
    const summary = buildTrendQuotaSummary({
      trend: baseTrend({
        cycle_cost_total: 10,
        weekly_quota_used_percent: null,
        quota_series: [
          {
            quota_key: "weekly_limit",
            quota_label: "xai_quota.weekly_limit",
            window_seconds: 604800,
            points: [{ timestamp: "2026-08-24T00:00:00Z", percent: 75 }],
          },
        ],
      }),
      fiveHourQuotaKey: null,
      weeklyQuotaKey: "weekly_limit",
      showPredictedWeeklyQuota: true,
      cycleCostTotal: 10,
    });

    expect(summary.weeklyQuotaUsedPercent).toBe(25);
    expect(summary.projectionQuotaUsedPercent).toBe(25);
    expect(summary.estimatedWeeklyQuota).toBeCloseTo(40, 4);
  });

  test("uses attributable product series fallback when backend fields are missing", () => {
    const summary = buildTrendQuotaSummary({
      trend: baseTrend({
        cycle_cost_total: 128.4874,
        weekly_quota_used_percent: 19,
        projection_quota_used_percent: null,
        quota_series: [
          {
            quota_key: "weekly_limit",
            quota_label: "xai_quota.weekly_limit",
            window_seconds: 604800,
            points: [{ timestamp: "2026-08-24T00:00:00Z", percent: 81 }],
          },
          {
            quota_key: "product:GrokBuild",
            quota_label: "xai_quota.grok_build",
            window_seconds: 604800,
            points: [{ timestamp: "2026-08-24T00:00:00Z", percent: 84 }],
          },
        ],
      }),
      fiveHourQuotaKey: null,
      weeklyQuotaKey: "weekly_limit",
      showPredictedWeeklyQuota: true,
      cycleCostTotal: 128.4874,
    });

    expect(summary.weeklyQuotaUsedPercent).toBe(19);
    expect(summary.projectionQuotaUsedPercent).toBe(16);
    expect(summary.projectionIsAttributable).toBe(true);
    expect(summary.externalQuotaUsedPercent).toBe(3);
    expect(summary.estimatedWeeklyQuota).toBeCloseTo(803.0462, 4);
  });
});

describe("estimateQuotaBudget", () => {
  test("returns 0 rather than dividing by an unusable percent", () => {
    expect(estimateQuotaBudget(10, 0)).toBe(0);
    expect(estimateQuotaBudget(10, null)).toBe(0);
    expect(estimateQuotaBudget(10, undefined)).toBe(0);
    expect(estimateQuotaBudget(0, 20)).toBe(0);
    expect(estimateQuotaBudget(-1, 20)).toBe(0);
  });

  test("clamps an over-100 percent instead of inflating the budget", () => {
    expect(estimateQuotaBudget(10, 150)).toBeCloseTo(10, 6);
  });

  // Fractional percents now reach here unrounded; rounding 2.4 to 2 would have
  // overstated the budget by 20%.
  test("uses fractional percents at full precision", () => {
    expect(estimateQuotaBudget(12, 2.4)).toBeCloseTo(500, 6);
  });
});
