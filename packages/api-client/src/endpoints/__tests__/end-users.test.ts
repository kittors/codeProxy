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
});
