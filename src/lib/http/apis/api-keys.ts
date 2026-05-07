import { apiClient } from "@/lib/http/client";

export interface ApiKeyEntry {
  key: string;
  name?: string;
  disabled?: boolean;
  "daily-limit"?: number;
  "total-quota"?: number;
  "spending-limit"?: number;
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

  update: (payload: { index?: number; match?: string; value: Partial<ApiKeyEntry> }) =>
    apiClient.patch("/api-key-entries", payload),

  delete: (params: { index?: number; key?: string; deleteLogs?: boolean }) => {
    const query = new URLSearchParams();
    if (params.key) {
      query.set("key", params.key);
    } else if (params.index !== undefined) {
      query.set("index", String(params.index));
    }
    if (params.deleteLogs !== undefined) {
      query.set("delete_logs", String(params.deleteLogs));
    }
    return apiClient.delete(`/api-key-entries?${query.toString()}`);
  },
};
