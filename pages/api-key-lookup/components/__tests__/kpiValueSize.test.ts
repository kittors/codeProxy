import { describe, expect, test } from "vitest";
import { formatQuotaUsd, kpiValueSizeClass } from "../kpiValueSize";

describe("kpiValueSizeClass", () => {
  test("keeps large type for short values", () => {
    expect(kpiValueSizeClass("21")).toBe("text-2xl");
    expect(kpiValueSizeClass("99.5%")).toBe("text-2xl");
    expect(kpiValueSizeClass("$25.91")).toBe("text-2xl");
  });

  test("shrinks long used/limit pairs", () => {
    // lengths after stripping spaces: 14 / 18 / 25
    expect(kpiValueSizeClass("$25.91 / $300.00")).toBe("text-lg");
    expect(kpiValueSizeClass("$1,268.50 / $10,000.00")).toBe("text-base");
    expect(kpiValueSizeClass("1,792,389,816 / 9,999,999,999")).toBe("text-sm");
  });

  test("formats USD with two decimals", () => {
    expect(formatQuotaUsd(25.9065)).toBe("$25.91");
    expect(formatQuotaUsd(300)).toBe("$300.00");
  });
});
