import { apiClient } from "../client/client";
import { isRecord } from "../client/response";

/**
 * 循环保护（CliRelay `GET/PUT /loop-guard`、`GET/PUT /loop-guard/keys/:id`）。
 *
 * 两项检查，默认都关，租户和单个 API Key 都能打开：
 * - 「Stop repeating replies」：流式回复的文字或推理变成同几行反复出现时，网关直接结束这次回复；
 * - 「Stop tool-call loops」：智能体连续几轮发同一个工具调用、拿到同一个结果时，网关自己答复，不再发给上游。
 *
 * 面板会从最新 release 自动更新、可能连着没有这个功能的旧后端，所以这里的读取函数在响应不像循环保护的设置时
 * 返回 null（旧后端的 GET /loop-guard 是 404，会直接抛错），调用方据此不显示相应的开关。
 *
 * 阈值为 0 表示「跟随上一层」：Key 跟随租户、租户跟随内置默认值。默认值与可填范围随每个响应一起返回
 * （defaults / bounds），面板按它们建输入，不在前端抄一份数字。
 */

/** 哪一层把检查打开的：租户自己，或这把 Key 的覆盖。 */
export type LoopGuardSource = "tenant" | "api_key";

export interface LoopGuardReplySettings {
  enabled: boolean;
  /** 统计窗口里的行 / 句数；0 = 默认值。 */
  window: number;
  /** 窗口里不同行 / 句数不超过它就算复读；0 = 默认值。 */
  max_distinct: number;
}

export interface LoopGuardToolSettings {
  enabled: boolean;
  /** 连续几轮同一调用同一结果才算死循环；0 = 默认值。 */
  repeats: number;
}

/** 租户一层的设置（Key 的响应里作为「它跟随的值」返回）。 */
export interface LoopGuardTenantSettings {
  reply: LoopGuardReplySettings;
  tool: LoopGuardToolSettings;
}

export interface LoopGuardDefaults {
  reply_window: number;
  reply_max_distinct: number;
  tool_repeats: number;
}

/** 写入时后端校验的范围。max_distinct 至多是窗口 / reply_distinct_window_share。 */
export interface LoopGuardBounds {
  min_reply_window: number;
  max_reply_window: number;
  min_reply_distinct: number;
  reply_distinct_window_share: number;
  min_tool_repeats: number;
  max_tool_repeats: number;
}

/** 每个设置响应都带的、关于这个后端本身的信息。 */
export interface LoopGuardInfo {
  /** 为 false 时后端没接数据库：可以读，写会回 503。 */
  persistent: boolean;
  updated_at: string;
  defaults: LoopGuardDefaults;
  bounds: LoopGuardBounds;
}

export interface LoopGuardTenantView extends LoopGuardTenantSettings, LoopGuardInfo {
  /** 有多少把 Key 带着自己的覆盖。 */
  key_overrides: number;
}

export interface LoopGuardKeyReply {
  /** null = 跟随租户。 */
  enabled: boolean | null;
  window: number;
  max_distinct: number;
}

export interface LoopGuardKeyTool {
  enabled: boolean | null;
  repeats: number;
}

export interface LoopGuardEffectiveReply {
  enabled: boolean;
  /** 开着时才有：是谁打开的。 */
  source: LoopGuardSource | "";
  window: number;
  max_distinct: number;
}

export interface LoopGuardEffectiveTool {
  enabled: boolean;
  source: LoopGuardSource | "";
  repeats: number;
}

export interface LoopGuardKeyView extends LoopGuardInfo {
  key_id: string;
  reply: LoopGuardKeyReply;
  tool: LoopGuardKeyTool;
  /** 这把 Key 没设置的部分跟随的租户值。 */
  tenant: LoopGuardTenantSettings;
  /** 网关对这把 Key 的请求实际怎么做。 */
  effective: { reply: LoopGuardEffectiveReply; tool: LoopGuardEffectiveTool };
}

/**
 * PUT 的请求体。带了的分段整段替换已存的那一段（没写的阈值回到默认），没带的分段保持原样，
 * 所以只认识其中一项的客户端不会清掉另一项。
 */
export interface LoopGuardReplyWrite {
  enabled: boolean | null;
  window?: number;
  max_distinct?: number;
}

export interface LoopGuardToolWrite {
  enabled: boolean | null;
  repeats?: number;
}

export interface LoopGuardWrite {
  reply?: LoopGuardReplyWrite;
  tool?: LoopGuardToolWrite;
}

const toInt = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

const toText = (value: unknown): string => (typeof value === "string" ? value : "");

const toSource = (value: unknown): LoopGuardSource | "" =>
  value === "tenant" || value === "api_key" ? value : "";

const toTriState = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

