import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  type ModelRule,
  type QuotaMatrix,
  type QuotaMetric,
  type QuotaUsageView,
  type QuotaWindow,
} from "@code-proxy/api-client";
import { formatQuotaAmount } from "./quotaFormat";

export interface WindowLimitPart {
  metric: QuotaMetric;
  limit: number;
  used?: number;
  /** 来自按模型规则时的规则名（无名称时取第一个模型模式）。 */
  rule?: string;
}

export interface ResettableWindow {
  window: QuotaWindow;
  parts: WindowLimitPart[];
}

export const ruleLabel = (rule: Pick<ModelRule, "name" | "models">): string =>
  rule.name?.trim() || rule.models.join(", ");

/**
 * 可以重置的窗口：总额度任一度量、或任一按模型规则在这个窗口上有限额（与后端
 * quota.WindowHasLimit 一致）。重置会把这个窗口的花费、请求、Token 与规则用量一起清零，
 * 所以每个窗口列出它下面全部的限额，让人知道这一下会清掉什么。
 */
export const resettableWindows = (
  limits: QuotaMatrix,
  rules: readonly ModelRule[],
  usage?: QuotaUsageView,
): ResettableWindow[] => {
  const usedByRule = new Map(usage?.rules.map((item) => [item.id, item.used]) ?? []);
  return QUOTA_WINDOWS.flatMap((window): ResettableWindow[] => {
    const parts: WindowLimitPart[] = [];
    for (const metric of QUOTA_METRICS) {
      const limit = limits[metric][window];
      if (limit > 0) parts.push({ metric, limit, used: usage?.total[metric][window] });
    }
    for (const rule of rules) {
      const used = usedByRule.get(rule.id);
      for (const metric of QUOTA_METRICS) {
        const limit = rule.limits[metric][window];
        if (limit > 0) parts.push({ metric, limit, used: used?.[metric][window], rule: ruleLabel(rule) });
      }
    }
    return parts.length > 0 ? [{ window, parts }] : [];
  });
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** 「花费 $3 / $10 · 请求 120 / 500 · Opus：Token 1.2M / 5M」 */
export const describeWindowParts = (t: Translate, parts: readonly WindowLimitPart[]): string =>
  parts
    .map((part) => {
      const metric = t(`access_policy.metric_short.${part.metric}`);
      const amount =
        typeof part.used === "number"
          ? `${formatQuotaAmount(part.metric, part.used)} / ${formatQuotaAmount(part.metric, part.limit)}`
          : formatQuotaAmount(part.metric, part.limit);
      const text = `${metric} ${amount}`;
      return part.rule ? t("access_policy.rule_part", { rule: part.rule, part: text }) : text;
    })
    .join(" · ");
