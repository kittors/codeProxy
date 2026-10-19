import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  emptyQuotaMatrix,
  type ModelRoute,
  type ModelRule,
  type QuotaCellKey,
  type QuotaMatrix,
  type QuotaMetric,
  type QuotaWindow,
} from "@code-proxy/api-client";

/** 输入框里的原始文本：留空即不限制，保存时再解析。 */
export type QuotaMatrixDraft = Record<QuotaMetric, Record<QuotaWindow, string>>;

export interface ModelRuleDraft {
  /** 仅用于 React key 与错误定位；新规则的 id 由后端生成。 */
  key: string;
  id: string;
  name: string;
  models: string[];
  limits: QuotaMatrixDraft;
  fallback: string;
}

export interface ModelRouteDraft {
  key: string;
  id: string;
  from: string[];
  to: string;
}

export interface AccessPolicyDraft {
  limits: QuotaMatrixDraft;
  rules: ModelRuleDraft[];
  routes: ModelRouteDraft[];
}

let draftSeq = 0;
export const newDraftKey = (): string => `d${Date.now().toString(36)}${(draftSeq++).toString(36)}`;

export const emptyMatrixDraft = (): QuotaMatrixDraft => ({
  cost: { "5h": "", day: "", week: "", month: "", lifetime: "" },
  requests: { "5h": "", day: "", week: "", month: "", lifetime: "" },
  tokens: { "5h": "", day: "", week: "", month: "", lifetime: "" },
});

const COMPACT_UNITS: Array<[string, number]> = [
  ["B", 1e9],
  ["M", 1e6],
  ["K", 1e3],
];

/** Token 上限写成 5M、1.5M、250K 这种形式；除不尽时保留原数字，不制造精度损失。 */
const compactExact = (value: number): string => {
  for (const [suffix, unit] of COMPACT_UNITS) {
    if (value < unit) continue;
    const scaled = value / unit;
    if (Number.isInteger(scaled * 10)) return `${scaled}${suffix}`;
  }
  return String(value);
};

export const formatDraftValue = (metric: QuotaMetric, value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "";
  return metric === "tokens" ? compactExact(value) : String(value);
};

export const matrixToDraft = (matrix: QuotaMatrix): QuotaMatrixDraft => {
  const draft = emptyMatrixDraft();
  for (const metric of QUOTA_METRICS) {
    for (const window of QUOTA_WINDOWS) {
      draft[metric][window] = formatDraftValue(metric, matrix[metric][window]);
    }
  }
  return draft;
};

/** 后端的数值上限：请求次数有两格落在 INTEGER 列上，统一以 int32 为界。 */
export const MAX_REQUEST_QUOTA = 2_147_483_647;
export const MAX_QUOTA = 2 ** 53;

export type QuotaInputIssue = "invalid" | "not_integer" | "too_large";

export type QuotaInputResult = { value: number; issue?: undefined } | { value?: undefined; issue: QuotaInputIssue };

const SUFFIX_MULTIPLIER: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * 解析一格输入。花费接受小数与 "$"，按整美元向上取整（与后端一致）；请求次数与 Token 接受
 * 1.5K / 5M / 2B 这样的缩写，结果必须是整数。空值表示不限制。
 */
export const parseQuotaInput = (metric: QuotaMetric, raw: string): QuotaInputResult => {
  const text = raw.trim().replace(/[,_\s]/g, "");
  if (!text) return { value: 0 };
  if (metric === "cost") {
    const amount = text.startsWith("$") ? text.slice(1) : text;
    if (!/^\d+(\.\d+)?$/.test(amount)) return { issue: "invalid" };
    const value = Math.ceil(Number.parseFloat(amount));
    return value > MAX_QUOTA ? { issue: "too_large" } : { value };
  }
  const match = /^(\d+(?:\.\d+)?)([kmb])?$/i.exec(text);
  if (!match) return { issue: "invalid" };
  const multiplier = match[2] ? SUFFIX_MULTIPLIER[match[2].toLowerCase()] : 1;
  const value = Number.parseFloat(match[1]) * multiplier;
  // 1.5K 先乘出 1500.0000000002 这种浮点误差，按 1e-6 的容差判断是否为整数。
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > 1e-6) return { issue: "not_integer" };
  const limit = metric === "requests" ? MAX_REQUEST_QUOTA : MAX_QUOTA;
  return rounded > limit ? { issue: "too_large" } : { value: rounded };
};

export interface ParsedMatrix {
  matrix: QuotaMatrix;
  issues: Partial<Record<QuotaCellKey, QuotaInputIssue>>;
}

export const parseMatrixDraft = (draft: QuotaMatrixDraft): ParsedMatrix => {
  const matrix = emptyQuotaMatrix();
  const issues: ParsedMatrix["issues"] = {};
  for (const metric of QUOTA_METRICS) {
    for (const window of QUOTA_WINDOWS) {
      const result = parseQuotaInput(metric, draft[metric][window]);
      if (result.issue) issues[`${metric}.${window}`] = result.issue;
      else matrix[metric][window] = result.value;
    }
  }
  return { matrix, issues };
};

export const isMatrixDraftEmpty = (draft: QuotaMatrixDraft): boolean =>
  QUOTA_METRICS.every((metric) => QUOTA_WINDOWS.every((window) => !draft[metric][window].trim()));

export const ruleToDraft = (rule: ModelRule): ModelRuleDraft => ({
  key: newDraftKey(),
  id: rule.id,
  name: rule.name ?? "",
  models: [...rule.models],
  limits: matrixToDraft(rule.limits),
  fallback: rule["fallback-model"] ?? "",
});

export const routeToDraft = (route: ModelRoute): ModelRouteDraft => ({
  key: newDraftKey(),
  id: route.id,
  from: [...route.from],
  to: route.to,
});

export const emptyRuleDraft = (): ModelRuleDraft => ({
  key: newDraftKey(),
  id: "",
  name: "",
  models: [],
  limits: emptyMatrixDraft(),
  fallback: "",
});

export const emptyRouteDraft = (): ModelRouteDraft => ({
  key: newDraftKey(),
  id: "",
  from: [],
  to: "",
});

export const policyToDraft = (policy: {
  limits: QuotaMatrix;
  rules?: readonly ModelRule[];
  routes?: readonly ModelRoute[];
}): AccessPolicyDraft => ({
  limits: matrixToDraft(policy.limits),
  rules: (policy.rules ?? []).map(ruleToDraft),
  routes: (policy.routes ?? []).map(routeToDraft),
});

/**
 * 草稿转回规则。只在校验通过后调用：解析失败的格子按 0 处理。
 * 空 id 交给后端生成；名称为空时不写出，后端也不会存。
 */
export const draftToRules = (drafts: readonly ModelRuleDraft[]): ModelRule[] =>
  drafts.map((draft) => {
    const rule: ModelRule = {
      id: draft.id,
      models: draft.models.map((model) => model.trim()).filter(Boolean),
      limits: parseMatrixDraft(draft.limits).matrix,
    };
    const name = draft.name.trim();
    if (name) rule.name = name;
    const fallback = draft.fallback.trim();
    if (fallback) rule["fallback-model"] = fallback;
    return rule;
  });

export const draftToRoutes = (drafts: readonly ModelRouteDraft[]): ModelRoute[] =>
  drafts.map((draft) => ({
    id: draft.id,
    from: draft.from.map((model) => model.trim()).filter(Boolean),
    to: draft.to.trim(),
  }));
