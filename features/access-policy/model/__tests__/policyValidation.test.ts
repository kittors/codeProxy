import { describe, expect, test } from "vitest";
import { emptyQuotaMatrix } from "@code-proxy/api-client";
import { emptyMatrixDraft, emptyRouteDraft, emptyRuleDraft, type AccessPolicyDraft } from "../policyDraft";
import { hasIssueUnder, issueSection, validatePolicyDraft } from "../policyValidation";

const baseDraft = (): AccessPolicyDraft => ({ limits: emptyMatrixDraft(), rules: [], routes: [] });

describe("validatePolicyDraft", () => {
  test("an empty policy is valid", () => {
    expect(validatePolicyDraft(baseDraft())).toEqual({});
  });

  test("key cells may not exceed the account ceiling", () => {
    const draft = baseDraft();
    draft.limits.cost.day = "80";
    draft.limits.requests.week = "500";
    const ceiling = emptyQuotaMatrix();
    ceiling.cost.day = 50;
    const issues = validatePolicyDraft(draft, { ceiling });
    expect(issues["limits.cost.day"]).toEqual({ key: "exceeds_account_limit", params: { limit: "$50" } });
    // 账号这一格不限制时 Key 可以随意设置。
    expect(issues["limits.requests.week"]).toBeUndefined();
  });

  test("read-only cells are not validated", () => {
    const draft = baseDraft();
    draft.limits.tokens.day = "nonsense";
    expect(validatePolicyDraft(draft, { editableCells: new Set(["cost.day"]) })).toEqual({});
  });

  test("rules need models, at least one limit, and a fallback outside themselves", () => {
    const draft = baseDraft();
    const rule = emptyRuleDraft();
    draft.rules = [rule];
    let issues = validatePolicyDraft(draft);
    expect(issues[`rules.${rule.key}.models`]?.key).toBe("access_policy.issue.models_required");
    expect(issues[`rules.${rule.key}.limits`]?.key).toBe("access_policy.issue.rule_needs_limit");

    rule.models = ["claude-opus-*"];
    rule.limits.requests.week = "100";
    rule.fallback = "claude-opus-4-5";
    issues = validatePolicyDraft(draft);
    expect(issues[`rules.${rule.key}.fallback`]?.key).toBe("access_policy.issue.fallback_self_match");

    rule.fallback = "claude-*";
    expect(validatePolicyDraft(draft)[`rules.${rule.key}.fallback`]?.key).toBe(
      "access_policy.issue.target_wildcard",
    );

    rule.fallback = "claude-sonnet-4-5";
    expect(validatePolicyDraft(draft)).toEqual({});
    expect(validatePolicyDraft(draft, { allowedModels: ["gpt-5"] })[`rules.${rule.key}.fallback`]).toEqual({
      key: "access_policy.issue.target_not_allowed",
      params: { model: "claude-sonnet-4-5" },
    });
  });

  test("a lone star is rejected: all models are the account-wide limits", () => {
    const draft = baseDraft();
    const rule = emptyRuleDraft();
    rule.models = ["*"];
    rule.limits.cost.day = "5";
    draft.rules = [rule];
    expect(validatePolicyDraft(draft)[`rules.${rule.key}.models`]?.key).toBe("access_policy.issue.star_only");
  });

  test("routes need a concrete target outside their own sources", () => {
    const draft = baseDraft();
    const route = emptyRouteDraft();
    route.from = ["gpt-5*"];
    draft.routes = [route];
    expect(validatePolicyDraft(draft)[`routes.${route.key}.to`]?.key).toBe("required");
    route.to = "gpt-5-mini";
    expect(validatePolicyDraft(draft)[`routes.${route.key}.to`]?.key).toBe("access_policy.issue.route_self_match");
    route.to = "gpt-4o";
    expect(validatePolicyDraft(draft)).toEqual({});
    expect(validatePolicyDraft(draft, { routes: false, rules: false })).toEqual({});
  });

  test("issue helpers locate sections and cards", () => {
    expect(issueSection("limits.cost.day")).toBe("limits");
    expect(issueSection("rules.d1.models")).toBe("rules");
    expect(issueSection("routes.d2.to")).toBe("routes");
    expect(hasIssueUnder({ "rules.d1.models": { key: "required" } }, "rules.d1")).toBe(true);
    expect(hasIssueUnder({ "rules.d10.models": { key: "required" } }, "rules.d1")).toBe(false);
  });
});
