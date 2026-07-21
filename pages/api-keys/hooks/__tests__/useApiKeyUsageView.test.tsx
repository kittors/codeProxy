import { act, renderHook, waitFor } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { UsageLogsResponse } from "@code-proxy/api-client/endpoints/usage";
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
});
