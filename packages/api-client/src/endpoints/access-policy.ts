import { isRecord } from "../client/response";
import { normalizePeriodSpendingLimits, type PeriodSpendingLimits } from "./period-spending";

/**
 * 访问策略：账号、权限模板与 Key 共用的一套额度模型。
 *
 * - 额度矩阵：花费（USD）/ 请求次数 / Token × 5 小时 / 每日 / 每周 / 每月 / 累计，
 *   0 表示该格不限制；
 * - 按模型规则：一组模型模式（支持 `claude-opus-*` 通配）配一套自己的矩阵，叠加在总额度
 *   之上，任何一层触顶即拒绝；可选「超额降级模型」：用完后改用该模型继续服务；
 * - 模型路由：把请求的模型改写成另一个模型（只在账号 / 模板层配置）。
 *
 * 后端用 `capabilities["access-policy"]` 声明支持；面板会自动升级、可能跑在旧后端上，
 * 只在看到显式 true 时才展示并提交这些字段——旧后端会静默丢弃未知字段。
 */

export const QUOTA_METRICS = ["cost", "requests", "tokens"] as const;
export type QuotaMetric = (typeof QUOTA_METRICS)[number];

export const QUOTA_WINDOWS = ["5h", "day", "week", "month", "lifetime"] as const;
export type QuotaWindow = (typeof QUOTA_WINDOWS)[number];

export type QuotaWindowValues = Record<QuotaWindow, number>;
export type QuotaMatrix = Record<QuotaMetric, QuotaWindowValues>;
export type QuotaMatrixPatch = Partial<Record<QuotaMetric, Partial<QuotaWindowValues>>>;

export interface QuotaCell {
  metric: QuotaMetric;
  window: QuotaWindow;
  value: number;
}

export interface ModelRule {
  id: string;
  name?: string;
  models: string[];
  limits: QuotaMatrix;
  /** 规则任一限额触顶后改用的模型；为空时直接拒绝。 */
  "fallback-model"?: string;
}

export interface ModelRoute {
  id: string;
  from: string[];
  to: string;
}

export interface RuleUsage {
  id: string;
  used: QuotaMatrix;
}

export interface QuotaUsageView {
  total: QuotaMatrix;
  rules: RuleUsage[];
  /** 只有 5h 窗口由服务端锚定，才有确定的起止时刻（RFC 3339）。 */
  "five-hour-window-start"?: string;
  "five-hour-resets-at"?: string;
}

export interface CappedCell {
  id: string;
  metric: QuotaMetric;
  window: QuotaWindow;
  from: number;
  to: number;
}

export interface AccessPolicyCapabilities {
  /** quota-limits / model-rules / model-routes 与按模型用量。 */
  accessPolicy: boolean;
  /** 按模型规则的超额降级模型。 */
  modelFallback: boolean;
  /** 批量绑定权限模板。 */
  batchProfileBinding: boolean;
  /** 创建账号时直接绑定模板。 */
  createWithProfile: boolean;
  /** 账号 Key 的暂停 / 恢复与按需取明文。 */
  ownedKeyAdmin: boolean;
}

export const NO_ACCESS_POLICY_CAPABILITIES: AccessPolicyCapabilities = {
  accessPolicy: false,
  modelFallback: false,
  batchProfileBinding: false,
  createWithProfile: false,
  ownedKeyAdmin: false,
};

/** 只认显式 true：旧后端没有这个对象，缺省一律当作不支持。 */
export const readAccessPolicyCapabilities = (value: unknown): AccessPolicyCapabilities => {
  if (!isRecord(value)) return { ...NO_ACCESS_POLICY_CAPABILITIES };
  return {
    accessPolicy: value["access-policy"] === true,
    modelFallback: value["model-fallback"] === true,
    batchProfileBinding: value["batch-profile-binding"] === true,
    createWithProfile: value["create-with-profile"] === true,
    ownedKeyAdmin: value["owned-key-admin"] === true,
  };
};

