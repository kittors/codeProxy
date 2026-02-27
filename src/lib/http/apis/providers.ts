import { apiClient } from "@/lib/http/client";
import type { OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import {
  extractArrayPayload,
  isRecord,
  normalizeApiKeyEntries,
  normalizeExcludedModels,
  normalizeHeaders,
  normalizeModels,
  normalizeString,
  serializeGeminiKey,
  serializeOpenAIProvider,
  serializeProviderKey,
} from "@/lib/http/apis/helpers";

export const providersApi = {
  async getGeminiKeys(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/gemini-api-key");
    const list = extractArrayPayload(data, "gemini-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(
          item["excluded-models"] ?? item.excludedModels,
        );
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(excludedModels ? { excludedModels } : {}),
        };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveGeminiKeys: (configs: ProviderSimpleConfig[]) =>
    apiClient.put(
      "/gemini-api-key",
      configs.map((item) => serializeGeminiKey(item)),
    ),

  deleteGeminiKey: (apiKey: string) =>
    apiClient.delete("/gemini-api-key", undefined, { params: { "api-key": apiKey } }),

  async getCodexConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/codex-api-key");
    const list = extractArrayPayload(data, "codex-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(
          item["excluded-models"] ?? item.excludedModels,
        );
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(excludedModels ? { excludedModels } : {}),
        };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveCodexConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put(
      "/codex-api-key",
      configs.map((item) => serializeProviderKey(item)),
    ),

  deleteCodexConfig: (apiKey: string) =>
    apiClient.delete("/codex-api-key", undefined, { params: { "api-key": apiKey } }),

  async getClaudeConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/claude-api-key");
    const list = extractArrayPayload(data, "claude-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(
          item["excluded-models"] ?? item.excludedModels,
        );
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(excludedModels ? { excludedModels } : {}),
        };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveClaudeConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put(
      "/claude-api-key",
      configs.map((item) => serializeProviderKey(item)),
    ),

  deleteClaudeConfig: (apiKey: string) =>
    apiClient.delete("/claude-api-key", undefined, { params: { "api-key": apiKey } }),

  async getVertexConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/vertex-api-key");
    const list = extractArrayPayload(data, "vertex-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
        };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveVertexConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put(
      "/vertex-api-key",
      configs.map((item) => serializeProviderKey(item)),
    ),

  deleteVertexConfig: (apiKey: string) =>
    apiClient.delete("/vertex-api-key", undefined, { params: { "api-key": apiKey } }),

  async getOpenAIProviders(): Promise<OpenAIProvider[]> {
    const data = await apiClient.get("/openai-compatibility");
    const list = extractArrayPayload(data, "openai-compatibility");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = normalizeString(item.name) ?? "";
        if (!name) return null;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const apiKeyEntries = normalizeApiKeyEntries(item["api-key-entries"] ?? item.apiKeyEntries);
        const priorityRaw = item.priority;
        const priority =
          typeof priorityRaw === "number" && Number.isFinite(priorityRaw) ? priorityRaw : undefined;
        const testModel = normalizeString(item["test-model"] ?? item.testModel) ?? undefined;
        return {
          name,
          ...(baseUrl ? { baseUrl } : {}),
          ...(prefix ? { prefix } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(apiKeyEntries ? { apiKeyEntries } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(testModel ? { testModel } : {}),
        };
      })
      .filter(Boolean) as OpenAIProvider[];
  },

  saveOpenAIProviders: (providers: OpenAIProvider[]) =>
    apiClient.put(
      "/openai-compatibility",
      providers.map((item) => serializeOpenAIProvider(item)),
    ),

  deleteOpenAIProvider: (name: string) =>
    apiClient.delete("/openai-compatibility", undefined, { params: { name } }),
};
