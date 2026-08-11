import { describe, expect, test } from "vitest";
import { mergeQuotaState } from "../mergeQuotaState";
import type { QuotaState } from "@features/quota-preview/quota-helpers";

const state = (items: QuotaState["items"], extra: Partial<QuotaState> = {}): QuotaState => ({
  status: "success",
  items,
  ...extra,
});

describe("mergeQuotaState", () => {
  test("drops windows the newest payload no longer reports", () => {
    const previous = state([
      { key: "five_hour", label: "claude_quota.five_hour", percent: 80 },
      { key: "seven_day_opus", label: "claude_quota.seven_day_opus", percent: 40 },
    ]);
    const incoming = state([{ key: "five_hour", label: "claude_quota.five_hour", percent: 70 }]);

    const merged = mergeQuotaState(previous, incoming);

    expect(merged.items.map((item) => item.key)).toEqual(["five_hour"]);
    expect(merged.items[0]?.percent).toBe(70);
  });

  // The backend now merges partial upstream payloads by quota_key, so an empty
  // payload means "no windows exist", not "this probe happened to omit them".
  // Re-adding them client-side is what kept days-old values on screen looking live.
  test("does not resurrect windows when the payload carries none", () => {
    const previous = state([{ key: "seven_day", label: "claude_quota.seven_day", percent: 60 }]);

    const merged = mergeQuotaState(previous, state([], { status: "error", error: "429" }));

    expect(merged.items).toEqual([]);
    expect(merged.error).toBe("429");
  });

  test("does not resurrect a stale percent when the new value is unknown", () => {
    const previous = state([{ key: "five_hour", label: "5h", percent: 80, resetAtMs: 111 }]);
    const incoming = state([{ key: "five_hour", label: "5h", percent: null }]);

    const merged = mergeQuotaState(previous, incoming);

    expect(merged.items[0]?.percent).toBeNull();
    expect(merged.items[0]?.resetAtMs).toBeUndefined();
  });

  test("follows the newest payload ordering and carries forward static fields", () => {
    const previous = state([
      { key: "a", label: "m_quota.code_5h", percent: 10, windowSeconds: 18000 },
      { key: "b", label: "m_quota.code_weekly", percent: 20 },
    ]);
    const incoming = state([
      { key: "b", label: "m_quota.code_weekly", percent: 25 },
      { key: "a", label: "a", percent: 15 },
    ]);

    const merged = mergeQuotaState(previous, incoming);

    expect(merged.items.map((item) => item.key)).toEqual(["b", "a"]);
    // Incoming label equal to its key falls back to the previous human label.
    expect(merged.items[1]?.label).toBe("m_quota.code_5h");
    expect(merged.items[1]?.windowSeconds).toBe(18000);
  });

  test("returns the incoming state untouched when there is no previous state", () => {
    const incoming = state([{ key: "five_hour", label: "5h", percent: 50 }]);
    expect(mergeQuotaState(undefined, incoming)).toBe(incoming);
  });
});
