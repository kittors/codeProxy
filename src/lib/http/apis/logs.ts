import { apiClient } from "@/lib/http/client";
import type { ErrorLogsResponse, LogsQuery, LogsResponse } from "@/lib/http/types";

export const logsApi = {
  fetchLogs: ({ after, limit }: LogsQuery = {}): Promise<LogsResponse> => {
    const params: Record<string, number> = {};
    if (after) params.after = after;
    if (limit) params.limit = limit;
    return apiClient.get("/logs", { params: Object.keys(params).length ? params : undefined, timeoutMs: 60000 });
  },
  clearLogs: (): Promise<void> => apiClient.delete("/logs"),
  fetchErrorLogs: (): Promise<ErrorLogsResponse> =>
    apiClient.get("/request-error-logs", { timeoutMs: 60000 }),
  downloadErrorLog: (filename: string): Promise<Blob> =>
    apiClient.getBlob(`/request-error-logs/${encodeURIComponent(filename)}`, { timeoutMs: 60000 }),
  downloadRequestLogById: (id: string): Promise<Blob> =>
    apiClient.getBlob(`/request-log-by-id/${encodeURIComponent(id)}`, { timeoutMs: 60000 }),
};
