import { describe, expect, test } from "vitest";
import {
  QUOTA_WINDOW_SIZE_MIN_USED_PERCENT,
  formatQuotaSpendUsd,
  resolveQuotaWindowSpend,
} from "../quota-spend";

describe("formatQuotaSpendUsd", () => {
  test("prints cents, a floor for tiny spend and whole dollars past a thousand", () => {
    expect(formatQuotaSpendUsd(12.345)).toBe("$12.35");
    expect(formatQuotaSpendUsd(0)).toBe("$0.00");
    // A handful of cheap requests must not read as an unused window.
    expect(formatQuotaSpendUsd(0.0004)).toBe("<$0.01");
    expect(formatQuotaSpendUsd(0.006)).toBe("$0.01");
    expect(formatQuotaSpendUsd(1234.56)).toBe("$1,235");
    expect(formatQuotaSpendUsd(Number.NaN)).toBe("$0.00");
  });
});

describe("resolveQuotaWindowSpend", () => {
  test("pairs the spend with the share used and the window it implies", () => {
    // 40% left: 60% used for $12 → the whole window is $20.
    expect(resolveQuotaWindowSpend({ label: "5h", percent: 40, usedCostUsd: 12 })).toEqual({
      usedCostUsd: 12,
      usedPercent: 60,
      windowSizeUsd: 20,
    });
  });

  test("has nothing to say without a spend figure", () => {
    // An older backend, or a window no model request draws on.
    expect(resolveQuotaWindowSpend({ label: "review", percent: 40 })).toBeNull();
    expect(resolveQuotaWindowSpend(null)).toBeNull();
  });

  test("does not project a window size from a share too small to divide by", () => {
    const remaining = 100 - (QUOTA_WINDOW_SIZE_MIN_USED_PERCENT - 1);
    expect(resolveQuotaWindowSpend({ label: "week", percent: remaining, usedCostUsd: 1 })).toEqual({
      usedCostUsd: 1,
      usedPercent: QUOTA_WINDOW_SIZE_MIN_USED_PERCENT - 1,
      windowSizeUsd: null,
    });
    // Unknown share: the spend still shows, the projection does not.
    expect(resolveQuotaWindowSpend({ label: "week", percent: null, usedCostUsd: 3 })).toEqual({
      usedCostUsd: 3,
      usedPercent: null,
      windowSizeUsd: null,
    });
    // Spent nothing: no window to project from.
    expect(
      resolveQuotaWindowSpend({ label: "week", percent: 50, usedCostUsd: 0 })?.windowSizeUsd,
    ).toBeNull();
  });
});
