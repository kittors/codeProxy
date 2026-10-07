import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { normalizeMonitorOverview } from "@code-proxy/api-client";
import { resetMonitorBackendProbe, useMonitorOverview } from "../hooks/useMonitorOverview";
import type { MonitorViewQuery } from "../model/monitorQueryState";

const mocks = vi.hoisted(() => ({ getOverview: vi.fn() }));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...actual, usageMonitorApi: { getOverview: mocks.getOverview, getRealtime: vi.fn() } };
});

const query: MonitorViewQuery = { range: "24h", consumers: [], models: [], channels: [] };

// Resolved mocks still settle through several awaits inside load().
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
};

describe("useMonitorOverview auto refresh", () => {
  let hidden = false;

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    resetMonitorBackendProbe();
    hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    vi.useFakeTimers();
    mocks.getOverview.mockReset().mockResolvedValue(normalizeMonitorOverview({}));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setHidden = (value: boolean) => {
    hidden = value;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };

  test("refreshes on its interval only while the tab is visible", async () => {
    renderHook(() => useMonitorOverview(query, 30));
    await flush();
    expect(mocks.getOverview).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(30_000));
    await flush();
    expect(mocks.getOverview).toHaveBeenCalledTimes(2);

    setHidden(true);
    act(() => vi.advanceTimersByTime(120_000));
    await flush();
    expect(mocks.getOverview).toHaveBeenCalledTimes(2);

    // Back in front after more than one period: catch up at once, not a period later.
    setHidden(false);
    await flush();
    expect(mocks.getOverview).toHaveBeenCalledTimes(3);
  });

  test("does not poll when auto refresh is off", async () => {
    renderHook(() => useMonitorOverview(query, 0));
    await flush();
    act(() => vi.advanceTimersByTime(600_000));
    await flush();
    expect(mocks.getOverview).toHaveBeenCalledTimes(1);
  });

  test("keeps the data on screen when a silent refresh fails", async () => {
    const { result } = renderHook(() => useMonitorOverview(query, 30));
    await flush();
    expect(result.current.overview).not.toBeNull();
    expect(result.current.initialLoading).toBe(false);

    mocks.getOverview.mockRejectedValueOnce(new Error("blip"));
    act(() => vi.advanceTimersByTime(30_000));
    await flush();
    expect(result.current.overview).not.toBeNull();
    expect(result.current.error).toBe("blip");
    expect(result.current.refreshing).toBe(false);
  });
});
