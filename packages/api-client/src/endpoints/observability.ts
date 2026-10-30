import { apiClient } from "../client/client";

/**
 * The /metrics endpoint settings as the management API reports them. The
 * scrape token itself only appears in the response of the write that generated
 * it (`token`); afterwards the panel knows its last four characters.
 */
export interface ObservabilityMetricsSettings {
  enabled: boolean;
  token_configured: boolean;
  token_hint?: string;
  token_created_at?: string;
  updated_at?: string;
  /** Path of the exposition on the backend, `/metrics`. */
  path: string;
  /** False when the backend has no settings store and refuses writes. */
  persistent: boolean;
  token?: string;
}

export const observabilityApi = {
  getMetrics: () => apiClient.get<ObservabilityMetricsSettings>("/observability/metrics"),
  setMetricsEnabled: (enabled: boolean) =>
    apiClient.put<ObservabilityMetricsSettings>("/observability/metrics", { enabled }),
  rotateMetricsToken: () =>
    apiClient.post<ObservabilityMetricsSettings>("/observability/metrics/token"),
};
