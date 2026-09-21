import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";
import { parseUsageTimestampMs } from "@features/monitor-widgets/monitor-utils";
import { normalizeChannelAuthType } from "./ChannelIdentityLabel";

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
  streaming: boolean;
  latencyMs?: number;
  firstTokenMs?: number;
  latencyText: string;
  firstTokenText: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  hasContent: boolean;
};

export const maskRequestLogApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
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
    streaming: item.streaming === true,
    latencyMs: item.latency_ms,
    firstTokenMs: item.first_token_ms,
    latencyText: formatRequestLogLatencyMs(item.latency_ms),
    firstTokenText: formatOptionalRequestLogLatencyMs(item.first_token_ms),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    cost: item.cost ?? 0,
    hasContent: item.has_content ?? false,
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
