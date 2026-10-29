import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useLiveNowMs } from "../useLiveNowMs";

const START = Date.parse("2026-10-30T12:00:00.000Z");

describe("useLiveNowMs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("starts at the current time and follows the wall clock once per interval", () => {
    const { result } = renderHook(() => useLiveNowMs());
    expect(result.current).toBe(START);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(START + 1000);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    // Two more ticks have fired (the half second is still pending).
    expect(result.current).toBe(START + 3000);
  });

  test("a longer interval ticks less often", () => {
    const { result } = renderHook(() => useLiveNowMs(5000));
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current).toBe(START);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(START + 5000);
  });

  test("an inactive clock starts no timer and stays at the moment it was mounted", () => {
    const { result } = renderHook(() => useLiveNowMs(1000, false));
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(START);
  });

  test("stops its timer when the component goes away", () => {
    const { unmount } = renderHook(() => useLiveNowMs());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
