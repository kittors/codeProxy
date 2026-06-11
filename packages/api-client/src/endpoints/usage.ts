import { apiClient } from "../client/client";
import type {
  UsageData,
  ChartDataResponse,
  EntityStatsResponse,
} from "../dto/types";

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export interface ClearUsageLogsResponse {
  deleted_logs: number;
  deleted_contents: number;
  cleared_body_rows?: number;
  cleared_detail_rows?: number;
  cleared_legacy_rows?: number;
}

export interface ClearUsageLogsPayload {
  clear_body_content: boolean;
  clear_detail_content: boolean;
  clear_request_records: boolean;
}

export interface AuthFileGroupTrendPoint {
  date: string;
  requests: number;
}

export interface AuthFileQuotaTrendPoint {
  date: string;
  percent: number | null;
  samples: number;
}

export interface AuthFileGroupTrendResponse {
  days: number;
  group: string;
  points: AuthFileGroupTrendPoint[];
  quota_points: AuthFileQuotaTrendPoint[];
}

export interface AuthFileTrendUsagePoint {
  date?: string;
  hour?: string;
  requests: number;
  cost?: number;
}

export interface AuthFileTrendQuotaPoint {
  timestamp: string;
  percent: number | null;
  reset_at?: string;
}

export interface AuthFileTrendQuotaSeries {
  quota_key: string;
  quota_label: string;
  window_seconds: number;
  points: AuthFileTrendQuotaPoint[];
}

export interface AuthFileTrendResponse {
  auth_index: string;
  days: number;
  hours: number;
  request_total: number;
  cycle_request_total: number;
  cycle_cost_total: number;
  weekly_quota_used_percent: number | null;
  cycle_start: string;
  daily_usage: AuthFileTrendUsagePoint[];
  hourly_usage: AuthFileTrendUsagePoint[];
  quota_series: AuthFileTrendQuotaSeries[];
}

export interface AuthFileQuotaSnapshotPointPayload {
  quota_key: string;
  quota_label?: string;
  percent: number | null;
  reset_at?: string;
  window_seconds?: number;
}

export interface AuthFileQuotaSnapshotPayload {
  auth_index: string;
  provider?: string;
  quotas?: Record<string, number | null>;
  quota_points?: AuthFileQuotaSnapshotPointPayload[];
}

export interface EntityStatsScope {
  authIndexes?: string[];
  sources?: string[];
}

const appendUniqueParams = (
  qs: URLSearchParams,
  key: string,
  values?: string[],
) => {
  const seen = new Set<string>();
  (values ?? []).forEach((value) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    qs.append(key, trimmed);
  });
};

