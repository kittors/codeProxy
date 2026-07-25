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
    mocks.getUsageLogs.mockResolvedValue({
      items: [],
      total: 42,
      page: 1,
      size: 50,
      filters: {
        api_keys: ["sk-low", "sk-high", "sk-out-of-scope"],
        api_key_names: {
          "sk-low": "Low volume",
          "sk-high": "High volume",
          "sk-out-of-scope": "Other account",
        },
        api_key_counts: {
          "sk-low": 12,
          "sk-high": 30,
          "sk-out-of-scope": 999,
        },
        models: [],
        channels: [],
        channel_options: [],
        statuses: ["success", "failed"],
      },
      stats: {
        total: 42,
        success_rate: 100,
        total_tokens: 0,
        total_cost: 0,
        cache_rate: 0,
      },
    });
  });

  test("keeps All Keys first and sorts scoped keys by their request counts", async () => {
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
      items: [makeUsageLogItem()],
      total: 42,
      page: 1,
      size: 50,
      filters: {
        api_keys: ["sk-low"],
        api_key_names: { "sk-low": "Low volume" },
        api_key_counts: { "sk-low": 42 },
        models: [],
        channels: [],
        channel_options: [],
        statuses: ["success", "failed"],
      },
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
      items: [makeUsageLogItem({ id: 2, failed: true, input_tokens: 30, output_tokens: 5 })],
      total: 3,
      page: 1,
      size: 50,
      filters: {
        api_keys: ["sk-low"],
        api_key_names: { "sk-low": "Low volume" },
        api_key_counts: { "sk-low": 3 },
        models: [],
        channels: [],
        channel_options: [],
        statuses: ["success", "failed"],
      },
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
});
