import { apiClient } from "@/lib/http/client";
import type { ErrorLogsResponse, LogsQuery, LogsResponse } from "@/lib/http/types";

export const logsApi = {
  fetchLogs: ({ after, limit }: LogsQuery = {}): Promise<LogsResponse> => {
    const params: Record<string, number> = {};
    if (after) params.after = after;
    if (limit) params.limit = limit;
    return apiClient.get("/logs", {
      params: Object.keys(params).length ? params : undefined,
      timeoutMs: 60000,
    });
  },
  clearLogs: (): Promise<void> => apiClient.delete("/logs"),
  fetchErrorLogs: (): Promise<ErrorLogsResponse> =>
    apiClient.get("/request-error-logs", { timeoutMs: 60000 }),
  downloadErrorLog: (filename: string): Promise<void> =>
    apiClient.downloadToFile(`/request-error-logs/${encodeURIComponent(filename)}`, filename, {
      timeoutMs: 60000,
    }),
  downloadRequestLogById: (id: string): Promise<void> =>
    apiClient.downloadToFile(
      `/request-log-by-id/${encodeURIComponent(id)}`,
      `request-log-${id}.log`,
      {
        timeoutMs: 60000,
      },
    ),
};
