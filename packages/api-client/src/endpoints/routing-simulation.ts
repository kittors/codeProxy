import { apiClient } from "../client/client";

/**
 * GET /routing-simulation：用一个 API Key 模拟一次请求，看它会经过哪些阶段、落到哪个分组、
 * 每个账号为什么能用或不能用、按什么顺序尝试。后端不向上游发任何请求，也不计入 Key 的限额。
 * 只在 GET /routing-config 的 capabilities 声明 `routing-simulation` 时可用。
 */

/** 模拟的入口：OpenAI Chat Completions 或 Claude Messages。 */
export type RoutingSimulationEndpoint = "chat-completions" | "messages";

export interface RoutingSimulationParams {
  apiKeyId: string;
  model: string;
  /** 路径路由，例如 `/team`；不填就是直接请求 `/v1`。 */
  routePath?: string;
  endpoint?: RoutingSimulationEndpoint;
}

/**
 * 请求在网关里依次经过的阶段，名字是接口的一部分（后端只增不改）。handler 是推理入口本身：
 * 解析模型对应的供应商并选账号。
 */
export type RoutingSimulationStageName =
  | "auth"
  | "route"
  | "channel-group"
  | "quota"
  | "model-policy"
  | "model-gate"
  | "ccswitch-mapping"
  | "system-prompt"
  | "handler";

/** passed 通过；rejected 在这里被拒；skipped 模拟时不执行（额度准入会计数）；not-run 前面已被拒。 */
export type RoutingSimulationStageOutcome = "passed" | "rejected" | "skipped" | "not-run";

export interface RoutingSimulationStage {
  name: RoutingSimulationStageName | string;
  outcome: RoutingSimulationStageOutcome | string;
}

export interface RoutingSimulationError {
  /** 拒绝请求的阶段，只在 rejection 上有。 */
  stage?: string;
  "http-status"?: number;
  code?: string;
  type?: string;
  message?: string;
  "retry-after-ms"?: number;
}

export interface RoutingSimulationRoute {
  "route-path"?: string;
  group?: string;
  fallback?: string;
  /** 路径属于某个 CC Switch 预设时，预设的客户端类型。 */
  "ccswitch-client"?: string;
}

export interface RoutingSimulationModelPolicy {
  "requested-model"?: string;
  "final-model"?: string;
  "route-id"?: string;
  "fallback-rules"?: string[];
}

/**
 * 账号不参与的原因（后端只增不改）：disabled 停用；tenant 不属于该租户；pinned 请求指定了别的账号；
 * channel / allowed-groups 不在 Key 允许的渠道或分组里；route-group 不在当前尝试的分组；
 * tried 已经试过；model 不提供该模型，或分组的模型清单不允许。
 */
export type RoutingSimulationExclusion =
  | "disabled"
  | "tenant"
  | "pinned"
  | "channel"
  | "allowed-groups"
  | "route-group"
  | "tried"
  | "model";

/** 候选此刻接不了请求的原因：cooldown 冷却；unavailable 暂不可用；disabled 模型被停用；weight 权重为 0。 */
export type RoutingSimulationBlock = "cooldown" | "unavailable" | "disabled" | "weight";

export interface RoutingSimulationWindow {
  key: string;
  "span-ms"?: number;
  used: number;
  "resets-at"?: string;
}

export interface RoutingSimulationResetStanding {
  /** room 有余量；unknown 没有额度数据；low 用过 90%；spent 用过 98%。按这个顺序先用。 */
  tier: "room" | "unknown" | "low" | "spent" | string;
  used: number;
  windows?: RoutingSimulationWindow[];
}

export interface RoutingSimulationCredential {
  "auth-id": string;
  label?: string;
  provider: string;
  /** 平台共享给本租户的账号。 */
  shared?: boolean;
  excluded?: RoutingSimulationExclusion | string;
  /** 因分组的 excluded-models / allowed-models 不允许该模型而不参与时，是哪些分组。 */
  "model-excluded-by"?: string[];
  "model-not-allowed-by"?: string[];
  // 以下只对候选（excluded 为空）有意义。
  weight: number;
  blocked?: RoutingSimulationBlock | string;
  /** RFC 3339；没有结束时间（例如额度要等探测确认）时不给。 */
  "blocked-until"?: string;
  /** 冷却的原因码，和账号列表的 cooldown_reason 同一套。 */
  "block-cause"?: string;
  "block-http-status"?: number;
  "in-flight": number;
  "concurrency-limit"?: number;
  /** 账号已到并发上限：只有没有别的候选时，请求才会排队等它。 */
  saturated?: boolean;
  /** 负载比例 0–1，取并发占用和额度占用里较大的那个。 */
  "load-ratio": number;
  /** 最少负载优先的得分，越低越先。只在 least-load 分组里算，为 0 时不给。 */
  score?: number;
  reset?: RoutingSimulationResetStanding;
  /** 在尝试顺序里的位置（从 1 起）；请求走不到它时不给。 */
  attempt?: number;
}

export interface RoutingSimulationGroup {
  /** 空表示请求没有限定到某个路由分组。 */
  name: string;
  /** 路径路由的分组没有候选后回退到的 default 分组。 */
  fallback?: boolean;
  distribution: string;
  sticky?: boolean;
  "sticky-max-requests"?: number;
  "sticky-release-at-load"?: number;
  credentials: RoutingSimulationCredential[];
  /** 分组没有候选时的原因。 */
  error?: RoutingSimulationError;
}

export interface RoutingSimulationAttempt {
  "auth-id": string;
  group: string;
  /** 发往这个账号上游的模型名（加前缀、别名之后）。 */
  "upstream-model"?: string;
  /** 账号已到并发上限，请求会排队等它。 */
  queued?: boolean;
}

export interface RoutingSimulationSelection {
  model: string;
  "model-key": string;
  providers: string[];
  groups: RoutingSimulationGroup[];
  attempts: RoutingSimulationAttempt[];
  /** 没有账号能接时客户端会收到的错误。 */
  error?: RoutingSimulationError;
  "retry-wait-ms"?: number;
  /** request-retry 按 request-retry 配置重试；busy-wait 按分组的忙等上限等待。不给表示立即失败。 */
  "retry-wait-kind"?: "request-retry" | "busy-wait" | string;
}

export interface RoutingSimulationResult {
  "api-key": { id: string; name?: string; disabled?: boolean };
  endpoint: RoutingSimulationEndpoint | string;
  "requested-model": string;
  "route-path"?: string;
  stages: RoutingSimulationStage[];
  /** 请求在某个阶段被拒时，客户端会收到的错误。 */
  rejection?: RoutingSimulationError;
  route?: RoutingSimulationRoute;
  "model-policy"?: RoutingSimulationModelPolicy;
  /** 选账号用的模型：模型策略和 CC Switch 映射之后。 */
  model?: string;
  selection?: RoutingSimulationSelection;
}

export const routingSimulationApi = {
  run: (params: RoutingSimulationParams) => {
    const query = new URLSearchParams({ "api-key-id": params.apiKeyId, model: params.model });
    if (params.routePath?.trim()) query.set("route-path", params.routePath.trim());
    if (params.endpoint) query.set("endpoint", params.endpoint);
    return apiClient.get<RoutingSimulationResult>(`/routing-simulation?${query.toString()}`);
  },
};