export const usageApi = {
  async getUsage(): Promise<UsageData> {
    const response = await apiClient.get<Record<string, unknown>>("/usage");
    const candidate =
      response.usage && typeof response.usage === "object"
        ? response.usage
        : response;

    if (!candidate || typeof candidate !== "object") {
      return {
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        total_tokens: 0,
        apis: {},
        requests_by_day: {},
        requests_by_hour: {},
        tokens_by_day: {},
        tokens_by_hour: {},
      };
    }

    const payload = candidate as { apis?: UsageData["apis"] };

    if (!payload.apis || typeof payload.apis !== "object") {
      return {
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        total_tokens: 0,
        apis: {},
        requests_by_day: {},
        requests_by_hour: {},
        tokens_by_day: {},
        tokens_by_hour: {},
      };
    }

    return {
      apis: payload.apis,
      total_requests: (payload as any).total_requests ?? 0,
      success_count: (payload as any).success_count ?? 0,
      failure_count: (payload as any).failure_count ?? 0,
      total_tokens: (payload as any).total_tokens ?? 0,
      requests_by_day: (payload as any).requests_by_day || {},
      requests_by_hour: (payload as any).requests_by_hour || {},
      tokens_by_day: (payload as any).tokens_by_day || {},
      tokens_by_hour: (payload as any).tokens_by_hour || {},
    };
  },

  async getChartData(days = 7, apiKey = ""): Promise<ChartDataResponse> {
    const qs = new URLSearchParams({ days: String(days) });
    if (apiKey && apiKey !== "all") qs.set("api_key", apiKey);
    const resp = await apiClient.get<ChartDataResponse>(
      `/usage/chart-data?${qs.toString()}`,
    );
    return {
      daily_series: Array.isArray(resp?.daily_series) ? resp.daily_series : [],
      model_distribution: Array.isArray(resp?.model_distribution)
        ? resp.model_distribution
        : [],
      hourly_tokens: Array.isArray(resp?.hourly_tokens)
        ? resp.hourly_tokens
        : [],
      hourly_models: Array.isArray(resp?.hourly_models)
        ? resp.hourly_models
        : [],
      apikey_distribution: Array.isArray(resp?.apikey_distribution)
        ? resp.apikey_distribution
        : [],
    };
  },

  async getEntityStats(
    days = 7,
    apiKey = "",
    scope?: EntityStatsScope,
  ): Promise<EntityStatsResponse> {
    const qs = new URLSearchParams({ days: String(days) });
    if (apiKey && apiKey !== "all") qs.set("api_key", apiKey);
    appendUniqueParams(qs, "auth_index", scope?.authIndexes);
    appendUniqueParams(qs, "source", scope?.sources);
    const resp = await apiClient.get<EntityStatsResponse>(
      `/usage/entity-stats?${qs.toString()}`,
    );
    return {
      source: Array.isArray(resp?.source) ? resp.source : [],
      auth_index: Array.isArray(resp?.auth_index) ? resp.auth_index : [],
    };
  },

  async getAuthFileGroupTrend(
    group: string,
    days = 7,
  ): Promise<AuthFileGroupTrendResponse> {
    const qs = new URLSearchParams({ group, days: String(days) });
    const resp = await apiClient.get<AuthFileGroupTrendResponse>(
      `/usage/auth-file-group-trend?${qs.toString()}`,
    );
    return {
      days: resp?.days ?? days,
      group: resp?.group ?? group,
      points: Array.isArray(resp?.points) ? resp.points : [],
      quota_points: Array.isArray(resp?.quota_points) ? resp.quota_points : [],
    };
  },

  async getAuthFileTrend(
    authIndex: string,
    options?: { days?: number; hours?: number },
  ): Promise<AuthFileTrendResponse> {
    const days = options?.days ?? 7;
    const hours = options?.hours ?? 5;
    const qs = new URLSearchParams({
      auth_index: authIndex,
      days: String(days),
      hours: String(hours),
    });
    const resp = await apiClient.get<AuthFileTrendResponse>(
      `/usage/auth-file-trend?${qs.toString()}`,
    );
    return {
      auth_index: resp?.auth_index ?? authIndex,
      days: resp?.days ?? days,
      hours: resp?.hours ?? hours,
      request_total: resp?.request_total ?? 0,
      cycle_request_total: resp?.cycle_request_total ?? 0,
      cycle_cost_total: resp?.cycle_cost_total ?? 0,
      weekly_quota_used_percent:
        typeof resp?.weekly_quota_used_percent === "number" &&
        Number.isFinite(resp.weekly_quota_used_percent)
          ? resp.weekly_quota_used_percent
          : null,
      cycle_start: resp?.cycle_start ?? "",
      daily_usage: Array.isArray(resp?.daily_usage) ? resp.daily_usage : [],
      hourly_usage: Array.isArray(resp?.hourly_usage) ? resp.hourly_usage : [],
      quota_series: Array.isArray(resp?.quota_series) ? resp.quota_series : [],
    };
  },

  async recordAuthFileQuotaSnapshot(
    payload: AuthFileQuotaSnapshotPayload,
  ): Promise<void> {
    await apiClient.post("/usage/auth-file-quota-snapshot", payload);
  },

  async getUsageLogs(params: {
    page?: number;
    size?: number;
    days?: number;
    api_key?: string;
    model?: string;
    channel?: string;
    status?: string;
    api_keys?: string[];
    models?: string[];
    channels?: string[];
    statuses?: string[];
    api_keys_empty?: boolean;
    models_empty?: boolean;
    channels_empty?: boolean;
    statuses_empty?: boolean;
  }): Promise<UsageLogsResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.size) qs.set("size", String(params.size));
    if (params.days) qs.set("days", String(params.days));
    // Multi-value params take priority
    appendUniqueParams(qs, "api_key", params.api_keys);
    appendUniqueParams(qs, "model", params.models);
    appendUniqueParams(qs, "channel", params.channels);
    appendUniqueParams(qs, "status", params.statuses);
    if (params.api_keys_empty) qs.set("api_keys_empty", "1");
    if (params.models_empty) qs.set("models_empty", "1");
    if (params.channels_empty) qs.set("channels_empty", "1");
    if (params.statuses_empty) qs.set("statuses_empty", "1");
    // Backward compatibility: fallback to single-value params if no multi-value
    if (!params.api_keys?.length && params.api_key)
      qs.set("api_key", params.api_key);
    if (!params.models?.length && params.model) qs.set("model", params.model);
    if (!params.channels?.length && params.channel)
      qs.set("channel", params.channel);
    if (!params.statuses?.length && params.status)
      qs.set("status", params.status);
    const query = qs.toString();
    const resp = await apiClient.get<UsageLogsResponse>(
      `/usage/logs${query ? `?${query}` : ""}`,
    );
    return {
      items: Array.isArray(resp?.items) ? resp.items : [],
      total: resp?.total ?? 0,
      page: resp?.page ?? 1,
      size: resp?.size ?? params.size ?? 50,
      filters: {
        api_keys: Array.isArray(resp?.filters?.api_keys)
          ? resp.filters.api_keys
          : [],
        api_key_names: resp?.filters?.api_key_names ?? {},
        models: Array.isArray(resp?.filters?.models) ? resp.filters.models : [],
        channels: Array.isArray(resp?.filters?.channels)
          ? resp.filters.channels
          : [],
      },
      stats: {
        total: resp?.stats?.total ?? 0,
        success_rate: resp?.stats?.success_rate ?? 0,
        total_tokens: resp?.stats?.total_tokens ?? 0,
        total_cost: resp?.stats?.total_cost ?? 0,
        cache_rate: resp?.stats?.cache_rate ?? 0,
      },
    };
  },

  clearUsageLogs(
    payload: ClearUsageLogsPayload,
  ): Promise<ClearUsageLogsResponse> {
    return apiClient.delete<ClearUsageLogsResponse>("/usage/logs", payload);
  },

  exportUsage(): Promise<UsageExportPayload> {
    return apiClient.get<UsageExportPayload>("/usage/export");
  },

  importUsage(payload: unknown): Promise<UsageImportResponse> {
    return apiClient.post<UsageImportResponse>("/usage/import", payload);
  },

  getDashboardSummary(days = 7): Promise<DashboardSummary> {
    return apiClient.get<DashboardSummary>(`/dashboard-summary?days=${days}`);
  },

  async getLogContent(id: number): Promise<LogContentResponse> {
    return apiClient.get<LogContentResponse>(`/usage/logs/${id}/content`);
  },

  async getLogContentPart(
    id: number,
    part: LogContentPart,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<LogContentPartResponse> {
    const resp = await apiClient.get<unknown>(`/usage/logs/${id}/content`, {
      params: { part, format: "json" },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });

    if (resp && typeof resp === "object") {
      const record = resp as Record<string, unknown>;
      if (
        record.part === "input" ||
        record.part === "output" ||
        record.part === "details"
      ) {
        return {
          id: Number(record.id ?? id),
          model: String(record.model ?? ""),
          part: record.part as LogContentPart,
          content: String(record.content ?? ""),
        };
      }
      if ("input_content" in record || "output_content" in record) {
        return {
          id: Number(record.id ?? id),
          model: String(record.model ?? ""),
          part,
          content: String(
            part === "input"
              ? (record.input_content ?? "")
              : part === "output"
                ? (record.output_content ?? "")
                : (record.detail_content ?? record.details_content ?? ""),
          ),
        };
      }
    }

    return { id, model: "", part, content: "" };
  },

  getLogEgress(
    id: number,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<UsageLogEgressResponse> {
    return apiClient.get<UsageLogEgressResponse>(`/usage/logs/${id}/egress`, {
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });
  },
};

export interface DashboardSummary {
  kpi: {
    total_requests: number;
    success_requests: number;
    failed_requests: number;
    success_rate: number;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
    total_cost: number;
    cache_rate: number;
  };
  trends?: {
    request_volume?: DashboardTrendPoint[];
    success_rate?: DashboardTrendPoint[];
    total_tokens?: DashboardTrendPoint[];
    total_cost?: DashboardTrendPoint[];
    failed_requests?: DashboardTrendPoint[];
    throughput_series?: DashboardThroughputPoint[];
  };
  meta?: {
    generated_at?: string;
  };
  counts: {
    api_keys: number;
    providers_total: number;
    gemini_keys: number;
    claude_keys: number;
    codex_keys: number;
    vertex_keys: number;
    openai_providers: number;
    auth_files: number;
  };
  days: number;
}

export interface DashboardTrendPoint {
  label: string;
  value: number;
}

export interface DashboardThroughputPoint {
  label: string;
  rpm: number;
  tpm: number;
}

export interface UsageLogItem {
  id: number;
  timestamp: string;
  api_key: string;
  api_key_name: string;
  model: string;
  source: string;
  channel_name: string;
  auth_index: string;
  failed: boolean;
  latency_ms: number;
  first_token_ms: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost: number;
  has_content: boolean;
}

export interface UsageLogsResponse {
  items: UsageLogItem[];
  total: number;
  page: number;
  size: number;
  filters: {
    api_keys: string[];
    api_key_names: Record<string, string>;
    models: string[];
    channels: string[];
  };
  stats: {
    total: number;
    success_rate: number;
    total_tokens: number;
    total_cost: number;
    cache_rate: number;
  };
}

export interface LogContentResponse {
  id: number;
  input_content: string;
  output_content: string;
  model: string;
}

export interface LogContentPartResponse {
  id: number;
  model: string;
  part: LogContentPart;
  content: string;
}

export interface UsageLogEgressResponse {
  id: number;
  model?: string;
  route_kind?: string;
  proxy_source?: string;
  proxy_id?: string;
  proxy_name?: string;
  proxy_url_host?: string;
  effective_ip?: string;
  server_ip?: string;
  matches_server_ip?: boolean | null;
  using_proxy?: boolean;
  error?: string;
}

export type LogContentPart = "input" | "output" | "details";
