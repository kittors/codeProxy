import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useApiKeyUsageView } from "../useApiKeyUsageView";

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    usageApi: { ...mod.usageApi, getUsageLogs: mocks.getUsageLogs },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/ui")>();
  return { ...mod, useToast: () => ({ notify: mocks.notify }) };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const usageResponse = (days: number) => ({
  items: [],
  total: days,
  stats: { total: days, total_tokens: days, success_rate: 100 },
  filters: {},
});

describe("useApiKeyUsageView filter changes", () => {
  beforeEach(() => {
    mocks.getUsageLogs.mockReset();
    mocks.notify.mockReset();
  });

  // A filter change while the first request is still in flight used to be
  // dropped by an in-flight boolean guard, leaving the table showing data for
  // the previous filters with no retry.
  test("applies the newest filter even when an earlier request is in flight", async () => {
    const pending: Array<(value: unknown) => void> = [];
    mocks.getUsageLogs.mockImplementation((params: { days: number }) => {
      if (params.days === 7) {
        return new Promise((resolve) => {
          pending.push(() => resolve(usageResponse(7)));
        });
      }
      return Promise.resolve(usageResponse(30));
    });

    const { result } = renderHook(() => useApiKeyUsageView());

    act(() => {
      result.current.openUsageView(["key-1"], "Key 1");
    });
    await waitFor(() => {
      expect(mocks.getUsageLogs).toHaveBeenCalled();
    });
    const callsBefore = mocks.getUsageLogs.mock.calls.length;

    act(() => {
      result.current.setUsageTimeRange(30);
    });
    // The new filter must issue its own request instead of being dropped.
    await waitFor(() => {
      expect(mocks.getUsageLogs.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(mocks.getUsageLogs.mock.calls.at(-1)?.[0]?.days).toBe(30);

    await waitFor(() => {
      expect(result.current.usageTotalCount).toBe(30);
    });

    // The stale 7-day response resolving afterwards must not overwrite it.
    act(() => {
      for (const resolve of pending) resolve(undefined);
    });
    await waitFor(() => {
      expect(result.current.usageTotalCount).toBe(30);
    });
  });
});
