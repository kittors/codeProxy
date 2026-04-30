import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("@/lib/http/client", () => ({
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
    const { usageApi } = await import("@/lib/http/apis/usage");
    getMock.mockResolvedValue({
      auth_index: "auth-1",
      days: 7,
      hours: 5,
      request_total: 3,
      cycle_request_total: 2,
      cycle_start: "2026-04-27T16:01:21Z",
      daily_usage: [{ date: "2026-04-30", requests: 2 }],
      hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1 }],
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
    expect(result.daily_usage).toHaveLength(1);
    expect(result.quota_series[0]?.quota_key).toBe("code_week");
  });

  test("records fine-grained quota points with daily quota values", async () => {
    const { usageApi } = await import("@/lib/http/apis/usage");
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