const finiteNonNegative = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const emptyWindowValues = (): QuotaWindowValues => ({
  "5h": 0,
  day: 0,
  week: 0,
  month: 0,
  lifetime: 0,
});

export const emptyQuotaMatrix = (): QuotaMatrix => ({
  cost: emptyWindowValues(),
  requests: emptyWindowValues(),
  tokens: emptyWindowValues(),
});

const normalizeWindowValues = (value: unknown): QuotaWindowValues => {
  const record = isRecord(value) ? value : {};
  const out = emptyWindowValues();
  for (const window of QUOTA_WINDOWS) out[window] = finiteNonNegative(record[window]);
  return out;
};

export const normalizeQuotaMatrix = (value: unknown): QuotaMatrix => {
  const record = isRecord(value) ? value : {};
  return {
    cost: normalizeWindowValues(record.cost),
    requests: normalizeWindowValues(record.requests),
    tokens: normalizeWindowValues(record.tokens),
  };
};

export const isQuotaMatrixEmpty = (matrix: QuotaMatrix): boolean =>
  QUOTA_METRICS.every((metric) => QUOTA_WINDOWS.every((window) => matrix[metric][window] <= 0));

/** 按固定顺序（度量 → 窗口）列出所有生效（> 0）的格子。 */
export const configuredQuotaCells = (matrix: QuotaMatrix): QuotaCell[] =>
  QUOTA_METRICS.flatMap((metric) =>
    QUOTA_WINDOWS.flatMap((window) =>
      matrix[metric][window] > 0 ? [{ metric, window, value: matrix[metric][window] }] : [],
    ),
  );

export const quotaMatrixEquals = (a: QuotaMatrix, b: QuotaMatrix): boolean =>
  QUOTA_METRICS.every((metric) =>
    QUOTA_WINDOWS.every((window) => a[metric][window] === b[metric][window]),
  );

/** 完整矩阵转成补丁：每一格都显式给出，0 表示清除。 */
export const quotaMatrixToPatch = (matrix: QuotaMatrix): QuotaMatrixPatch => ({
  cost: { ...matrix.cost },
  requests: { ...matrix.requests },
  tokens: { ...matrix.tokens },
});

const normalizeString = (value: unknown): string => String(value ?? "").trim();

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = normalizeString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
};

export const normalizeModelRules = (value: unknown): ModelRule[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ModelRule[] => {
    if (!isRecord(item)) return [];
    const models = normalizeStringList(item.models);
    if (models.length === 0) return [];
    const rule: ModelRule = {
      id: normalizeString(item.id),
      models,
      limits: normalizeQuotaMatrix(item.limits),
    };
    const name = normalizeString(item.name);
    if (name) rule.name = name;
    const fallback = normalizeString(item["fallback-model"]);
    if (fallback) rule["fallback-model"] = fallback;
    return [rule];
  });
};

export const normalizeModelRoutes = (value: unknown): ModelRoute[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ModelRoute[] => {
    if (!isRecord(item)) return [];
    const from = normalizeStringList(item.from);
    const to = normalizeString(item.to);
    if (from.length === 0 || !to) return [];
    return [{ id: normalizeString(item.id), from, to }];
  });
};

export const normalizeQuotaUsageView = (value: unknown): QuotaUsageView | undefined => {
  if (!isRecord(value)) return undefined;
  const rules = Array.isArray(value.rules)
    ? value.rules.flatMap((item): RuleUsage[] =>
        isRecord(item) && normalizeString(item.id)
          ? [{ id: normalizeString(item.id), used: normalizeQuotaMatrix(item.used) }]
          : [],
      )
    : [];
  const view: QuotaUsageView = { total: normalizeQuotaMatrix(value.total), rules };
  const start = normalizeString(value["five-hour-window-start"]);
  const resets = normalizeString(value["five-hour-resets-at"]);
  if (start) view["five-hour-window-start"] = start;
  if (resets) view["five-hour-resets-at"] = resets;
  return view;
};

