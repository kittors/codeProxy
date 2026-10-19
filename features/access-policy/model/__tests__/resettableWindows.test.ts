import { describe, expect, test } from "vitest";
import { emptyQuotaMatrix } from "@code-proxy/api-client";
import { describeWindowParts, resettableWindows } from "../resettableWindows";

describe("resettableWindows", () => {
  test("lists every window with a total or per-model limit and its usage", () => {
    const limits = emptyQuotaMatrix();
    limits.cost.day = 10;
    limits.requests.day = 500;
    const ruleLimits = emptyQuotaMatrix();
    ruleLimits.tokens.week = 1_000_000;
    const usedTotal = emptyQuotaMatrix();
    usedTotal.cost.day = 3;
    usedTotal.requests.day = 120;
    const usedRule = emptyQuotaMatrix();
    usedRule.tokens.week = 250_000;
    const windows = resettableWindows(
      limits,
      [{ id: "opus", name: "Opus", models: ["claude-opus-*"], limits: ruleLimits }],
      { total: usedTotal, rules: [{ id: "opus", used: usedRule }] },
    );
    expect(windows.map((item) => item.window)).toEqual(["day", "week"]);
    const t = (key: string, options?: Record<string, unknown>) =>
      key === "access_policy.rule_part" ? `${options?.rule}: ${options?.part}` : key.split(".").pop() ?? key;
    expect(describeWindowParts(t, windows[0].parts)).toBe("cost $3 / $10 · requests 120 / 500");
    expect(describeWindowParts(t, windows[1].parts)).toBe("Opus: tokens 250K / 1M");
  });

  test("nothing configured means nothing to reset", () => {
    expect(resettableWindows(emptyQuotaMatrix(), [])).toEqual([]);
  });
});
