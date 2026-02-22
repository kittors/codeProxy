import { apiCallApi, getApiCallErrorMessage } from "@/lib/http/apis/api-call";

const DEFAULT_CLAUDE_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_MODELS_IN_FLIGHT = new Map<string, Promise<ModelInfo[]>>();

export type ModelInfo = {
  id: string;
  alias?: string;
  description?: string;
};

const normalizeApiBase = (baseUrl: string): string => {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/g, "");
};

const buildModelsEndpoint = (baseUrl: string): string => {
  const normalized = normalizeApiBase(baseUrl);
  if (!normalized) return "";
  if (/\/models$/i.test(normalized)) return normalized;
  return `${normalized}/models`;
};

const buildV1ModelsEndpoint = (baseUrl: string): string => {
  const normalized = normalizeApiBase(baseUrl);
  if (!normalized) return "";
  if (/\/v1\/models$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/models`;
  return `${normalized}/v1/models`;
};

const buildClaudeModelsEndpoint = (baseUrl: string): string => {
  const normalized = normalizeApiBase(baseUrl);
  const fallback = normalized || DEFAULT_CLAUDE_BASE_URL;
  let trimmed = fallback.replace(/\/+$/g, "");
  trimmed = trimmed.replace(/\/v1\/models$/i, "");
  trimmed = trimmed.replace(/\/v1(?:\/.*)?$/i, "");
  return `${trimmed}/v1/models`;
};

const hasHeader = (headers: Record<string, string>, name: string) => {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const resolveBearerTokenFromAuthorization = (headers: Record<string, string>): string => {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "authorization");
  if (!entry) return "";
  const value = String(entry[1] ?? "").trim();
  if (!value) return "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const buildRequestSignature = (url: string, headers: Record<string, string>) => {
  const signature = Object.entries(headers)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
  return `${url}||${signature}`;
};

const normalizeModelList = (payload: unknown): ModelInfo[] => {
  const list = (() => {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const data = record.data ?? record.models;
      if (Array.isArray(data)) return data;
    }
    return [];
  })();

  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawId = record.id ?? record.name ?? record.model;
    const id = String(rawId ?? "").trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const alias = record.alias ?? record.display_name ?? record.displayName;
    const description = record.description;
    models.push({
      id,
      ...(alias ? { alias: String(alias) } : {}),
      ...(description ? { description: String(description) } : {}),
    });
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
};

export const modelsApi = {
  buildClaudeModelsEndpoint,

  async fetchV1Models(baseUrl: string, apiKey?: string, headers: Record<string, string> = {}) {
    const endpoint = buildV1ModelsEndpoint(baseUrl);
    if (!endpoint) {
      throw new Error("Invalid base url");
    }

    const resolvedHeaders: Record<string, string> = { ...headers };
    if (apiKey) {
      resolvedHeaders.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers: Object.keys(resolvedHeaders).length ? resolvedHeaders : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text.trim() || `请求失败（${response.status}）`);
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    return normalizeModelList(payload);
  },

  async fetchModelsViaApiCall(
    baseUrl: string,
    apiKey?: string,
    headers: Record<string, string> = {},
  ) {
    const endpoint = buildModelsEndpoint(baseUrl);
    if (!endpoint) {
      throw new Error("Invalid base url");
    }

    const resolvedHeaders: Record<string, string> = { ...headers };
    const hasAuthHeader =
      typeof resolvedHeaders.Authorization === "string" || hasHeader(resolvedHeaders, "authorization");
    if (apiKey && !hasAuthHeader) {
      resolvedHeaders.Authorization = `Bearer ${apiKey}`;
    }

    const result = await apiCallApi.request({
      method: "GET",
      url: endpoint,
      header: Object.keys(resolvedHeaders).length ? resolvedHeaders : undefined,
    });

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }

    return normalizeModelList(result.body ?? result.bodyText);
  },

  async fetchClaudeModelsViaApiCall(
    baseUrl: string,
    apiKey?: string,
    headers: Record<string, string> = {},
  ) {
    const endpoint = buildClaudeModelsEndpoint(baseUrl);
    if (!endpoint) {
      throw new Error("Invalid base url");
    }

    const resolvedHeaders: Record<string, string> = { ...headers };
    let resolvedApiKey = String(apiKey ?? "").trim();
    if (!resolvedApiKey && !hasHeader(resolvedHeaders, "x-api-key")) {
      resolvedApiKey = resolveBearerTokenFromAuthorization(resolvedHeaders);
    }

    if (resolvedApiKey && !hasHeader(resolvedHeaders, "x-api-key")) {
      resolvedHeaders["x-api-key"] = resolvedApiKey;
    }
    if (!hasHeader(resolvedHeaders, "anthropic-version")) {
      resolvedHeaders["anthropic-version"] = DEFAULT_ANTHROPIC_VERSION;
    }

    const signature = buildRequestSignature(endpoint, resolvedHeaders);
    const existing = CLAUDE_MODELS_IN_FLIGHT.get(signature);
    if (existing) return existing;

    const request = (async () => {
      const result = await apiCallApi.request({
        method: "GET",
        url: endpoint,
        header: Object.keys(resolvedHeaders).length ? resolvedHeaders : undefined,
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }

      return normalizeModelList(result.body ?? result.bodyText);
    })();

    CLAUDE_MODELS_IN_FLIGHT.set(signature, request);
    try {
      return await request;
    } finally {
      CLAUDE_MODELS_IN_FLIGHT.delete(signature);
    }
  },
};
