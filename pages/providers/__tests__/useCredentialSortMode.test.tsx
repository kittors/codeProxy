import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import {
  resetCredentialSortModeForTests,
  useCredentialSortMode,
} from "../hooks/useCredentialSortMode";

beforeEach(() => {
  localStorage.clear();
  resetCredentialSortModeForTests();
});

describe("useCredentialSortMode", () => {
  test("starts in configured order", () => {
    const { result } = renderHook(() => useCredentialSortMode());
    expect(result.current[0]).toBe("config");
  });

  // The four usage tabs render separate instances. If they held independent
  // state, switching tabs would silently drop the order the operator chose.
  test("shares the selection across instances", () => {
    const first = renderHook(() => useCredentialSortMode());
    const second = renderHook(() => useCredentialSortMode());

    act(() => first.result.current[1]("remaining_asc"));

    expect(first.result.current[0]).toBe("remaining_asc");
    expect(second.result.current[0]).toBe("remaining_asc");
  });

  test("persists the selection for the next visit", () => {
    const { result, unmount } = renderHook(() => useCredentialSortMode());
    act(() => result.current[1]("remaining_desc"));
    unmount();

    resetCredentialSortModeForTests();
    const reopened = renderHook(() => useCredentialSortMode());
    expect(reopened.result.current[0]).toBe("remaining_desc");
  });

  // A value written by a newer build, or hand-edited, must not select a mode
  // the sorter does not implement.
  test("ignores an unrecognised stored value", () => {
    localStorage.setItem("providers-page:credential-usage-sort", "by_vibes");
    const { result } = renderHook(() => useCredentialSortMode());
    expect(result.current[0]).toBe("config");
  });
});
