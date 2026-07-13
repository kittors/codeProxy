import type {
  BedrockAuthMode,
  BedrockProviderConfig,
  ProviderModel,
  ProviderSimpleConfig,
  OpenAIProvider,
} from "@code-proxy/api-client";
import type { KeyValueEntry } from "./KeyValueInputList";
import { recordToKeyValueEntries } from "./KeyValueInputList";
import type { ModelEntryDraft } from "./ModelInputList";
import type { KeyStatBucket } from "@code-proxy/domain";

const DISABLE_ALL_MODELS_RULE = "*";

export const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) &&
  models.some((m) => String(m ?? "").trim() === DISABLE_ALL_MODELS_RULE);

export const isProviderSimpleConfigEnabled = (
  item: ProviderSimpleConfig,
): boolean => !hasDisableAllModelsRule(item.excludedModels);

export const isBedrockProviderConfigEnabled = (
  item: BedrockProviderConfig,
): boolean => !hasDisableAllModelsRule(item.excludedModels);

export const isOpenAIProviderEnabled = (provider: OpenAIProvider): boolean =>
  provider.disabled !== true;

export const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models)
    ? models.filter((m) => String(m ?? "").trim() !== DISABLE_ALL_MODELS_RULE)
    : [];

export const withDisableAllModelsRule = (models?: string[]) => [
  ...stripDisableAllModelsRule(models),
  DISABLE_ALL_MODELS_RULE,
];

export const withoutDisableAllModelsRule = (models?: string[]) =>
  stripDisableAllModelsRule(models);

export const maskApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10)
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

export const excludedModelsToText = (models?: string[]) =>
  Array.isArray(models) ? models.join("\n") : "";

export const excludedModelsFromText = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const normalizeOpenAIBaseUrl = (baseUrl: string): string => {
  let trimmed = String(baseUrl || "").trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, "");
  trimmed = trimmed.replace(/\/+$/g, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
};

export const buildModelsEndpoint = (baseUrl: string): string => {
  const normalized = normalizeOpenAIBaseUrl(baseUrl);
  if (!normalized) return "";
  return `${normalized}/models`;
};

/** Default bases when the provider key leaves base URL empty (official endpoints). */
export const DEFAULT_CLAUDE_MODELS_BASE = "https://api.anthropic.com";
export const DEFAULT_CODEX_MODELS_BASE = "https://api.openai.com";
export const DEFAULT_CLAUDE_ANTHROPIC_VERSION = "2023-06-01";

/**
 * Build the upstream /models URL for a provider key type.
 * Claude uses Anthropic-style `/v1/models`; Codex/OpenAI-compatible use `/models`
 * (or `/v1/models` when the base already ends with `/v1`).
 */
export const buildProviderModelsEndpoint = (
  providerType: "claude" | "codex" | "openai",
  baseUrl: string,
): string => {
  const fallback =
    providerType === "claude"
      ? DEFAULT_CLAUDE_MODELS_BASE
      : providerType === "codex"
        ? DEFAULT_CODEX_MODELS_BASE
        : "";
  const normalized = normalizeOpenAIBaseUrl(baseUrl || fallback);
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower.endsWith("/models") || lower.includes("/models?")) {
    return normalized;
  }
  if (providerType === "claude") {
    if (lower.endsWith("/v1")) return `${normalized}/models`;
    return `${normalized}/v1/models`;
  }
  // Codex / OpenAI-compatible: prefer /v1/models when base has no path tail.
  if (lower.endsWith("/v1")) return `${normalized}/models`;
  if (lower.includes("api.openai.com") || providerType === "codex") {
    // Official OpenAI and typical Codex API-key bases expect /v1/models.
    if (!/\/v\d+(\/|$)/i.test(lower)) {
      return `${normalized}/v1/models`;
    }
  }
  return `${normalized}/models`;
};

