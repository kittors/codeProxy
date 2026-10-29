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
        api_key_counts: null,
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
      // A response that declares nothing is from a backend that predates the id filters.
      capabilities: { apiKeyIdFilters: false },
      filters: {
        api_key_ids: [],
        api_key_id_names: {},
        api_key_id_counts: {},
        api_keys: [],
        api_key_names: {},
        api_key_counts: {},
        models: [],
        channels: [],
        channel_options: [],
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

  test("preserves valid request counts and rejects malformed count maps", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock
      .mockResolvedValueOnce({
        filters: { api_key_counts: { "sk-primary": 42 } },
        stats: {},
      })
      .mockResolvedValueOnce({
        filters: { api_key_counts: { "sk-primary": "42" } },
        stats: {},
      });

    await expect(usageApi.getUsageLogs({})).resolves.toMatchObject({
      filters: { api_key_counts: { "sk-primary": 42 } },
    });
    await expect(usageApi.getUsageLogs({})).resolves.toMatchObject({
      filters: { api_key_counts: {} },
    });
  });

  test("reads the key facet by id from a backend that declares the id filters", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock.mockResolvedValue({
      items: [],
      total: 0,
      capabilities: { "api-key-id-filters": true },
      filters: {
        api_key_ids: ["key-primary", "__system__"],
        api_key_id_names: { "key-primary": "Primary" },
        api_key_id_counts: { "key-primary": 12, __system__: 3 },
        // Not something a current backend sends; ignored rather than trusted.
        api_keys: ["sk-should-not-be-here-0001"],
        api_key_names: { "sk-should-not-be-here-0001": "Leak" },
        api_key_counts: { "sk-should-not-be-here-0001": 1 },
      },
      stats: {},
    });

    const result = await usageApi.getUsageLogs({});

    expect(result.capabilities).toEqual({ apiKeyIdFilters: true });
    expect(result.filters).toMatchObject({
      api_key_ids: ["key-primary", "__system__"],
      api_key_id_names: { "key-primary": "Primary" },
      api_key_id_counts: { "key-primary": 12, __system__: 3 },
      api_keys: [],
      api_key_names: {},
      api_key_counts: {},
    });
  });

  test("declares the id filters only on an explicit true", async () => {
    const { readUsageLogsCapabilities } = await import("@code-proxy/api-client/endpoints/usage");

    expect(readUsageLogsCapabilities({ "api-key-id-filters": true })).toEqual({
      apiKeyIdFilters: true,
    });
    for (const value of [undefined, null, "yes", [], {}, { "api-key-id-filters": "true" }]) {
      expect(readUsageLogsCapabilities(value)).toEqual({ apiKeyIdFilters: false });
    }
  });

  test("sends key ids as repeated api_key_id parameters and an empty pick as api_key_ids_empty", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock.mockResolvedValue({ filters: {}, stats: {} });

    await usageApi.getUsageLogs({ api_key_ids: ["key-a", " key-b ", "key-a", ""] });
    await usageApi.getUsageLogs({ api_key_ids_empty: true });

    expect(getMock).toHaveBeenNthCalledWith(1, "/usage/logs?api_key_id=key-a&api_key_id=key-b");
    expect(getMock).toHaveBeenNthCalledWith(2, "/usage/logs?api_key_ids_empty=1");
  });

  test("keeps the selectors a caller already holds for the older backends", async () => {
    const { usageApi } = await import("@code-proxy/api-client/endpoints/usage");
    getMock.mockResolvedValue({ filters: {}, stats: {} });

    await usageApi.getUsageLogs({
      api_keys: ["sk-held-secret-0001"],
      api_keys_empty: false,
      end_user_id: "user-1",
    });

    expect(getMock).toHaveBeenCalledWith(
      "/usage/logs?end_user_id=user-1&api_key=sk-held-secret-0001",
    );
  });

  test("normalizes channel_options and falls back to legacy channels", async () => {
    const { usageApi, normalizeChannelOptions } =
      await import("@code-proxy/api-client/endpoints/usage");

    expect(normalizeChannelOptions(undefined, ["Codex", "Relay", "codex"])).toEqual([
      { value: "Codex", label: "Codex" },
      { value: "Relay", label: "Relay" },
    ]);

    getMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      filters: {
        channels: ["yuan@example.com"],
        channel_options: [
          {
            value: "auth-codex",
            label: "yuan@example.com",
            provider: "codex",
            auth_type: "oauth",
            auth_index: "auth-codex",
          },
          {
            value: "auth-xai",
            label: "yuan@example.com",
            provider: "xai",
            auth_type: "oauth",
            auth_index: "auth-xai",
          },
        ],
      },
      stats: {},
    });

    const result = await usageApi.getUsageLogs({ page: 1, size: 50 });
    expect(result.filters.channel_options).toEqual([
      {
        value: "auth-codex",
        label: "yuan@example.com",
        provider: "codex",
        auth_type: "oauth",
        auth_index: "auth-codex",
      },
      {
        value: "auth-xai",
        label: "yuan@example.com",
        provider: "xai",
        auth_type: "oauth",
        auth_index: "auth-xai",
      },
    ]);
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
