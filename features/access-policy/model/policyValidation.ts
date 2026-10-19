import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  quotaCellKey,
  type QuotaCellKey,
  type QuotaMatrix,
  type QuotaMetric,
} from "@code-proxy/api-client";
import {
  MAX_QUOTA,
  MAX_REQUEST_QUOTA,
  parseMatrixDraft,
  parseQuotaInput,
  type AccessPolicyDraft,
  type ModelRouteDraft,
  type ModelRuleDraft,
  type QuotaInputIssue,
  type QuotaMatrixDraft,
} from "./policyDraft";
import { formatQuotaAmount } from "./quotaFormat";
import { isStarOnlyPattern, isWildcardPattern, matchesAnyModelPattern } from "./modelMatch";

/** 与后端 internal/quota/policy.go 的上限一致。 */
export const MAX_MODEL_RULES = 50;
export const MAX_MODEL_ROUTES = 50;
export const MAX_PATTERNS_PER_ENTRY = 100;
const MAX_PATTERN_LENGTH = 200;
const MAX_RULE_NAME_LENGTH = 80;

/** 一处错误：文案键 + 参数；键不带点号时取 validation.* 命名空间。 */
export interface PolicyIssue {
  key: string;
  params?: Record<string, string | number>;
}

/** 按位置索引的错误，例如 "limits.cost.day"、"rules.<key>.fallback"、"routes.<key>.to"。 */
export type PolicyIssues = Record<string, PolicyIssue>;

export interface PolicyValidationOptions {
  /** 可编辑的总额度格子；其余格子（只读或旧后端不支持）不校验。缺省全部可编辑。 */
  editableCells?: ReadonlySet<QuotaCellKey>;
  /** Key 的子额度不能超过账号同一格（账号该格为 0 时不限制）。 */
  ceiling?: QuotaMatrix;
  /** 白名单非空时，路由目标与降级模型必须在其中（后端按原文精确比较）。 */
  allowedModels?: readonly string[];
  /** 是否校验规则与路由（旧后端没有这两项，草稿里也不会有内容）。 */
  rules?: boolean;
  routes?: boolean;
}

const inputIssue = (metric: QuotaMetric, issue: QuotaInputIssue): PolicyIssue => {
  switch (issue) {
    case "too_large":
      return {
        key: "access_policy.issue.too_large",
        params: { max: metric === "requests" ? MAX_REQUEST_QUOTA.toLocaleString() : MAX_QUOTA.toLocaleString() },
      };
    case "not_integer":
      return { key: "access_policy.issue.not_integer" };
    default:
      return { key: metric === "cost" ? "access_policy.issue.invalid_amount" : "access_policy.issue.invalid_count" };
  }
};

const validateMatrixDraft = (
  draft: QuotaMatrixDraft,
  prefix: string,
  issues: PolicyIssues,
  options: { editableCells?: ReadonlySet<QuotaCellKey>; ceiling?: QuotaMatrix },
) => {
  for (const metric of QUOTA_METRICS) {
    for (const window of QUOTA_WINDOWS) {
      const cell = quotaCellKey(metric, window);
      if (options.editableCells && !options.editableCells.has(cell)) continue;
      const result = parseQuotaInput(metric, draft[metric][window]);
      const path = `${prefix}.${cell}`;
      if (result.issue) {
        issues[path] = inputIssue(metric, result.issue);
        continue;
      }
      const limit = options.ceiling?.[metric][window] ?? 0;
      if (limit > 0 && result.value > limit) {
        issues[path] = {
          key: "exceeds_account_limit",
          params: { limit: formatQuotaAmount(metric, limit) },
        };
      }
    }
  }
};

const validatePatterns = (patterns: readonly string[], path: string, issues: PolicyIssues) => {
  const cleaned = patterns.map((pattern) => pattern.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    issues[path] = { key: "access_policy.issue.models_required" };
    return;
  }
  if (cleaned.length > MAX_PATTERNS_PER_ENTRY) {
    issues[path] = { key: "access_policy.issue.too_many_models", params: { max: MAX_PATTERNS_PER_ENTRY } };
    return;
  }
  if (cleaned.some(isStarOnlyPattern)) {
    issues[path] = { key: "access_policy.issue.star_only" };
    return;
  }
  if (cleaned.some((pattern) => pattern.length > MAX_PATTERN_LENGTH)) {
    issues[path] = { key: "access_policy.issue.pattern_too_long", params: { max: MAX_PATTERN_LENGTH } };
  }
};

