import { apiClient } from "@/lib/http/client";
import type { UsageData } from "@/lib/http/types";

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

export const usageApi = {
  async getUsage(): Promise<UsageData> {
    const response = await apiClient.get<Record<string, unknown>>("/usage");
    const candidate =
      response.usage && typeof response.usage === "object" ? response.usage : response;

    if (!candidate || typeof candidate !== "object") {
      return { apis: {} };
    }

    const payload = candidate as { apis?: UsageData["apis"] };

    if (!payload.apis || typeof payload.apis !== "object") {
      return { apis: {} };
    }

    return {
      apis: payload.apis,
    };
  },

  async getUsageLogs(params: {
    page?: number;
    size?: number;
    days?: number;
    api_key?: string;
    model?: string;
    status?: string;
  }): Promise<UsageLogsResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.size) qs.set("size", String(params.size));
    if (params.days) qs.set("days", String(params.days));
    if (params.api_key) qs.set("api_key", params.api_key);
    if (params.model) qs.set("model", params.model);
    if (params.status) qs.set("status", params.status);
    const query = qs.toString();
    return apiClient.get<UsageLogsResponse>(`/usage/logs${query ? `?${query}` : ""}`);
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

export interface UsageLogItem {
  id: number;
  timestamp: string;
  api_key: string;
  model: string;
  source: string;
  channel_name: string;
  auth_index: string;
  failed: boolean;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface UsageLogsResponse {
  items: UsageLogItem[];
  total: number;
  page: number;
  size: number;
  filters: {
    api_keys: string[];
    models: string[];
  };
  stats: {
    total: number;
    success_rate: number;
    total_tokens: number;
  };
}
