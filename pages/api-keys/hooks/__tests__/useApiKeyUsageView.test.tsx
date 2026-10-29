import { act, renderHook, waitFor } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { UsageLogItem, UsageLogsResponse } from "@code-proxy/api-client/endpoints/usage";
import { useApiKeyUsageView } from "../useApiKeyUsageView";

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn<() => Promise<UsageLogsResponse>>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    usageApi: {
      ...actual.usageApi,
      getUsageLogs: mocks.getUsageLogs,
    },
  };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>
    <ToastProvider>{children}</ToastProvider>
  </ThemeProvider>
);

function readTrailingCount(value: ReactNode): number | undefined {
  return isValidElement<{ count: number }>(value) ? value.props.count : undefined;
}

const noKeyFacet = {
  api_key_ids: [],
  api_key_id_names: {},
  api_key_id_counts: {},
  api_keys: [],
  api_key_names: {},
  api_key_counts: {},
};

// What a backend without the api-key-id-filters capability answers: the facet is
// keyed by client secret.
function legacyFilters(
  keys: string[],
  names: Record<string, string>,
  counts: Record<string, number>,
): UsageLogsResponse["filters"] {
  return {
    ...noKeyFacet,
    api_keys: keys,
    api_key_names: names,
    api_key_counts: counts,
    models: [],
    channels: [],
    channel_options: [],
    statuses: ["success", "failed"],
  };
}

// What a backend that declares the capability answers: the facet is keyed by key id.
function idFilters(
  ids: string[],
  names: Record<string, string>,
  counts: Record<string, number>,
): UsageLogsResponse["filters"] {
  return {
    ...noKeyFacet,
    api_key_ids: ids,
    api_key_id_names: names,
    api_key_id_counts: counts,
    models: [],
    channels: [],
    channel_options: [],
    statuses: ["success", "failed"],
  };
}

function logsResponse(
  filters: UsageLogsResponse["filters"],
  options: { byId?: boolean; items?: UsageLogItem[]; total?: number } = {},
): UsageLogsResponse {
  const total = options.total ?? 42;
  return {
    items: options.items ?? [],
    total,
    page: 1,
    size: 50,
    capabilities: { apiKeyIdFilters: options.byId === true },
    filters,
    stats: { total, success_rate: 100, total_tokens: 0, total_cost: 0, cache_rate: 0 },
  };
}

function makeUsageLogItem(overrides: Partial<UsageLogItem> = {}): UsageLogItem {
  return {
    id: 1,
    timestamp: "2026-07-24T00:00:00Z",
    api_key: "sk-low",
    api_key_name: "Low volume",
    model: "gpt-5.4",
    source: "codex",
    channel_name: "Primary",
    auth_index: "primary",
    failed: false,
    latency_ms: 100,
    first_token_ms: 20,
    input_tokens: 100,
    output_tokens: 20,
    reasoning_tokens: 0,
    cached_tokens: 0,
    total_tokens: 120,
    cost: 0,
    has_content: false,
    ...overrides,
  };
}

