import { apiClient } from "../client/client";

export interface ApiKeyEntry {
  id?: string;
  key: string;
  name?: string;
  disabled?: boolean;
  "daily-limit"?: number;
  "total-quota"?: number;
  "spending-limit"?: number;
  /** Project-timezone daily USD cap; 0 = unlimited. Key-owned, independent of permission profiles. */
  "daily-spending-limit"?: number;
  /** Effective today cost after same-day reset baseline (management list). */
  "daily-spending-used"?: number;
  /** Remaining daily budget; null/undefined = unlimited. */
  "daily-spending-remaining"?: number | null;
  "concurrency-limit"?: number;
  "rpm-limit"?: number;
  "tpm-limit"?: number;
  "allowed-models"?: string[];
  "allowed-channels"?: string[];
  "allowed-channel-groups"?: string[];
  "permission-profile-id"?: string;
  "system-prompt"?: string;
  "created-at"?: string;
}

export interface ApiKeyDailySpendingResetResult {
  status?: string;
  id?: string;
  key?: string;
  "daily-spending-limit"?: number;
  "daily-spending-used"?: number;
  "daily-spending-remaining"?: number | null;
}

export const apiKeysApi = {
  async list(): Promise<string[]> {
    const data = await apiClient.get<Record<string, unknown>>("/api-keys");
    const keys = (data?.["api-keys"] ?? data?.apiKeys) as unknown;
    return Array.isArray(keys) ? keys.map((key) => String(key)) : [];
  },

  replace: (keys: string[]) => apiClient.put("/api-keys", keys),

  update: (index: number, value: string) => apiClient.patch("/api-keys", { index, value }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`),
};

export const apiKeyEntriesApi = {
  async list(): Promise<ApiKeyEntry[]> {
    const data = await apiClient.get<Record<string, unknown>>("/api-key-entries");
    const entries = data?.["api-key-entries"] as unknown;
    return Array.isArray(entries) ? entries : [];
  },

  replace: (entries: ApiKeyEntry[]) => apiClient.put("/api-key-entries", entries),

  update: (payload: { id?: string; index?: number; match?: string; value: Partial<ApiKeyEntry> }) =>
    apiClient.patch("/api-key-entries", payload),

  delete: (params: { id?: string; index?: number; key?: string; deleteLogs?: boolean }) => {
    const query = new URLSearchParams();
    if (params.id) {
      query.set("id", params.id);
    } else if (params.key) {
      query.set("key", params.key);
    } else if (params.index !== undefined) {
      query.set("index", String(params.index));
    }
    if (params.deleteLogs !== undefined) {
      query.set("delete_logs", String(params.deleteLogs));
    }
    return apiClient.delete(`/api-key-entries?${query.toString()}`);
  },

  /** Reset same-day effective daily spending for a key (does not delete request logs). */
  resetDailySpending: (payload: { id?: string; key?: string }) =>
    apiClient.post<ApiKeyDailySpendingResetResult>(
      "/api-key-entries/daily-spending/reset",
      payload,
    ),
};
