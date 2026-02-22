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

  exportUsage(): Promise<UsageExportPayload> {
    return apiClient.get<UsageExportPayload>("/usage/export");
  },

  importUsage(payload: unknown): Promise<UsageImportResponse> {
    return apiClient.post<UsageImportResponse>("/usage/import", payload);
  },
};
