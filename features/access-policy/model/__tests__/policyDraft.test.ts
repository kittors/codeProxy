import { describe, expect, test } from "vitest";
import { emptyQuotaMatrix } from "@code-proxy/api-client";
import {
  draftToRoutes,
  draftToRules,
  emptyMatrixDraft,
  matrixToDraft,
  parseMatrixDraft,
  parseQuotaInput,
  policyToDraft,
} from "../policyDraft";

describe("quota input parsing", () => {
  test("blank means unlimited", () => {
    expect(parseQuotaInput("cost", "  ")).toEqual({ value: 0 });
  });

  test("spending accepts dollars and decimals, rounded up like the server", () => {
    expect(parseQuotaInput("cost", "$12.10")).toEqual({ value: 13 });
    expect(parseQuotaInput("cost", "1,000")).toEqual({ value: 1000 });
    expect(parseQuotaInput("cost", "12k").issue).toBe("invalid");
  });

  test("counts accept K / M / B shorthands and must be whole", () => {
    expect(parseQuotaInput("tokens", "5M")).toEqual({ value: 5_000_000 });
    expect(parseQuotaInput("tokens", "1.5k")).toEqual({ value: 1500 });
    expect(parseQuotaInput("requests", "250")).toEqual({ value: 250 });
    expect(parseQuotaInput("requests", "1.2345k").issue).toBe("not_integer");
    expect(parseQuotaInput("requests", "3B").issue).toBe("too_large");
    expect(parseQuotaInput("requests", "-1").issue).toBe("invalid");
  });

  test("token limits render back in their compact form without losing precision", () => {
    const matrix = emptyQuotaMatrix();
    matrix.tokens.day = 5_000_000;
    matrix.tokens.week = 1_234_567;
    matrix.cost.month = 50;
    const draft = matrixToDraft(matrix);
    expect(draft.tokens.day).toBe("5M");
    expect(draft.tokens.week).toBe("1234567");
    expect(draft.cost.month).toBe("50");
    expect(draft.requests.day).toBe("");
    expect(parseMatrixDraft(draft).matrix).toEqual(matrix);
  });

  test("collects every unparsable cell", () => {
    const draft = emptyMatrixDraft();
    draft.cost.day = "abc";
    draft.tokens["5h"] = "0.5";
    expect(parseMatrixDraft(draft).issues).toEqual({ "cost.day": "invalid", "tokens.5h": "not_integer" });
  });
});

describe("rule and route drafts", () => {
  test("round-trip keeps ids, names and fallbacks", () => {
    const limits = emptyQuotaMatrix();
    limits.requests.week = 900;
    const draft = policyToDraft({
      limits: emptyQuotaMatrix(),
      rules: [{ id: "opus", name: "Opus", models: ["claude-opus-*"], limits, "fallback-model": "claude-sonnet-4-5" }],
      routes: [{ id: "r1", from: ["gpt-5"], to: "gpt-5-mini" }],
    });
    expect(draftToRules(draft.rules)).toEqual([
      { id: "opus", name: "Opus", models: ["claude-opus-*"], limits, "fallback-model": "claude-sonnet-4-5" },
    ]);
    expect(draftToRoutes(draft.routes)).toEqual([{ id: "r1", from: ["gpt-5"], to: "gpt-5-mini" }]);
  });

  test("blank names and fallbacks are left out", () => {
    const draft = policyToDraft({
      limits: emptyQuotaMatrix(),
      rules: [{ id: "", models: ["gpt-5"], limits: emptyQuotaMatrix() }],
    });
    draft.rules[0].name = "   ";
    draft.rules[0].limits.cost.day = "10";
    expect(draftToRules(draft.rules)[0]).not.toHaveProperty("name");
    expect(draftToRules(draft.rules)[0]).not.toHaveProperty("fallback-model");
  });
});
