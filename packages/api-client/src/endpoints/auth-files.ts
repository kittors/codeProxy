import { apiClient } from "../client/client";
import type { AuthFilesResponse, OAuthModelAliasEntry } from "../dto/types";
import { normalizeOauthExcludedModels, normalizeOauthModelAlias } from "./helpers";

export const authFilesApi = {
  list: (options?: { signal?: AbortSignal }): Promise<AuthFilesResponse> => {
    if (options?.signal) {
      return apiClient.get<AuthFilesResponse>("/auth-files", { signal: options.signal });
    }
    return apiClient.get<AuthFilesResponse>("/auth-files");
  },
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
  downloadBlob: (name: string) =>
    apiClient.getBlob("/auth-files/download", { params: { name }, timeoutMs: 60000 }),
  downloadFile: (name: string) =>
    apiClient.downloadToFile("/auth-files/download", name, { params: { name }, timeoutMs: 60000 }),
  patchFields: (payload: {
    name: string;
    label?: string;
    prefix?: string;
    proxy_url?: string;
    proxy_id?: string;
    priority?: number;
    subscription_started_at?: string;
    subscription_period?: string;
    subscription_expires_at?: string;
    custom_tags?: string[];
    hidden_default_tags?: string[];
    display_tags?: string[];
    codex_cli_only?: boolean;
    codex_cli_only_allowed_clients?: string[];
    codex_image_generation_bridge?: boolean;
    using_api?: boolean;
    concurrency_limit?: number;
    codex_convergence_mode?: string;
    codex_service_tier?: string;
  }) => apiClient.patch("/auth-files/fields", payload),

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
    options?: { force?: boolean },
  ): Promise<{
    models: { id: string; display_name?: string; type?: string; owned_by?: string }[];
    source: "registry" | "upstream" | string;
  }> => {
    const params: Record<string, string> = { name };
    // refresh=1 forces a re-fetch from upstream.
    // claude/codex/xai/kimi: backend keeps a provider-level discovery cache
    // (shared by same-type accounts); open auto-warms once, force refreshes it.
    // antigravity may still update the runtime registry on force refresh.
    if (options?.force) {
      params.refresh = "1";
    }
    const data = await apiClient.get<Record<string, unknown>>("/auth-files/models", {
      params,
    });
    const models = data.models ?? data["models"];
    const sourceRaw = data.source ?? data["source"];
    const source =
      typeof sourceRaw === "string" && sourceRaw.trim()
        ? sourceRaw.trim().toLowerCase()
        : "registry";
    return {
      models: Array.isArray(models)
        ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
        : [],
      source,
    };
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

  getWarmupTargets: async (authId: string): Promise<{ pool_id: string; pool_label: string; target_model: string; window: number }[]> => {
    const data = await apiClient.get<{ targets?: { pool_id: string; pool_label: string; target_model: string; window: number }[] }>(
      "/auth-files/warmup/targets",
      { params: { auth_id: authId } },
    );
    return Array.isArray(data?.targets) ? data.targets : [];
  },

  runWarmup: async (authId: string, poolId?: string): Promise<{ success: boolean; status_code: number; error_message?: string }> => {
    const data = await apiClient.post<{ result?: { success: boolean; status_code: number; error_message?: string } }>(
      "/auth-files/warmup/run",
      { auth_id: authId, pool_id: poolId },
    );
    return data?.result ?? { success: false, status_code: 500 };
  },

  getWarmupPolicies: async (): Promise<{ policies: unknown[]; metrics: unknown }> => {
    const data = await apiClient.get<{ policies?: unknown[]; metrics?: unknown }>("/auth-files/warmup/policies");
    return {
      policies: Array.isArray(data?.policies) ? data.policies : [],
      metrics: data?.metrics ?? {},
    };
  },

  saveWarmupPolicy: async (policy: Record<string, unknown>): Promise<void> => {
    await apiClient.post("/auth-files/warmup/policies", policy);
  },
};
