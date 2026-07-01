import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
  },
}));

describe("usage logs api", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  test("normalizes null request log filter arrays at the API boundary", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      filters: {
        api_keys: null,
        api_key_names: null,
        models: null,
        channels: null,
      },
      stats: {
        total: 0,
        success_rate: 0,
        total_tokens: 0,
      },
    });

    await expect(usageApi.getUsageLogs({ page: 1, size: 50 })).resolves.toMatchObject({
      filters: {
        api_keys: [],
        api_key_names: {},
        models: [],
        channels: [],
      },
      stats: {
        total: 0,
        success_rate: 0,
        total_tokens: 0,
        total_cost: 0,
        cache_rate: 0,
      },
    });
    expect(getMock).toHaveBeenCalledWith("/usage/logs?page=1&size=50");
  });

  test("passes abort signals through to the API client", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    const controller = new AbortController();
    getMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      size: 50,
      filters: {},
      stats: {},
    });

    await usageApi.getUsageLogs({ page: 2 }, { signal: controller.signal });

    expect(getMock).toHaveBeenCalledWith("/usage/logs?page=2", {
      signal: controller.signal,
    });
  });
});
