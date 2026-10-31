import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadRule,
  VisualConfigValues,
} from "./types";

type SerializedRule = { models: Array<Record<string, unknown>>; params: unknown };

function serializeModels(models: PayloadModelEntry[] | undefined): Array<Record<string, unknown>> {
  return (models || [])
    .filter((m) => m.name?.trim())
    .map((m) => {
      const obj: Record<string, unknown> = { name: m.name.trim() };
      if (m.protocol) obj.protocol = m.protocol;
      return obj;
    });
}

function serializeValueRule(rule: PayloadRule): SerializedRule {
  const params: Record<string, unknown> = {};
  for (const param of rule.params || []) {
    if (!param.path?.trim()) continue;
    let value: unknown = param.value;
    if (param.valueType === "number") {
      const num = Number(param.value);
      value = Number.isFinite(num) ? num : param.value;
    } else if (param.valueType === "boolean") {
      value = param.value === "true";
    } else if (param.valueType === "json") {
      try {
        value = JSON.parse(param.value);
      } catch {
        value = param.value;
      }
    }
    params[param.path.trim()] = value;
  }
  return { models: serializeModels(rule.models), params };
}

function serializeFilterRule(rule: PayloadFilterRule): SerializedRule {
  const params = (Array.isArray(rule.params) ? rule.params : [])
    .map((path) => String(path).trim())
    .filter(Boolean);
  return { models: serializeModels(rule.models), params };
}

/**
 * 一条模型都没填的规则不写出去（后端也不会让它命中）。`indexes` 记下留下来的每条规则在页面上
 * 是第几条，试运行按它把后端回报的序号对回页面上的「规则 N」。
 */
function serializeKept<T>(
  rules: T[],
  serialize: (rule: T) => SerializedRule,
): { rules: SerializedRule[]; indexes: number[] } {
  const kept: SerializedRule[] = [];
  const indexes: number[] = [];
  rules.forEach((rule, index) => {
    const serialized = serialize(rule);
    if (serialized.models.length === 0) return;
    kept.push(serialized);
    indexes.push(index);
  });
  return { rules: kept, indexes };
}

export function serializePayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return serializeKept(rules, serializeValueRule).rules;
}

export function serializePayloadFilterRulesForYaml(
  rules: PayloadFilterRule[],
): Array<Record<string, unknown>> {
  return serializeKept(rules, serializeFilterRule).rules;
}

/** 页面上编辑的三类规则，试运行时作为草稿发给后端。 */
export type PayloadDraftSection = "default" | "override" | "filter";

/**
 * 页面上（可能还没保存）的规则，按保存时写进 payload 的样子序列化，供试运行使用。
 * 原始 JSON 两类页面不编辑，不放进草稿，后端沿用已保存的。
 */
export function payloadRulesDraft(
  values: Pick<
    VisualConfigValues,
    "payloadDefaultRules" | "payloadOverrideRules" | "payloadFilterRules"
  >,
): {
  rules: Record<PayloadDraftSection, Array<Record<string, unknown>>>;
  formIndexes: Record<PayloadDraftSection, number[]>;
} {
  const defaults = serializeKept(values.payloadDefaultRules, serializeValueRule);
  const overrides = serializeKept(values.payloadOverrideRules, serializeValueRule);
  const filters = serializeKept(values.payloadFilterRules, serializeFilterRule);
  return {
    rules: { default: defaults.rules, override: overrides.rules, filter: filters.rules },
    formIndexes: {
      default: defaults.indexes,
      override: overrides.indexes,
      filter: filters.indexes,
    },
  };
}