export const normalizeDiscoveredModels = (
  payload: unknown,
): { id: string; owned_by?: string }[] => {
  if (!payload) return [];
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    try {
      return normalizeDiscoveredModels(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  const root = isRecord(payload) ? payload : null;
  // Codex manifests may nest under data / models / items.
  const data = root
    ? (root.data ?? root.models ?? root.items ?? payload)
    : payload;
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const result: { id: string; owned_by?: string }[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    // Claude: id; Codex: id | slug | name
    const id = String(item.id ?? item.slug ?? item.name ?? "").trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const owned_by =
      typeof item.owned_by === "string" ? item.owned_by : undefined;
    result.push({ id, ...(owned_by ? { owned_by } : {}) });
  }
  return result;
};

export type ProviderKeyDraft = {
  name: string;
  apiKey: string;
  disabled: boolean;
  authMode: BedrockAuthMode;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
  forceGlobal: boolean;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  proxyId: string;
  excludedModelsText: string;
  visionFallbackModel: string;
  workspaceId: string;
  authCookie: string;
  headersEntries: KeyValueEntry[];
  modelEntries: ModelEntryDraft[];
  skipAnthropicProcessing: boolean;
};

export const buildModelEntries = (
  models?: ProviderModel[],
): ModelEntryDraft[] => {
  if (!Array.isArray(models) || models.length === 0) return [];
  return models.map((model) => ({
    id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}-${model.name ?? ""}`,
    name: model.name ?? "",
    alias: model.alias ?? "",
    priorityText: model.priority !== undefined ? String(model.priority) : "",
    testModel: model.testModel ?? "",
  }));
};

export const commitModelEntries = (
  drafts: ModelEntryDraft[],
  options?: { requireAlias?: boolean },
): { models?: ProviderModel[]; error?: string } => {
  const models: ProviderModel[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) continue;

    const alias = draft.alias.trim();
    if (options?.requireAlias && !alias) {
      return { error: "Models must have alias (name => alias)" };
    }

    const priorityText = draft.priorityText.trim();
    const priority = priorityText !== "" ? Number(priorityText) : undefined;
    if (priority !== undefined && !Number.isFinite(priority)) {
      return { error: `Model ${name} priority must be a number` };
    }

    const testModel = draft.testModel.trim();

    models.push({
      name,
      ...(alias && alias !== name ? { alias } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(testModel ? { testModel } : {}),
    });
  }

  return { models: models.length ? models : undefined };
};

const hasBedrockFields = (
  input?: ProviderSimpleConfig | BedrockProviderConfig | null,
): input is BedrockProviderConfig =>
  !!input &&
  ("authMode" in input ||
    "accessKeyId" in input ||
    "secretAccessKey" in input ||
    "sessionToken" in input ||
    "region" in input ||
    "forceGlobal" in input);

export const buildProviderKeyDraft = (
  input?: ProviderSimpleConfig | BedrockProviderConfig | null,
): ProviderKeyDraft => {
  const bedrockInput = hasBedrockFields(input) ? input : null;

  return {
    name: input?.name ?? "",
    apiKey: input?.apiKey ?? "",
    disabled: input?.disabled === true,
    authMode: bedrockInput?.authMode ?? "api-key",
    accessKeyId:
      bedrockInput?.accessKeyId ?? (bedrockInput ? input?.apiKey : "") ?? "",
    secretAccessKey: bedrockInput?.secretAccessKey ?? "",
    sessionToken: bedrockInput?.sessionToken ?? "",
    region: bedrockInput?.region ?? "us-east-1",
    forceGlobal: bedrockInput?.forceGlobal ?? false,
    prefix: input?.prefix ?? "",
    baseUrl: input?.baseUrl ?? "",
    proxyUrl: input?.proxyUrl ?? "",
    proxyId: input?.proxyId ?? "",
    excludedModelsText: excludedModelsToText(input?.excludedModels),
    visionFallbackModel: input?.visionFallbackModel ?? "",
    workspaceId: input?.workspaceId ?? "",
    authCookie: input?.authCookie ?? "",
    headersEntries: recordToKeyValueEntries(input?.headers),
    modelEntries: buildModelEntries(input?.models),
    skipAnthropicProcessing: input?.skipAnthropicProcessing ?? false,
  };
};

export type OpenAIDraft = {
  name: string;
  disabled: boolean;
  baseUrl: string;
  prefix: string;
  headersEntries: KeyValueEntry[];
  priorityText: string;
  testModel: string;
  apiKeyEntries: {
    apiKey: string;
    disabled: boolean;
    proxyUrl: string;
    proxyId: string;
    headersEntries: KeyValueEntry[];
    id: string;
  }[];
  modelEntries: ModelEntryDraft[];
};

export const buildOpenAIDraft = (
  input?: OpenAIProvider | null,
): OpenAIDraft => ({
  name: input?.name ?? "",
  disabled: input?.disabled === true,
  baseUrl: input?.baseUrl ?? "",
  prefix: input?.prefix ?? "",
  headersEntries: recordToKeyValueEntries(input?.headers),
  priorityText: input?.priority !== undefined ? String(input.priority) : "",
  testModel: input?.testModel ?? "",
  apiKeyEntries:
    Array.isArray(input?.apiKeyEntries) && input.apiKeyEntries.length
      ? input.apiKeyEntries.map((entry, idx) => ({
          id: `key-${idx}-${entry.apiKey}`,
          apiKey: entry.apiKey ?? "",
          disabled: entry.disabled === true,
          proxyUrl: entry.proxyUrl ?? "",
          proxyId: entry.proxyId ?? "",
          headersEntries: recordToKeyValueEntries(entry.headers),
        }))
      : [
          {
            id: `key-${Date.now()}`,
            apiKey: "",
            disabled: false,
            proxyUrl: "",
            proxyId: "",
            headersEntries: [],
          },
        ],
  modelEntries: buildModelEntries(input?.models),
});

export type AmpMappingEntry = { id: string; from: string; to: string };

export const readString = (
  obj: Record<string, unknown> | null,
  ...keys: string[]
): string => {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

export const readBool = (
  obj: Record<string, unknown> | null,
  ...keys: string[]
): boolean => {
  if (!obj) return false;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
    }
    if (typeof value === "number") return value !== 0;
  }
  return false;
};

export const sumStatsByCandidates = (
  candidates: string[],
  statsBySource: Record<string, KeyStatBucket>,
): KeyStatBucket => {
  let total: KeyStatBucket = { success: 0, failure: 0 };
  for (const id of candidates) {
    const bucket = statsBySource[id];
    if (!bucket) continue;
    total = {
      success: total.success + bucket.success,
      failure: total.failure + bucket.failure,
    };
  }
  return total;
};
