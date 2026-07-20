import { apiClient } from "../client/client";

export interface CodexOAuthAllowedClientPresetInfo {
  id: string;
  label: string;
  description?: string;
}

export interface CodexOAuthAdmissionConfig {
  allowed_clients?: string[];
}

export interface RequestLogBodyStorageResponse {
  enabled: boolean;
  cleanup?: {
    deleted_logs: number;
    deleted_contents: number;
    cleared_body_rows: number;
    cleared_detail_rows: number;
    cleared_legacy_rows: number;
    sanitized_detail_rows?: number;
    removed_detail_bytes?: number;
    reclaimed_storage?: boolean;
    physical_reclaim_deferred?: boolean;
  };
}

export interface CodexOAuthAdmissionResponse {
  allowed_clients?: string[];
  available_allowed_clients?: CodexOAuthAllowedClientPresetInfo[];
  "codex-oauth-admission"?: CodexOAuthAdmissionConfig;
}

export const configApi = {
  getConfig: () => apiClient.get<Record<string, unknown>>("/config"),

  updateDebug: (enabled: boolean) => apiClient.put("/debug", { value: enabled }),
  updateProxyUrl: (proxyUrl: string) => apiClient.put("/proxy-url", { value: proxyUrl }),
  clearProxyUrl: () => apiClient.delete("/proxy-url"),
  updateRequestRetry: (retryCount: number) =>
    apiClient.put("/request-retry", { value: retryCount }),
  updateSwitchProject: (enabled: boolean) =>
    apiClient.put("/quota-exceeded/switch-project", { value: enabled }),
  updateSwitchPreviewModel: (enabled: boolean) =>
    apiClient.put("/quota-exceeded/switch-preview-model", { value: enabled }),
  updateUsageStatistics: (enabled: boolean) =>
    apiClient.put("/usage-statistics-enabled", { value: enabled }),
  getUsageStatisticsEnabled: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/usage-statistics-enabled");
    return Boolean(data?.["usage-statistics-enabled"] ?? data?.usageStatisticsEnabled ?? false);
  },
  getDebug: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/debug");
    return Boolean(data?.debug ?? false);
  },
  getRequestLog: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/request-log");
    return Boolean(data?.["request-log"] ?? data?.requestLog ?? false);
  },
  updateRequestLog: (enabled: boolean) => apiClient.put("/request-log", { value: enabled }),
  getRequestLogBodyStorage: async (): Promise<boolean> => {
    const data = await apiClient.get<RequestLogBodyStorageResponse>(
      "/request-log-storage/store-content",
    );
    return data.enabled === true;
  },
  updateRequestLogBodyStorage: (enabled: boolean, clearExisting = false) =>
    apiClient.put<RequestLogBodyStorageResponse>(
      "/request-log-storage/store-content",
      {
        value: enabled,
        clear_existing: clearExisting,
      },
      { timeoutMs: 10 * 60_000 },
    ),
  getLoggingToFile: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/logging-to-file");
    return Boolean(data?.["logging-to-file"] ?? data?.loggingToFile ?? false);
  },
  updateLoggingToFile: (enabled: boolean) => apiClient.put("/logging-to-file", { value: enabled }),
  getWsAuth: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/ws-auth");
    return Boolean(data?.["ws-auth"] ?? data?.wsAuth ?? false);
  },
  getSwitchProject: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/quota-exceeded/switch-project");
    return Boolean(data?.["switch-project"] ?? data?.switchProject ?? false);
  },
  getSwitchPreviewModel: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>(
      "/quota-exceeded/switch-preview-model",
    );
    return Boolean(data?.["switch-preview-model"] ?? data?.switchPreviewModel ?? false);
  },
  getLogsMaxTotalSizeMb: async (): Promise<number> => {
    const data = await apiClient.get<Record<string, unknown>>("/logs-max-total-size-mb");
    const value = data?.["logs-max-total-size-mb"] ?? data?.logsMaxTotalSizeMb ?? 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  updateLogsMaxTotalSizeMb: (value: number) => apiClient.put("/logs-max-total-size-mb", { value }),
  updateWsAuth: (enabled: boolean) => apiClient.put("/ws-auth", { value: enabled }),
  getForceModelPrefix: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/force-model-prefix");
    return Boolean(data?.["force-model-prefix"] ?? data?.forceModelPrefix ?? false);
  },
  updateForceModelPrefix: (enabled: boolean) =>
    apiClient.put("/force-model-prefix", { value: enabled }),
  getRoutingStrategy: async (): Promise<string> => {
    const data = await apiClient.get<Record<string, unknown>>("/routing/strategy");
    const strategy = data?.strategy ?? data?.["routing-strategy"] ?? data?.routingStrategy;
    return typeof strategy === "string" && strategy.trim() ? strategy.trim() : "round-robin";
  },
  updateRoutingStrategy: (strategy: string) =>
    apiClient.put("/routing/strategy", { value: strategy }),
  getAutoUpdateEnabled: async (): Promise<boolean> => {
    const data = await apiClient.get<Record<string, unknown>>("/auto-update/enabled");
    return Boolean(data?.enabled ?? data?.["auto-update-enabled"] ?? true);
  },
  updateAutoUpdateEnabled: (enabled: boolean) =>
    apiClient.put("/auto-update/enabled", { value: enabled }),
  getAutoUpdateChannel: async (): Promise<string> => {
    const data = await apiClient.get<Record<string, unknown>>("/auto-update/channel");
    const channel = data?.channel ?? data?.["auto-update-channel"];
    return typeof channel === "string" && channel.trim() ? channel.trim() : "main";
  },
  updateAutoUpdateChannel: (channel: string) =>
    apiClient.put("/auto-update/channel", { value: channel }),
  getCodexOAuthAdmission: () =>
    apiClient.get<CodexOAuthAdmissionResponse>("/codex-oauth-admission"),
  updateCodexOAuthAdmission: (allowedClients: string[]) =>
    apiClient.put<{ status: string }>("/codex-oauth-admission", {
      allowed_clients: allowedClients,
    }),
};
