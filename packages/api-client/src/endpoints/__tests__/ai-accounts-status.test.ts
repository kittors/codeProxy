import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

describe("aiAccountsStatusApi (authoritative contract)", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  test("GET /ai-accounts/status normalizes items[]", async () => {
    const { aiAccountsStatusApi } = await import("../ai-accounts-status");
    getMock.mockResolvedValue({
      items: [
        {
          auth_subject_id: "sub-1",
          auth_index: "auth-1",
          provider: "codex",
          refresh_state: "idle",
          health_status: "ok",
          plan_type: "plus",
          quotas: [
            {
              quota_key: "code_5h",
              quota_label: "m_quota.code_5h",
              percent: 42,
              reset_at: "2026-07-16T05:00:00Z",
              value: "42%",
              meta: "extra",
            },
          ],
          usage: {
            auth_subject_id: "sub-1",
            request_total_30d: 100,
            success_total_30d: 90,
            failure_total_30d: 10,
            cycle_request_total: 9,
            cycle_cost_total: 1.2,
            weekly_quota_used_percent: 11,
            cycle_known: true,
          },
          reset_credit_count: 2,
          reset_credit_expirations: ["2026-08-01T00:00:00Z"],
          upstream_checked_at: "2026-07-16T01:00:00Z",
          usage_updated_at: "2026-07-16T01:05:00Z",
          version: 3,
          updated_at: "2026-07-16T01:06:00Z",
        },
      ],
    });

    const snapshot = await aiAccountsStatusApi.getStatus();
    expect(getMock).toHaveBeenCalledWith("/ai-accounts/status", { signal: undefined });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.auth_subject_id).toBe("sub-1");
    expect(snapshot.items[0]?.quotas[0]?.quota_key).toBe("code_5h");
    expect(snapshot.items[0]?.quotas[0]?.value).toBe("42%");
    expect(snapshot.items[0]?.usage?.request_total_30d).toBe(100);
    expect(snapshot.items[0]?.reset_credit_count).toBe(2);
  });

  test("filters status snapshot by auth_index query params", async () => {
    const { aiAccountsStatusApi } = await import("../ai-accounts-status");
    getMock.mockResolvedValue({ items: [] });
    await aiAccountsStatusApi.getStatus({
      authIndexes: ["a1", "a2", "a1"],
    });
    expect(getMock).toHaveBeenCalledWith(
      "/ai-accounts/status?auth_index=a1&auth_index=a2",
      { signal: undefined },
    );
  });

  test("normalizes restriction_summary string and skipped string[]", async () => {
    const { aiAccountsStatusApi } = await import("../ai-accounts-status");
    getMock.mockResolvedValue({
      items: [
        {
          auth_index: "auth-1",
          restriction_summary: "quota exceeded until tomorrow",
          quotas: [],
        },
      ],
    });
    const snapshot = await aiAccountsStatusApi.getStatus();
    expect(snapshot.items[0]?.restriction_summary).toBe("quota exceeded until tomorrow");

    postMock.mockResolvedValue({
      job_id: "job-2",
      accepted: 1,
      deduplicated: 0,
      skipped: ["auth-x", "auth-y"],
    });
    const accepted = await aiAccountsStatusApi.startStatusRefresh({
      auth_indexes: ["auth-1"],
      force: false,
    });
    expect(accepted.skipped).toEqual(["auth-x", "auth-y"]);
  });

  test("rejects snapshot without items[]", async () => {
    const { aiAccountsStatusApi } = await import("../ai-accounts-status");
    getMock.mockResolvedValue({ accounts: [] });
    await expect(aiAccountsStatusApi.getStatus()).rejects.toThrow(
      "invalid_ai_accounts_status_items",
    );
  });

  test("POST refresh + GET job results shape", async () => {
    const { aiAccountsStatusApi } = await import("../ai-accounts-status");
    postMock.mockResolvedValue({
      job_id: "job-1",
      accepted: 2,
      deduplicated: 0,
      skipped: ["a3"],
    });
    getMock.mockResolvedValue({
      job_id: "job-1",
      tenant_id: "t1",
      state: "running",
      total: 2,
      completed: 1,
      failed: 0,
      results: [
        {
          auth_index: "a1",
          auth_subject_id: "sub-a",
          state: "success",
          result: {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            quotas: [{ quota_key: "code_5h", percent: 10 }],
          },
        },
        { auth_index: "a2", state: "running" },
      ],
    });

    const accepted = await aiAccountsStatusApi.startStatusRefresh({
      auth_indexes: ["a1", "a2", "a1"],
      force: true,
    });
    expect(postMock).toHaveBeenCalledWith(
      "/ai-accounts/status-refresh",
      { auth_indexes: ["a1", "a2"], force: true },
      { signal: undefined },
    );
    expect(accepted.job_id).toBe("job-1");
    expect(accepted.skipped).toEqual(["a3"]);

    const job = await aiAccountsStatusApi.getStatusRefreshJob("job-1");
    expect(getMock).toHaveBeenCalledWith("/ai-accounts/status-refresh/job-1", {
      signal: undefined,
    });
    expect(job.results[0]?.state).toBe("success");
    expect(job.results[0]?.result?.quotas[0]?.percent).toBe(10);
  });
});
