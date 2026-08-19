import { describe, expect, test } from "vitest";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  isAuthFilesSortMode,
  resolveAuthFileQuotaRank,
} from "../hooks/useAuthFilesQuotaSort";
import type { QuotaItem } from "@features/quota-preview/quota-types";

const file = (provider: string): AuthFileItem =>
  ({ name: `${provider}.json`, provider, type: provider }) as AuthFileItem;

describe("resolveAuthFileQuotaRank", () => {
  // The card shows one row per Codex window; the tightest of them decides the
  // account's position, because that is the one that will refuse a request next.
  test("ranks a codex account by its tightest visible window", () => {
    const items: QuotaItem[] = [
      { key: "code_5h", label: "m_quota.code_5h", percent: 12 },
      { key: "code_week", label: "m_quota.code_weekly", percent: 80 },
    ];
    expect(resolveAuthFileQuotaRank(file("codex"), items)).toBe(12);
  });

  // Antigravity reports a weekly bucket too, but the card renders only the 5h
  // one. Ranking by a number the operator cannot see reads as a broken sort.
  test("ignores windows the antigravity card does not show", () => {
    const items: QuotaItem[] = [
      {
        key: "antigravity:gemini_5h",
        label: "Gemini Models · 5h",
        percent: 72,
        windowSeconds: 5 * 60 * 60,
      },
      {
        key: "antigravity:gemini_weekly",
        label: "Gemini Models · weekly",
        percent: 3,
        windowSeconds: 7 * 24 * 60 * 60,
      },
    ];
    expect(resolveAuthFileQuotaRank(file("antigravity"), items)).toBe(72);
  });

  test("is unknown when no visible window carries a number", () => {
    expect(resolveAuthFileQuotaRank(file("codex"), [])).toBeNull();
    expect(
      resolveAuthFileQuotaRank(file("codex"), [
        { key: "code_5h", label: "m_quota.code_5h", percent: null },
      ]),
    ).toBeNull();
  });

  test("is unknown for a file with no quota provider", () => {
    expect(
      resolveAuthFileQuotaRank(file("unknown-provider"), [
        { key: "whatever", label: "whatever", percent: 40 },
      ]),
    ).toBeNull();
  });
});

describe("isAuthFilesSortMode", () => {
  test("accepts known modes only", () => {
    expect(isAuthFilesSortMode("name")).toBe(true);
    expect(isAuthFilesSortMode("quota_asc")).toBe(true);
    expect(isAuthFilesSortMode("quota_desc")).toBe(true);
    expect(isAuthFilesSortMode("quota")).toBe(false);
    expect(isAuthFilesSortMode(undefined)).toBe(false);
  });
});

describe("useAuthFilesSortMode", () => {
  test("defaults to name order and shares the choice across instances", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useAuthFilesSortMode, resetAuthFilesSortModeForTests } = await import(
      "../hooks/useAuthFilesQuotaSort"
    );
    localStorage.clear();
    resetAuthFilesSortModeForTests();

    const first = renderHook(() => useAuthFilesSortMode());
    const second = renderHook(() => useAuthFilesSortMode());
    expect(first.result.current.mode).toBe("name");

    // The list and the toolbar control read this independently; if they held
    // separate state the control would move while the list stayed put.
    act(() => first.result.current.setMode("quota_asc"));
    expect(second.result.current.mode).toBe("quota_asc");

    resetAuthFilesSortModeForTests();
    const reopened = renderHook(() => useAuthFilesSortMode());
    expect(reopened.result.current.mode).toBe("quota_asc");
  });

  test("ignores an unrecognised stored value", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useAuthFilesSortMode, resetAuthFilesSortModeForTests } = await import(
      "../hooks/useAuthFilesQuotaSort"
    );
    localStorage.setItem("auth-files:sort-mode", "by_feel");
    resetAuthFilesSortModeForTests();
    const { result } = renderHook(() => useAuthFilesSortMode());
    expect(result.current.mode).toBe("name");
  });
});
