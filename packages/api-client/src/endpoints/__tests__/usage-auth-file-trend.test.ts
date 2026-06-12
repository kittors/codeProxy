import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

describe("usage auth file trend api", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  test("fetches a single auth file trend by auth_index", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock.mockResolvedValue({
      auth_index: "auth-1",
      days: 7,
      hours: 5,
      request_total: 3,
      cycle_request_total: 2,
      cycle_cost_total: 1.2345,
      weekly_quota_used_percent: 7,
      cycle_start: "2026-04-27T16:01:21Z",
      daily_usage: [{ date: "2026-04-30", requests: 2, cost: 0.0123 }],
      hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1, cost: 0.0045 }],
      quota_series: [
        {
          quota_key: "code_week",
          quota_label: "m_quota.code_weekly",
          window_seconds: 604800,
          points: [{ timestamp: "2026-04-30T16:01:47Z", percent: 93 }],
        },
      ],
    });

    const result = await usageApi.getAuthFileTrend("auth-1", { days: 7, hours: 5 });

    expect(getMock).toHaveBeenCalledWith("/usage/auth-file-trend?auth_index=auth-1&days=7&hours=5");
    expect(result.request_total).toBe(3);
    expect(result.cycle_cost_total).toBe(1.2345);
    expect(result.weekly_quota_used_percent).toBe(7);
    expect(result.daily_usage[0]?.cost).toBe(0.0123);
    expect(result.hourly_usage[0]?.cost).toBe(0.0045);
    expect(result.daily_usage).toHaveLength(1);
    expect(result.quota_series[0]?.quota_key).toBe("code_week");
  });

  test("fetches entity stats with scoped auth indexes and sources", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock.mockResolvedValue({
      source: [{ entity_name: "t:codex-a", requests: 1, failed: 0 }],
      auth_index: [{ entity_name: "auth-a", requests: 2, failed: 1 }],
    });

    const result = await usageApi.getEntityStats(30, "all", {
      authIndexes: ["auth-a", "auth-b"],
      sources: ["t:codex-a", "t:codex-a.json"],
    });

    expect(getMock).toHaveBeenCalledWith(
      "/usage/entity-stats?days=30&auth_index=auth-a&auth_index=auth-b&source=t%3Acodex-a&source=t%3Acodex-a.json",
    );
    expect(result.auth_index).toHaveLength(1);
    expect(result.source).toHaveLength(1);
  });

  test("records fine-grained quota points with daily quota values", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    postMock.mockResolvedValue({ status: "ok" });

    await usageApi.recordAuthFileQuotaSnapshot({
      auth_index: "auth-1",
      provider: "codex",
      quotas: { code_week: 93 },
      quota_points: [
        {
          quota_key: "additional:codex_bengalfox:5h",
          quota_label: "GPT-5.3-Codex-Spark: 5h",
          percent: 100,
          reset_at: "2026-04-30T21:00:00Z",
          window_seconds: 18000,
        },
      ],
    });

    expect(postMock).toHaveBeenCalledWith("/usage/auth-file-quota-snapshot", {
      auth_index: "auth-1",
      provider: "codex",
      quotas: { code_week: 93 },
      quota_points: [
        {
          quota_key: "additional:codex_bengalfox:5h",
          quota_label: "GPT-5.3-Codex-Spark: 5h",
          percent: 100,
          reset_at: "2026-04-30T21:00:00Z",
          window_seconds: 18000,
        },
      ],
    });
  });
});
