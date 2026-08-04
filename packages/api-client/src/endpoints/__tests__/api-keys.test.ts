import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiKeyEntriesApi } from "@code-proxy/api-client/endpoints/api-keys";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: {
    post: mocks.post,
  },
}));

describe("apiKeyEntriesApi", () => {
  beforeEach(() => {
    mocks.post.mockReset();
  });

  test("sends the key selector and periods to the period reset endpoint", async () => {
    mocks.post.mockResolvedValue({ status: "ok" });

    await apiKeyEntriesApi.resetPeriodSpending({
      id: "key-1",
      periods: ["day", "week"],
    });

    expect(mocks.post).toHaveBeenCalledWith("/api-key-entries/period-spending/reset", {
      id: "key-1",
      periods: ["day", "week"],
    });
  });
});
