import { describe, expect, test } from "vitest";
import type { OpenCodeGoUsageItem } from "@code-proxy/api-client";
import {
  isCredentialUsageSortMode,
  resolveCredentialDisplayOrder,
  resolveCredentialRemaining,
  resolveEntryRemaining,
  resolveWindowRemaining,
} from "../provider-usage-sort";

const window = (percentage: number, type = "weekly"): OpenCodeGoUsageItem => ({
  type,
  label: type,
  percentage,
  resets_in: "1h",
});

describe("resolveWindowRemaining", () => {
  test("reports the complement of consumption", () => {
    expect(resolveWindowRemaining(0)).toBe(100);
    expect(resolveWindowRemaining(30)).toBe(70);
    expect(resolveWindowRemaining(100)).toBe(0);
  });

  test("clamps readings outside 0-100 rather than propagating them", () => {
    expect(resolveWindowRemaining(140)).toBe(0);
    expect(resolveWindowRemaining(-20)).toBe(100);
  });

  test("treats unusable readings as unknown", () => {
    expect(resolveWindowRemaining(undefined)).toBeNull();
    expect(resolveWindowRemaining(Number.NaN)).toBeNull();
    expect(resolveWindowRemaining(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("resolveCredentialRemaining", () => {
  // A comfortable monthly allowance does not help when the 5-hour window is
  // spent: the credential is unusable right now, and must sort that way.
  test("takes the tightest window, not the most flattering", () => {
    expect(
      resolveCredentialRemaining([
        window(5, "monthly"),
        window(95, "five_hour"),
        window(40, "weekly"),
      ]),
    ).toBe(5);
  });

  test("ignores unusable windows but keeps the rest", () => {
    expect(
      resolveCredentialRemaining([
        { ...window(0), percentage: Number.NaN },
        window(25),
      ]),
    ).toBe(75);
  });

  test("is unknown when nothing is readable", () => {
    expect(resolveCredentialRemaining([])).toBeNull();
    expect(resolveCredentialRemaining(undefined)).toBeNull();
    expect(
      resolveCredentialRemaining([{ ...window(0), percentage: Number.NaN }]),
    ).toBeNull();
  });
});

describe("resolveEntryRemaining", () => {
  test("reads through a healthy cache entry", () => {
    expect(
      resolveEntryRemaining({ usage: [window(20)], updatedAt: 1 }),
    ).toBe(80);
  });

  // A failed refresh must not sort on whatever response happened to be attached
  // before it: that number is no longer known to be true.
  test("discards a reading attached to a failed entry", () => {
    expect(
      resolveEntryRemaining({ usage: [window(20)], updatedAt: 1, error: "boom" }),
    ).toBeNull();
    expect(resolveEntryRemaining(undefined)).toBeNull();
  });
});

describe("resolveCredentialDisplayOrder", () => {
  const remaining: Record<number, number | null> = {
    0: 60,
    1: 10,
    2: null,
    3: 90,
  };
  const read = (index: number) => remaining[index] ?? null;

  test("config mode preserves the configured order", () => {
    expect(resolveCredentialDisplayOrder(4, "config", read)).toEqual([0, 1, 2, 3]);
  });

  test("ascending puts the most exhausted credential first", () => {
    expect(resolveCredentialDisplayOrder(4, "remaining_asc", read)).toEqual([
      1, 0, 3, 2,
    ]);
  });

  test("descending puts the most available credential first", () => {
    expect(resolveCredentialDisplayOrder(4, "remaining_desc", read)).toEqual([
      3, 0, 1, 2,
    ]);
  });

  // Unknown is neither empty nor full. Floating it to the top of either order
  // would bury the credentials the operator opened this view to find.
  test("parks unknown readings last in both directions", () => {
    const allUnknownButOne = (index: number) => (index === 2 ? 50 : null);
    expect(
      resolveCredentialDisplayOrder(4, "remaining_asc", allUnknownButOne)[0],
    ).toBe(2);
    expect(
      resolveCredentialDisplayOrder(4, "remaining_desc", allUnknownButOne)[0],
    ).toBe(2);
  });

  // The returned positions index the original array — the card list uses them
  // for edit, delete and the usage cache key, so they must stay a permutation.
  test("returns a permutation of the original positions", () => {
    const order = resolveCredentialDisplayOrder(4, "remaining_desc", read);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  test("ties and equal unknowns keep configured order", () => {
    const flat = () => 50;
    expect(resolveCredentialDisplayOrder(3, "remaining_asc", flat)).toEqual([0, 1, 2]);
    const none = () => null;
    expect(resolveCredentialDisplayOrder(3, "remaining_desc", none)).toEqual([0, 1, 2]);
  });

  test("handles empty and degenerate counts", () => {
    expect(resolveCredentialDisplayOrder(0, "remaining_asc", read)).toEqual([]);
    expect(resolveCredentialDisplayOrder(-1, "remaining_asc", read)).toEqual([]);
  });
});

describe("isCredentialUsageSortMode", () => {
  test("accepts known modes and rejects anything else", () => {
    expect(isCredentialUsageSortMode("config")).toBe(true);
    expect(isCredentialUsageSortMode("remaining_asc")).toBe(true);
    expect(isCredentialUsageSortMode("remaining_desc")).toBe(true);
    expect(isCredentialUsageSortMode("remaining")).toBe(false);
    expect(isCredentialUsageSortMode(null)).toBe(false);
  });
});
