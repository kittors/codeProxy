import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";
import { readRequestCacheUse, type RequestCacheUse } from "@code-proxy/domain";
import { parseUsageTimestampMs } from "@features/monitor-widgets/monitor-utils";
import { normalizeChannelAuthType } from "./ChannelIdentityLabel";
import { normalizeGuardKind } from "./requestLogGuard";

// Row mapping and cell formatting for request logs, split out of
// requestLogsShared.tsx to keep that file to its table/filter components.

export type RequestLogsRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  apiKey: string;
  apiKeyId: string;
  apiKeyName: string;
  apiKeyOwnName: string;
  endUserDisplayName: string;
  isSystemCall: boolean;
  channelName: string;
  channelProvider?: string;
  channelAuthType?: string;
  maskedApiKey: string;
  model: string;
  thinkingLevel?: string;
  displayModel?: string;
  upstreamModel: string;
  /** What the upstream called itself in its own response; "" when it said nothing. */
  upstreamResponseModel: string;
  /** Server-side verdict: the upstream answered as a different model than we sent. */
  upstreamModelMismatch: boolean;
  visionFallbackModel: string;
  failed: boolean;
  /**
   * Which loop protection check ended the request ("reply_loop", "tool_loop"; a kind
   * this panel does not know is kept as it came), "" for every other request and
   * for backends without loop protection. Such a request is also failed.
   */
  guardKind: string;
  streaming: boolean;
  latencyMs?: number;
  firstTokenMs?: number;
  latencyText: string;
  firstTokenText: string;
  inputTokens: number;
  cachedTokens: number;
  /** Cache reads and writes where the backend stores them apart. */
  cacheUse: RequestCacheUse;
  outputTokens: number;
  totalTokens: number;
  /** 整个提示的大小（含缓存读取），缓存命中率的分母；后端没给时为 null，用 inputTokens 代替。 */
  promptTokens: number | null;
  cost: number;
  hasContent: boolean;
  /**
   * 调用方（Agent 列）：归一化的客户端 ID（"claude-code"、认不得时是 UA 的第一个产品名），
   * 版本与原始 User-Agent。旧数据、没带 UA 的请求和旧后端都是空串；后端是否支持看
   * itemsCarryClientFields（行上有没有这几个键），不看值。
   */
  clientName: string;
  clientVersion: string;
  userAgent: string;
};

export const readPromptTokens = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/** 两种日志条目（管理端 UsageLogItem、公开查询 PublicLogItem）共用的调用方字段读取。 */
export const readRequestLogClient = (item: {
  client_name?: string;
  client_version?: string;
  user_agent?: string;
}): Pick<RequestLogsRow, "clientName" | "clientVersion" | "userAgent"> => ({
  clientName: String(item.client_name ?? "").trim(),
  clientVersion: String(item.client_version ?? "").trim(),
  userAgent: String(item.user_agent ?? "").trim(),
});

const KEY_MASK_FILLER = "***";

/**
 * The twin of the backend's MaskAPIKey (internal/usage/api_key_mask.go): the same
 * shape on both sides, so a mask the server stored reads the same as one built
 * here, and masking a mask returns it unchanged. Counts code points, not UTF-16
 * units, as the server counts runes. Nothing is left of a key of 4 or fewer.
 */
export const maskRequestLogApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  const chars = Array.from(trimmed);
  if (chars.length <= 4) return KEY_MASK_FILLER;
  if (chars.length <= 10) {
    return `${chars.slice(0, 2).join("")}${KEY_MASK_FILLER}${chars.slice(-2).join("")}`;
  }
  return `${chars.slice(0, 6).join("")}${KEY_MASK_FILLER}${chars.slice(-4).join("")}`;
};

export const formatRequestLogTimestamp = (value: string): string => {
  const ms = parseUsageTimestampMs(value);
  if (!Number.isFinite(ms)) return value || "--";
  return new Date(ms).toLocaleString();
};

export const formatRequestLogLatencyMs = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1) return "<1ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  const fixed = seconds.toFixed(seconds < 10 ? 2 : 1);
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return `${trimmed}s`;
};
export const formatOptionalRequestLogLatencyMs = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return formatRequestLogLatencyMs(value);
};

export const toRequestLogsRow = (item: UsageLogItem): RequestLogsRow => {
  const isSystemCall = isSystemRequestLogKey(item.api_key, item.api_key_name);
  const channelAuthType = normalizeChannelAuthType(item.auth_type);
  const thinkingLevel = String(item.thinking_level ?? "").trim();
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: parseUsageTimestampMs(item.timestamp),
    apiKey: item.api_key,
    apiKeyId: item.api_key_id || "",
    apiKeyName: item.api_key_name || "",
    apiKeyOwnName: item.api_key_own_name || "",
    endUserDisplayName: item.end_user_display_name || item.api_key_name || "",
    isSystemCall,
    channelName: item.channel_name || "",
    channelProvider: String(item.provider ?? "").trim() || undefined,
    channelAuthType: channelAuthType || undefined,
    maskedApiKey: item.api_key_masked || maskRequestLogApiKey(item.api_key),
    model: item.model,
    thinkingLevel,
    displayModel: thinkingLevel ? `${item.model}(${thinkingLevel})` : item.model,
    upstreamModel: item.upstream_model || "",
    upstreamResponseModel: item.upstream_response_model || "",
    upstreamModelMismatch: item.upstream_model_mismatch === true,
    visionFallbackModel: item.vision_fallback_model || "",
    failed: item.failed,
    guardKind: normalizeGuardKind(item.guard_kind),
    streaming: item.streaming === true,
    latencyMs: item.latency_ms,
    firstTokenMs: item.first_token_ms,
    latencyText: formatRequestLogLatencyMs(item.latency_ms),
    firstTokenText: formatOptionalRequestLogLatencyMs(item.first_token_ms),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    cacheUse: readRequestCacheUse(item),
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    promptTokens: readPromptTokens(item.prompt_tokens),
    cost: item.cost ?? 0,
    hasContent: item.has_content ?? false,
    ...readRequestLogClient(item),
  };
};
const KNOWN_SYSTEM_INTERNAL_KEYS = new Set([
  "antigravity",
  "codex",
  "system",
  "__system__",
  "warmup",
]);

export const isSystemRequestLogKey = (apiKey: string, apiKeyName?: string): boolean => {
  if (String(apiKeyName || "").trim()) return false;
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) return true;
  if (KNOWN_SYSTEM_INTERNAL_KEYS.has(trimmed.toLowerCase())) return true;
  return /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\//i.test(trimmed) || trimmed.startsWith("/");
};
