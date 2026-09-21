import {
  formatOptionalRequestLogLatencyMs,
  formatRequestLogLatencyMs,
  maskRequestLogApiKey,
  normalizeChannelAuthType,
  type RequestLogsRow,
} from "@features/request-log-viewer";
import type { PublicLogItem } from "./types";

/** Maps one public usage-log item onto the shared request-log row shape. */
export function toLogRow(item: PublicLogItem): RequestLogsRow {
  const channelAuthType = normalizeChannelAuthType(item.auth_type);
  const firstTokenMs = item.first_token_ms ?? 0;
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: new Date(item.timestamp).getTime(),
    apiKey: item.api_key || "",
    apiKeyId: item.api_key_id || "",
    apiKeyName: item.api_key_name || "",
    apiKeyOwnName: item.api_key_own_name || "",
    endUserDisplayName: item.end_user_display_name || item.api_key_name || "",
    isSystemCall: false,
    channelName: item.channel_name || "",
    channelProvider: String(item.provider ?? "").trim() || undefined,
    channelAuthType: channelAuthType || undefined,
    maskedApiKey: item.api_key_masked || maskRequestLogApiKey(item.api_key || ""),
    model: item.model,
    upstreamModel: item.upstream_model || "",
    upstreamResponseModel: item.upstream_response_model || "",
    upstreamModelMismatch: item.upstream_model_mismatch === true,
    visionFallbackModel: item.vision_fallback_model || "",
    failed: item.failed,
    streaming: item.streaming === true,
    latencyMs: item.latency_ms,
    firstTokenMs,
    latencyText: formatRequestLogLatencyMs(item.latency_ms),
    firstTokenText: formatOptionalRequestLogLatencyMs(firstTokenMs),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    cost: item.cost ?? 0,
    hasContent: item.has_content,
  };
}
