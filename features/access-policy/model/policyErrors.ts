import {
  extractApiErrorCode,
  extractApiErrorDetails,
  isApiClientError,
  type QuotaMetric,
} from "@code-proxy/api-client";
import { formatQuotaAmount } from "./quotaFormat";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const METRICS = new Set<string>(["cost", "requests", "tokens"]);
const WINDOWS = new Set<string>(["5h", "day", "week", "month", "lifetime"]);

/** 把后端的字段路径（model-rules[2].fallback-model）说成人话：「第 3 条模型规则 · 降级模型」。 */
const describeField = (t: Translate, field: string): string => {
  const rule = /^model-rules\[(\d+)\](?:\.(.+))?$/.exec(field);
  if (rule) {
    const part = rule[2]?.split(/[.[]/)[0];
    const base = t("access_policy.server.field_rule", { index: Number(rule[1]) + 1 });
    return part ? `${base} · ${t(`access_policy.server.part.${part}`, { defaultValue: part })}` : base;
  }
  const route = /^model-routes\[(\d+)\](?:\.(.+))?$/.exec(field);
  if (route) {
    const part = route[2]?.split(/[.[]/)[0];
    const base = t("access_policy.server.field_route", { index: Number(route[1]) + 1 });
    return part ? `${base} · ${t(`access_policy.server.part.${part}`, { defaultValue: part })}` : base;
  }
  return field || t("access_policy.server.field_limits");
};

/**
 * 访问策略相关的结构化错误转成本地化文案；不是这类错误时返回 null，交给调用方的通用处理。
 * 面板保存前已按同一套规则校验，这些错误通常只在并发修改或旧数据时出现。
 */
export const formatAccessPolicyError = (error: unknown, t: Translate): string | null => {
  if (!isApiClientError(error)) return null;
  const code = extractApiErrorCode(error.payload);
  const details = extractApiErrorDetails(error.payload);
  switch (code) {
    case "access_policy_invalid":
      return t("access_policy.server.policy_invalid", {
        location: describeField(t, typeof details.field === "string" ? details.field : ""),
        message: error.message,
      });
    case "policy_target_not_allowed":
      return t("access_policy.issue.target_not_allowed", { model: String(details.model ?? "") });
    case "key_quota_limit_exceeds_account": {
      const metric = String(details.metric ?? "");
      const window = String(details.period ?? "");
      if (!METRICS.has(metric) || !WINDOWS.has(window)) return error.message;
      return t("access_policy.server.key_exceeds_account", {
        cell: `${t(`access_policy.metric.${metric}`)} · ${t(`access_policy.window.${window}`)}`,
        key: formatQuotaAmount(metric as QuotaMetric, Number(details.key_limit ?? 0)),
        account: formatQuotaAmount(metric as QuotaMetric, Number(details.account_limit ?? 0)),
      });
    }
    case "quota_limits_legacy_conflict":
      return t("access_policy.server.legacy_conflict");
    default:
      return null;
  }
};
