import { apiClient } from "@/lib/http/client";
import type { AuthFilesResponse, OAuthModelAliasEntry } from "@/lib/http/types";
import { normalizeOauthExcludedModels, normalizeOauthModelAlias } from "@/lib/http/apis/helpers";

export const authFilesApi = {
  list: (): Promise<AuthFilesResponse> => apiClient.get<AuthFilesResponse>("/auth-files"),
  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<{ status: string; disabled: boolean }>("/auth-files/status", {
      name,
      disabled,
    }),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return apiClient.postForm("/auth-files", formData);
  },
  deleteFile: (name: string) => apiClient.delete("/auth-files", undefined, { params: { name } }),
  deleteAll: () => apiClient.delete("/auth-files", undefined, { params: { all: true } }),
  downloadText: (name: string) =>
    apiClient.getText("/auth-files/download", { params: { name }, timeoutMs: 60000 }),

  getOauthExcludedModels: async (): Promise<Record<string, string[]>> => {
    const data = await apiClient.get("/oauth-excluded-models");
    return normalizeOauthExcludedModels(data);
  },
  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch("/oauth-excluded-models", { provider, models }),
  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete("/oauth-excluded-models", undefined, { params: { provider } }),
  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put("/oauth-excluded-models", normalizeOauthExcludedModels(map)),

  getOauthModelAlias: async (): Promise<Record<string, OAuthModelAliasEntry[]>> => {
    const data = await apiClient.get("/oauth-model-alias");
    return normalizeOauthModelAlias(data);
  },
  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? "")
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch("/oauth-model-alias", {
      channel: normalizedChannel,
      aliases: normalizedAliases,
    });
  },
  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? "")
      .trim()
      .toLowerCase();
    try {
      await apiClient.patch("/oauth-model-alias", { channel: normalizedChannel, aliases: [] });
    } catch {
      await apiClient.delete("/oauth-model-alias", undefined, {
        params: { channel: normalizedChannel },
      });
    }
  },

  getModelsForAuthFile: async (
    name: string,
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> => {
    const data = await apiClient.get<Record<string, unknown>>("/auth-files/models", {
      params: { name },
    });
    const models = data.models ?? data["models"];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
  getModelDefinitions: async (
    channel: string,
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> => {
    const normalizedChannel = String(channel ?? "")
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`,
    );
    const models = data.models ?? data["models"];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};
