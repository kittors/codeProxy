import { beforeEach, describe, expect, test, vi } from "vitest";
import { endUsersApi, portalApi } from "@code-proxy/api-client/endpoints/end-users";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}));

describe("endUsersApi", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.delete.mockReset();
  });

  test("loads end-user daily spending reset history with a limit", async () => {
    mocks.get.mockResolvedValue({ items: [], total: 0 });

    await endUsersApi.listDailySpendingResetHistory("user-1", 200);

    expect(mocks.get).toHaveBeenCalledWith(
      "/end-users/user-1/daily-spending/reset-history?limit=200",
    );
  });

  test("resets selected account and owned-key periods through owner-scoped endpoints", async () => {
    mocks.post.mockResolvedValue({ status: "ok" });

    await endUsersApi.resetPeriodSpending("user-1", ["day", "week"]);
    await endUsersApi.resetKeyPeriodSpending("user-1", "key-1", ["5h", "month"]);

    expect(mocks.post).toHaveBeenNthCalledWith(1, "/end-users/user-1/period-spending/reset", {
      periods: ["day", "week"],
    });
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      "/end-users/user-1/api-keys/key-1/period-spending/reset",
      { periods: ["5h", "month"] },
    );
  });

  test("prepares the portal period reset path", async () => {
    const post = vi.spyOn(portalApi.client, "post").mockResolvedValue({ status: "ok" });

    await portalApi.resetKeyPeriodSpending("key-1", ["day", "week"]);

    expect(post).toHaveBeenCalledWith("/v0/portal/api-keys/key-1/period-spending/reset", {
      periods: ["day", "week"],
    });
  });

  test("creates and updates owned keys with period spending limits", async () => {
    const limits = { "5h": 50, day: 100, week: 300, month: 1000 };
    mocks.post.mockResolvedValue({ api_key: { id: "key-1" }, plaintext_key: "sk-secret" });
    mocks.patch.mockResolvedValue({ id: "key-1", name: "Renamed" });

    await endUsersApi.createKey("user-1", {
      name: "Primary",
      "daily-spending-limit": limits.day,
      "period-spending-limits": limits,
    });
    await endUsersApi.updateKey("user-1", "key-1", {
      name: "Renamed",
      "daily-spending-limit": limits.day,
      "period-spending-limits": limits,
    });

    expect(mocks.post).toHaveBeenCalledWith("/end-users/user-1/api-keys", {
      name: "Primary",
      "daily-spending-limit": 100,
      "period-spending-limits": limits,
    });
    expect(mocks.patch).toHaveBeenCalledWith("/end-users/user-1/api-keys/key-1", {
      name: "Renamed",
      "daily-spending-limit": 100,
      "period-spending-limits": limits,
    });
  });

  test("uses owner-scoped reset and reset-history endpoints", async () => {
    mocks.post.mockResolvedValue({ status: "ok" });
    mocks.get.mockResolvedValue({ items: [], total: 0 });

    await endUsersApi.resetKeyDailySpending("user-1", "key-1");
    await endUsersApi.listKeyDailySpendingResetHistory("user-1", "key-1", 200);

    expect(mocks.post).toHaveBeenCalledWith(
      "/end-users/user-1/api-keys/key-1/daily-spending/reset",
      {},
    );
    expect(mocks.get).toHaveBeenCalledWith(
      "/end-users/user-1/api-keys/key-1/daily-spending/reset-history?limit=200",
    );
  });

  test("renames and rotates keys through owner-scoped endpoints", async () => {
    mocks.patch.mockResolvedValue({ id: "key-1", name: "Renamed" });
    mocks.post.mockResolvedValue({
      api_key: { id: "key-1", name: "Renamed" },
      plaintext_key: "sk-rotated",
    });

    await endUsersApi.updateKeyName("user-1", "key-1", "Renamed");
    await endUsersApi.rotateKey("user-1", "key-1");

    expect(mocks.patch).toHaveBeenCalledWith("/end-users/user-1/api-keys/key-1", {
      name: "Renamed",
    });
    expect(mocks.post).toHaveBeenCalledWith("/end-users/user-1/api-keys/key-1/rotate", {});
  });

  test("normalizes accounts: the matrix from a new backend, legacy fields from an old one", async () => {
    mocks.get.mockResolvedValueOnce({
      items: [
        {
          id: "new",
          username: "new",
          display_name: "New",
          "quota-limits": { cost: { day: 10 }, tokens: { month: 5000000 } },
          "model-rules": [{ id: "r1", models: ["claude-opus-*"], limits: { requests: { week: 100 } } }],
          "model-routes": [{ id: "x", from: ["gpt-5"], to: "gpt-5-mini" }],
          "quota-usage": { total: { cost: { day: 3 } }, rules: [{ id: "r1", used: { requests: { week: 40 } } }] },
        },
        {
          id: "old",
          username: "old",
          display_name: "Old",
          "daily-limit": 500,
          "spending-limit": 80,
          "period-spending-limits": { "5h": 0, day: 12, week: 0, month: 0 },
        },
      ],
      capabilities: { "access-policy": true, "batch-profile-binding": true },
    });

    const { items, capabilities } = await endUsersApi.list();
    expect(capabilities).toEqual({
      accessPolicy: true,
      modelFallback: false,
      batchProfileBinding: true,
      createWithProfile: false,
      ownedKeyAdmin: false,
    });
    const [fresh, legacy] = items;
    expect(fresh["quota-limits"].cost.day).toBe(10);
    expect(fresh["quota-limits"].tokens.month).toBe(5_000_000);
    expect(fresh["quota-limits"].requests.day).toBe(0);
    expect(fresh["model-rules"][0].limits.requests.week).toBe(100);
    expect(fresh["model-routes"]).toEqual([{ id: "x", from: ["gpt-5"], to: "gpt-5-mini" }]);
    expect(fresh["quota-usage"]?.rules[0].used.requests.week).toBe(40);

    // 旧后端：矩阵由扁平字段拼出，规则与路由为空。
    expect(legacy["quota-limits"].requests.day).toBe(500);
    expect(legacy["quota-limits"].cost.lifetime).toBe(80);
    expect(legacy["quota-limits"].cost.day).toBe(12);
    expect(legacy["model-rules"]).toEqual([]);
    expect(legacy["model-routes"]).toEqual([]);
  });

  test("a missing capabilities object means nothing new is supported", async () => {
    mocks.get.mockResolvedValueOnce({ items: [] });
    const { capabilities } = await endUsersApi.listKeys("user-1");
    expect(Object.values(capabilities).every((value) => value === false)).toBe(true);
  });

  test("binds a batch of accounts to one template and fetches a single key secret", async () => {
    mocks.post.mockResolvedValueOnce({ updated: 2 });
    mocks.get.mockResolvedValueOnce({ id: "key-1", key: "sk-secret" });

    await expect(endUsersApi.bindProfile(["a", "b"], "gold")).resolves.toEqual({ updated: 2 });
    await expect(endUsersApi.keySecret("user-1", "key-1")).resolves.toEqual({ id: "key-1", key: "sk-secret" });

    expect(mocks.post).toHaveBeenCalledWith("/end-users/batch/permission-profile", {
      ids: ["a", "b"],
      "permission-profile-id": "gold",
    });
    expect(mocks.get).toHaveBeenCalledWith("/end-users/user-1/api-keys/key-1/secret");
  });
});
