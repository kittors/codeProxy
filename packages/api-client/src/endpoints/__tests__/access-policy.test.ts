import { describe, expect, test } from "vitest";
import {
  configuredQuotaCells,
  emptyQuotaMatrix,
  isQuotaMatrixEmpty,
  legacyQuotaMatrix,
  normalizeCappedCells,
  normalizeModelRoutes,
  normalizeModelRules,
  normalizeQuotaMatrix,
  normalizeQuotaUsageView,
  quotaMatrixEquals,
  quotaMatrixToPatch,
  readAccessPolicyCapabilities,
} from "@code-proxy/api-client/endpoints/access-policy";

describe("access policy normalization", () => {
  test("only an explicit true counts as a capability", () => {
    expect(readAccessPolicyCapabilities({ "access-policy": true, "owned-key-admin": "true" })).toMatchObject({
      accessPolicy: true,
      ownedKeyAdmin: false,
    });
    expect(readAccessPolicyCapabilities(null).accessPolicy).toBe(false);
  });

  test("matrices drop junk and negative values", () => {
    const matrix = normalizeQuotaMatrix({ cost: { day: "12", week: -3 }, requests: { "5h": 40 }, tokens: "x" });
    expect(matrix.cost.day).toBe(12);
    expect(matrix.cost.week).toBe(0);
    expect(matrix.requests["5h"]).toBe(40);
    expect(isQuotaMatrixEmpty(emptyQuotaMatrix())).toBe(true);
    expect(configuredQuotaCells(matrix)).toEqual([
      { metric: "cost", window: "day", value: 12 },
      { metric: "requests", window: "5h", value: 40 },
    ]);
    expect(quotaMatrixEquals(matrix, normalizeQuotaMatrix(quotaMatrixToPatch(matrix)))).toBe(true);
  });

  test("rules and routes without models are dropped; optional fields stay optional", () => {
    expect(
      normalizeModelRules([
        { id: "a", models: ["gpt-5", "gpt-5", " "], limits: { cost: { day: 1 } }, "fallback-model": " " },
        { id: "b", models: [] },
        "junk",
      ]),
    ).toEqual([{ id: "a", models: ["gpt-5"], limits: expect.objectContaining({}) }]);
    expect(normalizeModelRoutes([{ id: "r", from: ["a"], to: "" }, { id: "s", from: ["a"], to: "b" }])).toEqual([
      { id: "s", from: ["a"], to: "b" },
    ]);
    expect(normalizeCappedCells([{ id: "k", metric: "tokens", window: "day", from: 9, to: 5 }, { metric: "x" }])).toEqual([
      { id: "k", metric: "tokens", window: "day", from: 9, to: 5 },
    ]);
  });

  test("what requests in flight hold is kept only while something is held", () => {
    const held = normalizeQuotaUsageView({ total: {}, "in-flight": { requests: 2, tokens: "1200", cost: 0.3 } });
    expect(held?.["in-flight"]).toEqual({ requests: 2, tokens: 1200, cost: 0.3 });
    // 还没有计费历史的 Key 只预留请求数，Token 与花费是 0。
    expect(normalizeQuotaUsageView({ total: {}, "in-flight": { requests: 1, cost: -1 } })?.["in-flight"]).toEqual({
      requests: 1,
      tokens: 0,
      cost: 0,
    });
    // 没有在途请求、旧后端或垃圾值：整项缺省，界面不必再判断。
    for (const inFlight of [undefined, null, "2", { requests: 0, cost: 5 }, { requests: "x" }]) {
      expect(normalizeQuotaUsageView({ total: {}, "in-flight": inFlight })).not.toHaveProperty("in-flight");
    }
  });

  test("legacy flat fields map onto their cells", () => {
    const matrix = legacyQuotaMatrix({
      // 旧数据只有 daily-spending-limit，没有 period-spending-limits.day。
      periodSpendingLimits: { "5h": 5, week: 0, month: 0 },
      dailySpendingLimit: 20,
      spendingLimit: 300,
      dailyLimit: 100,
      totalQuota: 1000,
    });
    expect(matrix.cost).toEqual({ "5h": 5, day: 20, week: 0, month: 0, lifetime: 300 });
    expect(matrix.requests).toEqual({ "5h": 0, day: 100, week: 0, month: 0, lifetime: 1000 });
  });
});