/** 路由目标与降级模型：必须是具体模型，且在白名单（若有）里。 */
const validateTarget = (
  target: string,
  path: string,
  issues: PolicyIssues,
  allowedModels: readonly string[] | undefined,
): boolean => {
  if (isWildcardPattern(target)) {
    issues[path] = { key: "access_policy.issue.target_wildcard" };
    return false;
  }
  if (target.length > MAX_PATTERN_LENGTH) {
    issues[path] = { key: "max_length", params: { max: MAX_PATTERN_LENGTH } };
    return false;
  }
  if (allowedModels && allowedModels.length > 0 && !allowedModels.some((model) => model.trim() === target)) {
    issues[path] = { key: "access_policy.issue.target_not_allowed", params: { model: target } };
    return false;
  }
  return true;
};

const validateRule = (
  rule: ModelRuleDraft,
  issues: PolicyIssues,
  allowedModels: readonly string[] | undefined,
) => {
  const prefix = `rules.${rule.key}`;
  if (rule.name.trim().length > MAX_RULE_NAME_LENGTH) {
    issues[`${prefix}.name`] = { key: "max_length", params: { max: MAX_RULE_NAME_LENGTH } };
  }
  validatePatterns(rule.models, `${prefix}.models`, issues);
  const before = Object.keys(issues).length;
  validateMatrixDraft(rule.limits, `${prefix}.limits`, issues, {});
  const parsed = parseMatrixDraft(rule.limits);
  const hasLimit = QUOTA_METRICS.some((metric) =>
    QUOTA_WINDOWS.some((window) => parsed.matrix[metric][window] > 0),
  );
  if (!hasLimit && Object.keys(issues).length === before) {
    // 没有任何限额的规则什么也不做，却会显示成一条「规则」，让人以为模型已被限制。
    issues[`${prefix}.limits`] = { key: "access_policy.issue.rule_needs_limit" };
  }
  const fallback = rule.fallback.trim();
  if (!fallback) return;
  if (!validateTarget(fallback, `${prefix}.fallback`, issues, allowedModels)) return;
  if (matchesAnyModelPattern(rule.models, fallback)) {
    // 降级目标仍命中本规则：额度用完后照样触顶，降级永远不会发生。
    issues[`${prefix}.fallback`] = { key: "access_policy.issue.fallback_self_match" };
  }
};

const validateRoute = (
  route: ModelRouteDraft,
  issues: PolicyIssues,
  allowedModels: readonly string[] | undefined,
) => {
  const prefix = `routes.${route.key}`;
  validatePatterns(route.from, `${prefix}.from`, issues);
  const to = route.to.trim();
  if (!to) {
    issues[`${prefix}.to`] = { key: "required" };
    return;
  }
  if (!validateTarget(to, `${prefix}.to`, issues, allowedModels)) return;
  if (matchesAnyModelPattern(route.from, to)) {
    issues[`${prefix}.to`] = { key: "access_policy.issue.route_self_match" };
  }
};

/** 校验整份策略草稿，返回按位置索引的错误；空对象表示可以提交。 */
export const validatePolicyDraft = (
  draft: AccessPolicyDraft,
  options: PolicyValidationOptions = {},
): PolicyIssues => {
  const issues: PolicyIssues = {};
  validateMatrixDraft(draft.limits, "limits", issues, {
    editableCells: options.editableCells,
    ceiling: options.ceiling,
  });
  if (options.rules !== false) {
    if (draft.rules.length > MAX_MODEL_RULES) {
      issues.rules = { key: "access_policy.issue.too_many_rules", params: { max: MAX_MODEL_RULES } };
    }
    for (const rule of draft.rules) validateRule(rule, issues, options.allowedModels);
  }
  if (options.routes !== false) {
    if (draft.routes.length > MAX_MODEL_ROUTES) {
      issues.routes = { key: "access_policy.issue.too_many_routes", params: { max: MAX_MODEL_ROUTES } };
    }
    for (const route of draft.routes) validateRoute(route, issues, options.allowedModels);
  }
  return issues;
};

/** 错误所在的分区，用于在导航上标红点、提交失败时跳到第一处错误。 */
export const issueSection = (path: string): "limits" | "rules" | "routes" | null => {
  if (path.startsWith("limits")) return "limits";
  if (path.startsWith("rules")) return "rules";
  if (path.startsWith("routes")) return "routes";
  return null;
};

/** 某个前缀下是否有错误（例如一条规则的卡片）。 */
export const hasIssueUnder = (issues: PolicyIssues, prefix: string): boolean =>
  Object.keys(issues).some((path) => path === prefix || path.startsWith(`${prefix}.`));