const isMetric = (value: unknown): value is QuotaMetric =>
  QUOTA_METRICS.some((metric) => metric === value);

const isWindow = (value: unknown): value is QuotaWindow =>
  QUOTA_WINDOWS.some((window) => window === value);

export const normalizeCappedCells = (value: unknown): CappedCell[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CappedCell[] => {
    if (!isRecord(item) || !isMetric(item.metric) || !isWindow(item.window)) return [];
    return [
      {
        id: normalizeString(item.id),
        metric: item.metric,
        window: item.window,
        from: finiteNonNegative(item.from),
        to: finiteNonNegative(item.to),
      },
    ];
  });
};

/**
 * 旧后端只认识扁平字段。没有 access-policy 能力时，面板从这些字段拼出矩阵，只开放这些格子：
 * 美元四周期、累计消费（账号）、每日请求与总请求。
 */
export interface LegacyQuotaFields {
  periodSpendingLimits?: unknown;
  dailySpendingLimit?: unknown;
  spendingLimit?: unknown;
  dailyLimit?: unknown;
  totalQuota?: unknown;
}

export const legacyQuotaMatrix = (fields: LegacyQuotaFields): QuotaMatrix => {
  const period: PeriodSpendingLimits = normalizePeriodSpendingLimits(
    fields.periodSpendingLimits,
    fields.dailySpendingLimit,
  );
  const matrix = emptyQuotaMatrix();
  matrix.cost["5h"] = period["5h"];
  matrix.cost.day = period.day;
  matrix.cost.week = period.week;
  matrix.cost.month = period.month;
  matrix.cost.lifetime = finiteNonNegative(fields.spendingLimit);
  matrix.requests.day = finiteNonNegative(fields.dailyLimit);
  matrix.requests.lifetime = finiteNonNegative(fields.totalQuota);
  return matrix;
};

/** 矩阵中美元四周期部分，写回旧的 period-spending-limits 字段。 */
export const periodLimitsFromQuotaMatrix = (matrix: QuotaMatrix): PeriodSpendingLimits => ({
  "5h": matrix.cost["5h"],
  day: matrix.cost.day,
  week: matrix.cost.week,
  month: matrix.cost.month,
});

/** 某一类对象拥有、且旧后端也能保存的格子。 */
export type QuotaCellKey = `${QuotaMetric}.${QuotaWindow}`;

export const quotaCellKey = (metric: QuotaMetric, window: QuotaWindow): QuotaCellKey =>
  `${metric}.${window}`;

const cellSet = (cells: Array<[QuotaMetric, QuotaWindow]>): ReadonlySet<QuotaCellKey> =>
  new Set(cells.map(([metric, window]) => quotaCellKey(metric, window)));

const costPeriods: Array<[QuotaMetric, QuotaWindow]> = [
  ["cost", "5h"],
  ["cost", "day"],
  ["cost", "week"],
  ["cost", "month"],
];

/** 账号上旧后端能保存的格子。 */
export const LEGACY_ACCOUNT_CELLS = cellSet([
  ...costPeriods,
  ["cost", "lifetime"],
  ["requests", "day"],
  ["requests", "lifetime"],
]);
/** 模板上旧后端能保存的格子（模板没有累计消费）。 */
export const LEGACY_PROFILE_CELLS = cellSet([
  ...costPeriods,
  ["requests", "day"],
  ["requests", "lifetime"],
]);
/** 账号 Key 上旧后端能保存的格子：只有美元四周期子额度。 */
export const LEGACY_KEY_CELLS = cellSet(costPeriods);
/** 模板不拥有的格子：累计消费是发给账号的额度，不是可复用的权限属性。 */
export const PROFILE_FORBIDDEN_CELLS = cellSet([["cost", "lifetime"]]);