function normalizeInfo(record: Record<string, unknown>): LoopGuardInfo | null {
  const defaults = record.defaults;
  const bounds = record.bounds;
  if (!isRecord(defaults) || !isRecord(bounds) || typeof record.persistent !== "boolean") {
    return null;
  }
  return {
    persistent: record.persistent,
    updated_at: toText(record.updated_at),
    defaults: {
      reply_window: toInt(defaults.reply_window),
      reply_max_distinct: toInt(defaults.reply_max_distinct),
      tool_repeats: toInt(defaults.tool_repeats),
    },
    bounds: {
      min_reply_window: toInt(bounds.min_reply_window),
      max_reply_window: toInt(bounds.max_reply_window),
      min_reply_distinct: toInt(bounds.min_reply_distinct),
      reply_distinct_window_share: toInt(bounds.reply_distinct_window_share),
      min_tool_repeats: toInt(bounds.min_tool_repeats),
      max_tool_repeats: toInt(bounds.max_tool_repeats),
    },
  };
}

function normalizeTenantSettings(record: Record<string, unknown>): LoopGuardTenantSettings | null {
  const reply = record.reply;
  const tool = record.tool;
  if (!isRecord(reply) || !isRecord(tool)) return null;
  return {
    reply: {
      enabled: reply.enabled === true,
      window: toInt(reply.window),
      max_distinct: toInt(reply.max_distinct),
    },
    tool: { enabled: tool.enabled === true, repeats: toInt(tool.repeats) },
  };
}

/** 租户设置响应；响应不像循环保护的设置时返回 null。 */
export function normalizeLoopGuardTenant(raw: unknown): LoopGuardTenantView | null {
  if (!isRecord(raw)) return null;
  const settings = normalizeTenantSettings(raw);
  const info = normalizeInfo(raw);
  if (!settings || !info) return null;
  return { ...settings, ...info, key_overrides: toInt(raw.key_overrides) };
}

/** 单把 Key 的响应；响应不像循环保护的设置时返回 null。 */
export function normalizeLoopGuardKey(raw: unknown): LoopGuardKeyView | null {
  if (!isRecord(raw)) return null;
  const { reply, tool, tenant, effective } = raw;
  if (!isRecord(reply) || !isRecord(tool) || !isRecord(tenant) || !isRecord(effective)) {
    return null;
  }
  const tenantSettings = normalizeTenantSettings(tenant);
  const info = normalizeInfo(raw);
  if (!tenantSettings || !info) return null;
  const effectiveReply = isRecord(effective.reply) ? effective.reply : {};
  const effectiveTool = isRecord(effective.tool) ? effective.tool : {};
  return {
    ...info,
    key_id: toText(raw.key_id),
    reply: {
      enabled: toTriState(reply.enabled),
      window: toInt(reply.window),
      max_distinct: toInt(reply.max_distinct),
    },
    tool: { enabled: toTriState(tool.enabled), repeats: toInt(tool.repeats) },
    tenant: tenantSettings,
    effective: {
      reply: {
        enabled: effectiveReply.enabled === true,
        source: toSource(effectiveReply.source),
        window: toInt(effectiveReply.window),
        max_distinct: toInt(effectiveReply.max_distinct),
      },
      tool: {
        enabled: effectiveTool.enabled === true,
        source: toSource(effectiveTool.source),
        repeats: toInt(effectiveTool.repeats),
      },
    },
  };
}

/** PUT 的响应本该是设置视图；不是时说明连着的不是这个功能的后端，写入结果无从确认。 */
const unexpected = () => new Error("Unexpected response to a loop protection write");

const keyPath = (keyId: string) => `/loop-guard/keys/${encodeURIComponent(keyId)}`;

export const loopGuardApi = {
  /** 当前租户的设置；null = 这个后端没有循环保护。旧后端的 404 会作为错误抛出。 */
  async getTenant(options?: { signal?: AbortSignal }): Promise<LoopGuardTenantView | null> {
    const raw = await apiClient.get<unknown>("/loop-guard", { signal: options?.signal });
    return normalizeLoopGuardTenant(raw);
  },

  async putTenant(body: LoopGuardWrite): Promise<LoopGuardTenantView> {
    const view = normalizeLoopGuardTenant(await apiClient.put<unknown>("/loop-guard", body));
    if (!view) throw unexpected();
    return view;
  },

  /** 一把 Key 的覆盖，以及它对这把 Key 的请求实际意味着什么。 */
  async getKey(
    keyId: string,
    options?: { signal?: AbortSignal },
  ): Promise<LoopGuardKeyView | null> {
    const raw = await apiClient.get<unknown>(keyPath(keyId), { signal: options?.signal });
    return normalizeLoopGuardKey(raw);
  },

  async putKey(keyId: string, body: LoopGuardWrite): Promise<LoopGuardKeyView> {
    const view = normalizeLoopGuardKey(await apiClient.put<unknown>(keyPath(keyId), body));
    if (!view) throw unexpected();
    return view;
  },
};
