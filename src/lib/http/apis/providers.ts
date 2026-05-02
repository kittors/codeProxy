import { apiClient } from "@/lib/http/client";
import type {
  BedrockAuthMode,
  BedrockProviderConfig,
  OpenAIProvider,
  ProviderSimpleConfig,
} from "@/lib/http/types";
import {
  extractArrayPayload,
  isRecord,
  normalizeApiKeyEntries,
  normalizeExcludedModels,
  normalizeHeaders,
  normalizeModels,
  normalizeString,
  serializeGeminiKey,
  serializeBedrockKey,
  serializeOpenCodeGoKey,
  serializeOpenAIProvider,
  serializeProviderKey,
} from "@/lib/http/apis/helpers";

const isOauthBackedProviderRow = (item: Record<string, unknown>): boolean => {
  const accountType = normalizeString(item.account_type ?? item.accountType)?.toLowerCase();
  if (accountType === "oauth") return true;

  const runtimeOnly = item.runtime_only ?? item.runtimeOnly;
  return (
    runtimeOnly === true ||
    (typeof runtimeOnly === "string" && runtimeOnly.trim().toLowerCase() === "true")
  );
};

export const providersApi = {
  async getGeminiKeys(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/gemini-api-key");
    const list = extractArrayPayload(data, "gemini-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        if (isOauthBackedProviderRow(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyId = normalizeString(item["proxy-id"] ?? item.proxyId) ?? undefined;
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
          ...(proxyId ? { proxyId } : {}),
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
        if (isOauthBackedProviderRow(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const proxyId = normalizeString(item["proxy-id"] ?? item.proxyId) ?? undefined;
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
          ...(proxyId ? { proxyId } : {}),
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

  async getOpenCodeGoConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/opencode-go-api-key");
    const list = extractArrayPayload(data, "opencode-go-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        if (isOauthBackedProviderRow(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const proxyId = normalizeString(item["proxy-id"] ?? item.proxyId) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const excludedModels = normalizeExcludedModels(
          item["excluded-models"] ?? item.excludedModels,
        );
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(proxyId ? { proxyId } : {}),
          ...(headers ? { headers } : {}),
          ...(excludedModels ? { excludedModels } : {}),
        };
      })
      .filter(Boolean) as ProviderSimpleConfig[];
  },

  saveOpenCodeGoConfigs: (configs: ProviderSimpleConfig[]) =>
    apiClient.put(
      "/opencode-go-api-key",
      configs.map((item) => serializeOpenCodeGoKey(item)),
    ),

  deleteOpenCodeGoConfig: (apiKey: string) =>
    apiClient.delete("/opencode-go-api-key", undefined, { params: { "api-key": apiKey } }),

  async getClaudeConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/claude-api-key");
    const list = extractArrayPayload(data, "claude-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        if (isOauthBackedProviderRow(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const proxyId = normalizeString(item["proxy-id"] ?? item.proxyId) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(
          item["excluded-models"] ?? item.excludedModels,
        );
        const skipAnthropicProcessing =
          item["skip-anthropic-processing"] === true || item.skipAnthropicProcessing === true;
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(proxyId ? { proxyId } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(excludedModels ? { excludedModels } : {}),
          ...(skipAnthropicProcessing ? { skipAnthropicProcessing } : {}),
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

  async getBedrockConfigs(): Promise<BedrockProviderConfig[]> {
    const data = await apiClient.get("/bedrock-api-key");
    const list = extractArrayPayload(data, "bedrock-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        if (isOauthBackedProviderRow(item)) return null;
        const rawMode = normalizeString(item["auth-mode"] ?? item.authMode) ?? "sigv4";
        const authMode: BedrockAuthMode =
          rawMode === "apikey" || rawMode === "api_key" || rawMode === "api-key"
            ? "api-key"
            : "sigv4";
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        const accessKeyId = normalizeString(item["access-key-id"] ?? item.accessKeyId) ?? undefined;
        const secretAccessKey =
          normalizeString(item["secret-access-key"] ?? item.secretAccessKey) ?? undefined;
        const sessionToken =
          normalizeString(item["session-token"] ?? item.sessionToken) ?? undefined;
        const credential = authMode === "api-key" ? apiKey : (accessKeyId ?? "");
        if (!credential) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const region = normalizeString(item.region) ?? undefined;
        const forceGlobal = item["force-global"] === true || item.forceGlobal === true;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const proxyId = normalizeString(item["proxy-id"] ?? item.proxyId) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        const excludedModels = normalizeExcludedModels(
          item["excluded-models"] ?? item.excludedModels,
        );
        return {
          apiKey: credential,
          authMode,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(authMode === "sigv4" && accessKeyId ? { accessKeyId } : {}),
          ...(authMode === "sigv4" && secretAccessKey ? { secretAccessKey } : {}),
          ...(authMode === "sigv4" && sessionToken ? { sessionToken } : {}),
          ...(region ? { region } : {}),
          ...(forceGlobal ? { forceGlobal } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(proxyId ? { proxyId } : {}),
          ...(headers ? { headers } : {}),
          ...(models ? { models } : {}),
          ...(excludedModels ? { excludedModels } : {}),
        };
      })
      .filter(Boolean) as BedrockProviderConfig[];
  },

  saveBedrockConfigs: (configs: BedrockProviderConfig[]) =>
    apiClient.put(
      "/bedrock-api-key",
      configs.map((item) => serializeBedrockKey(item)),
    ),

  deleteBedrockConfig: (index: number) =>
    apiClient.delete("/bedrock-api-key", undefined, { params: { index } }),

  async getVertexConfigs(): Promise<ProviderSimpleConfig[]> {
    const data = await apiClient.get("/vertex-api-key");
    const list = extractArrayPayload(data, "vertex-api-key");
    return list
      .map((item) => {
        if (!isRecord(item)) return null;
        if (isOauthBackedProviderRow(item)) return null;
        const apiKey = normalizeString(item["api-key"] ?? item.apiKey) ?? "";
        if (!apiKey) return null;
        const name = normalizeString(item.name) ?? undefined;
        const prefix = normalizeString(item.prefix) ?? undefined;
        const baseUrl = normalizeString(item["base-url"] ?? item.baseUrl) ?? undefined;
        const proxyUrl = normalizeString(item["proxy-url"] ?? item.proxyUrl) ?? undefined;
        const proxyId = normalizeString(item["proxy-id"] ?? item.proxyId) ?? undefined;
        const headers = normalizeHeaders(item.headers);
        const models = normalizeModels(item.models);
        return {
          apiKey,
          ...(name ? { name } : {}),
          ...(prefix ? { prefix } : {}),
          ...(baseUrl ? { baseUrl } : {}),
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(proxyId ? { proxyId } : {}),
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
        if (isOauthBackedProviderRow(item)) return null;
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
