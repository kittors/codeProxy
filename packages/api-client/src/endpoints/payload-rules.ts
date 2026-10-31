import { apiClient } from "../client/client";

/** 请求体改写规则的五类，键名与 config.yaml 的 payload 一致。 */
export type PayloadRuleSection = "default" | "default-raw" | "override" | "override-raw" | "filter";

/**
 * POST /payload-rules/dry-run 的请求体。`rules` 里带了的类别替换已保存的规则，没带的（或为
 * null）沿用已保存的——配置页只编辑 default / override / filter，原始 JSON 两类不用带。
 */
export interface PayloadRulesDryRunRequest {
  /** 上游模型（别名解析之后），规则按它匹配。 */
  model: string;
  /** 客户端请求的模型，可以是别名、带思考后缀，例如 `fast(high)`。 */
  "requested-model"?: string;
  /** 请求体的协议，对应规则里模型条目的 protocol。 */
  protocol?: string;
  /** 样例请求体的 JSON 原文。用原文而不是对象：大整数和用户的写法都原样保留。 */
  body: string;
  rules?: Partial<Record<PayloadRuleSection, unknown[]>>;
}

export interface PayloadParamOutcome {
  path: string;
  action: "set" | "removed" | "skipped";
  /** 跳过的原因：present 请求里已有；already-defaulted 前面的默认规则已写入；absent 请求里没有；invalid-path / invalid-value 写不进去。 */
  reason?: "present" | "already-defaulted" | "absent" | "invalid-path" | "invalid-value";
  /** 写入的 JSON。 */
  value?: string;
}

export interface PayloadRuleOutcome {
  section: PayloadRuleSection;
  /** 在所属类别里的位置（从 0 起），按请求里 `rules` 的顺序，被丢弃的规则也占位。 */
  index: number;
  matched: boolean;
  /** 命中的模型条目，以及它匹配上的模型名。 */
  pattern?: string;
  model?: string;
  /** 没命中的原因：no-models 没填模型；protocol 模型对得上但限定了别的协议；model 模型对不上。 */
  miss?: "no-models" | "protocol" | "model";
  params?: PayloadParamOutcome[];
}

/** 一处改动。`before` / `after` 是该路径上的 JSON，路径不存在时缺省。 */
export interface PayloadChange {
  path: string;
  before?: string;
  after?: string;
}

export interface PayloadRulesDryRunResult {
  /** 改写后的请求体（已缩进）。 */
  body: string;
  /** 规则按这些模型名匹配，依次尝试。 */
  models: string[];
  rules: PayloadRuleOutcome[];
  changes: PayloadChange[];
  /** 原始 JSON 规则里值不是合法 JSON、保存时会被丢弃的规则，没有参与这次试运行。 */
  dropped?: Array<{ section: PayloadRuleSection; index: number; param: string }>;
}

export const payloadRulesApi = {
  dryRun: (request: PayloadRulesDryRunRequest) =>
    apiClient.post<PayloadRulesDryRunResult>("/payload-rules/dry-run", request),
};

/**
 * GET /config 的 `capabilities`：配置页上需要后端新接口的工具，只在后端声明时才出现。
 * 面板跟着最新版本自动更新，后端可能还是旧版。
 */
export interface ConfigCapabilities {
  payloadRulesDryRun: boolean;
}

export function readConfigCapabilities(
  config: Record<string, unknown> | null | undefined,
): ConfigCapabilities {
  const raw = config?.capabilities;
  const capabilities =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return { payloadRulesDryRun: capabilities["payload-rules-dry-run"] === true };
}
