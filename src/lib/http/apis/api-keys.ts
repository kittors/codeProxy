import { apiClient } from "@/lib/http/client";

export interface ApiKeyEntry {
  key: string;
  name?: string;
  disabled?: boolean;
  "daily-limit"?: number;
  "total-quota"?: number;
  "concurrency-limit"?: number;
  "rpm-limit"?: number;
  "tpm-limit"?: number;
  "allowed-models"?: string[];
  "allowed-channels"?: string[];
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

  delete: (params: { index?: number; key?: string }) => {
    const query = params.key ? `key=${encodeURIComponent(params.key)}` : `index=${params.index}`;
    return apiClient.delete(`/api-key-entries?${query}`);
  },
};