describe("useApiKeyUsageView", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.getUsageLogs.mockResolvedValue(
      logsResponse(
        legacyFilters(
          ["sk-low", "sk-high", "sk-out-of-scope"],
          {
            "sk-low": "Low volume",
            "sk-high": "High volume",
            "sk-out-of-scope": "Other account",
          },
          { "sk-low": 12, "sk-high": 30, "sk-out-of-scope": 999 },
        ),
      ),
    );
  });

  test("keeps All Keys first and sorts scoped keys by their request counts (older backend)", async () => {
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openUsageView(["sk-low", "sk-high"], "Alice", {
        "sk-low": "Low volume",
        "sk-high": "High volume",
      });
    });

    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.usageKeyOptions.map((option) => option.value)).toEqual([
        "",
        "sk-high",
        "sk-low",
      ]),
    );

    expect(mocks.getUsageLogs).toHaveBeenCalledWith(
      expect.objectContaining({ api_keys: ["sk-low", "sk-high"] }),
    );
    expect(result.current.usageKeyOptions.map((option) => option.label)).toEqual([
      "All Keys",
      "High volume",
      "Low volume",
    ]);
    expect(
      result.current.usageKeyOptions.map((option) => readTrailingCount(option.trailing)),
    ).toEqual([42, 30, 12]);
    expect(
      result.current.usageKeyOptions.some((option) => option.value === "sk-out-of-scope"),
    ).toBe(false);
  });

  test("uses filtered API stats and current-page rows for the usage summary", async () => {
    mocks.getUsageLogs.mockResolvedValueOnce({
      ...logsResponse(legacyFilters(["sk-low"], { "sk-low": "Low volume" }, { "sk-low": 42 }), {
        items: [makeUsageLogItem()],
      }),
      stats: {
        total: 42,
        success_rate: 97.5,
        total_tokens: 12_345,
        total_cost: 0,
        cache_rate: 0,
      },
    });
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openUsageView(["sk-low"], "Alice");
    });

    await waitFor(() =>
      expect(result.current.usageSummary).toEqual({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 12_345,
        requestCount: 42,
        successRate: 97.5,
      }),
    );

    mocks.getUsageLogs.mockResolvedValueOnce({
      ...logsResponse(legacyFilters(["sk-low"], { "sk-low": "Low volume" }, { "sk-low": 3 }), {
        items: [makeUsageLogItem({ id: 2, failed: true, input_tokens: 30, output_tokens: 5 })],
        total: 3,
      }),
      stats: {
        total: 3,
        success_rate: 0,
        total_tokens: 321,
        total_cost: 0,
        cache_rate: 0,
      },
    });

    act(() => {
      result.current.setUsageStatusFilter("failed");
    });

    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    await waitFor(() =>
      expect(result.current.usageSummary).toEqual({
        inputTokens: 30,
        outputTokens: 5,
        totalTokens: 321,
        requestCount: 3,
        successRate: 0,
      }),
    );
  });

  test("keeps the current page without refetching when the language changes", async () => {
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openUsageView(["sk-low"], "Alice");
    });
    await waitFor(() => expect(result.current.usageTotalCount).toBe(42));
    act(() => {
      result.current.setUsagePageSize(20);
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.fetchUsageLogs(2, 20);
    });
    expect(result.current.usageCurrentPage).toBe(2);

    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });

    // The hook picked up the new `t`...
    expect(result.current.usageStatusOptions[0]?.label).toBe("全部状态");
    // ...without treating it as a query change.
    expect(mocks.getUsageLogs).toHaveBeenCalledTimes(3);
    expect(result.current.usageCurrentPage).toBe(2);
  });

  test("lists the keys of an id-based facet and narrows the scope by key id", async () => {
    mocks.getUsageLogs.mockResolvedValue(
      logsResponse(
        idFilters(
          ["key-low", "key-high", "key-unnamed"],
          { "key-low": "Low volume", "key-high": "High volume" },
          { "key-low": 12, "key-high": 30, "key-unnamed": 1 },
        ),
        { byId: true },
      ),
    );
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openUsageView(["sk-low", "sk-high"], "Alice");
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.usageKeyOptions.map((option) => option.value)).toEqual([
        "",
        "key-high",
        "key-low",
        "key-unnamed",
      ]),
    );
    // A key without a name is called by the start of its id, never by a secret.
    expect(result.current.usageKeyOptions.map((option) => option.label)).toEqual([
      "All Keys",
      "High volume",
      "Low volume",
      "key-unna",
    ]);
    // The scope goes out as the selectors this page holds; nothing is picked yet.
    expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ api_keys: ["sk-low", "sk-high"] }),
    );
    expect(mocks.getUsageLogs).not.toHaveBeenCalledWith(
      expect.objectContaining({ api_key_ids: expect.anything() }),
    );

    act(() => {
      result.current.setUsageKeyQuery("key-high");
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    // A pick from the facet narrows that scope by id instead of replacing it.
    expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ api_keys: ["sk-low", "sk-high"], api_key_ids: ["key-high"] }),
    );
  });

  test("an account view narrows by the key id the facet offers", async () => {
    mocks.getUsageLogs.mockResolvedValue(
      logsResponse(idFilters(["key-main"], { "key-main": "Alice" }, { "key-main": 5 }), {
        byId: true,
      }),
    );
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openEndUserUsageView("user-1", "Alice");
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
    expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ end_user_id: "user-1" }),
    );
    await waitFor(() =>
      expect(result.current.usageKeyOptions.map((option) => option.value)).toEqual([
        "",
        "key-main",
      ]),
    );

    act(() => {
      result.current.setUsageKeyQuery("key-main");
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ end_user_id: "user-1", api_key_ids: ["key-main"] }),
    );
    expect(mocks.getUsageLogs).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ api_keys: expect.anything() }),
    );
  });

  test("keeps a pick made before the first response a selector, not a key id", async () => {
    let releaseFirst!: (response: UsageLogsResponse) => void;
    mocks.getUsageLogs.mockImplementationOnce(
      () =>
        new Promise<UsageLogsResponse>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    mocks.getUsageLogs.mockResolvedValue(
      logsResponse(
        idFilters(["key-high"], { "key-high": "High volume" }, { "key-high": 30 }),
        { byId: true },
      ),
    );
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openUsageView(["sk-low", "sk-high"], "Alice", {
        "sk-low": "Low volume",
        "sk-high": "High volume",
      });
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
    // The dropdown is usable at once, seeded with the secrets this page holds.
    expect(result.current.usageKeyOptions.map((option) => option.value)).toContain("sk-high");

    act(() => {
      result.current.setUsageKeyQuery("sk-high");
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    // That pick is a secret the page holds: it must not be sent where key ids go.
    expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ api_keys: ["sk-high"] }),
    );
    expect(mocks.getUsageLogs).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ api_key_ids: expect.anything() }),
    );

    // The slow first response is stale by now and changes nothing.
    await act(async () => {
      releaseFirst(logsResponse(legacyFilters(["sk-low"], {}, {})));
    });
    await waitFor(() =>
      expect(result.current.usageKeyOptions.map((option) => option.value)).toEqual([
        "",
        "key-high",
      ]),
    );
  });

  test("never labels a key of an older backend by its secret", async () => {
    mocks.getUsageLogs.mockResolvedValue(
      logsResponse(
        legacyFilters(["sk-unnamed-secret-0001"], {}, { "sk-unnamed-secret-0001": 3 }),
      ),
    );
    const { result } = renderHook(() => useApiKeyUsageView(), { wrapper });

    act(() => {
      result.current.openUsageView(["sk-unnamed-secret-0001"], "Alice");
    });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.usageKeyOptions.map((option) => option.label)).toEqual([
        "All Keys",
        "sk-unn***0001",
      ]),
    );
  });
});
