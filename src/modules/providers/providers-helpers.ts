import type { ProviderModel, ProviderSimpleConfig, OpenAIProvider } from "@/lib/http/types";
import type { KeyValueEntry } from "@/modules/providers/KeyValueInputList";
import { recordToKeyValueEntries } from "@/modules/providers/KeyValueInputList";
import type { ModelEntryDraft } from "@/modules/providers/ModelInputList";
import type { KeyStatBucket } from "@/modules/providers/provider-usage";

const DISABLE_ALL_MODELS_RULE = "*";

export const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) && models.some((m) => String(m ?? "").trim() === DISABLE_ALL_MODELS_RULE);

export const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models)
    ? models.filter((m) => String(m ?? "").trim() !== DISABLE_ALL_MODELS_RULE)
    : [];

export const withDisableAllModelsRule = (models?: string[]) => [
  ...stripDisableAllModelsRule(models),
  DISABLE_ALL_MODELS_RULE,
];

export const withoutDisableAllModelsRule = (models?: string[]) => stripDisableAllModelsRule(models);

export const maskApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
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

export const normalizeDiscoveredModels = (
  payload: unknown,
): { id: string; owned_by?: string }[] => {
  if (!payload) return [];
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const root = isRecord(payload) ? payload : null;
  const data = root ? (root.data ?? root.models ?? payload) : payload;
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const result: { id: string; owned_by?: string }[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = String(item.id ?? item.name ?? "").trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const owned_by = typeof item.owned_by === "string" ? item.owned_by : undefined;
    result.push({ id, ...(owned_by ? { owned_by } : {}) });
  }
  return result;
};

export type ProviderKeyDraft = {
  apiKey: string;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  excludedModelsText: string;
  headersEntries: KeyValueEntry[];
  modelEntries: ModelEntryDraft[];
};

export const buildModelEntries = (models?: ProviderModel[]): ModelEntryDraft[] => {
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
      return { error: "models 必须填写 alias（使用 name => alias）" };
    }

    const priorityText = draft.priorityText.trim();
    const priority = priorityText !== "" ? Number(priorityText) : undefined;
    if (priority !== undefined && !Number.isFinite(priority)) {
      return { error: `模型 ${name} 的 priority 必须是数字` };
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

export const buildProviderKeyDraft = (input?: ProviderSimpleConfig | null): ProviderKeyDraft => ({
  apiKey: input?.apiKey ?? "",
  prefix: input?.prefix ?? "",
  baseUrl: input?.baseUrl ?? "",
  proxyUrl: input?.proxyUrl ?? "",
  excludedModelsText: excludedModelsToText(input?.excludedModels),
  headersEntries: recordToKeyValueEntries(input?.headers),
  modelEntries: buildModelEntries(input?.models),
});

export type OpenAIDraft = {
  name: string;
  baseUrl: string;
  prefix: string;
  headersEntries: KeyValueEntry[];
  priorityText: string;
  testModel: string;
  apiKeyEntries: {
    apiKey: string;
    proxyUrl: string;
    headersEntries: KeyValueEntry[];
    id: string;
  }[];
  modelEntries: ModelEntryDraft[];
};

export const buildOpenAIDraft = (input?: OpenAIProvider | null): OpenAIDraft => ({
  name: input?.name ?? "",
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
          proxyUrl: entry.proxyUrl ?? "",
          headersEntries: recordToKeyValueEntries(entry.headers),
        }))
      : [{ id: `key-${Date.now()}`, apiKey: "", proxyUrl: "", headersEntries: [] }],
  modelEntries: buildModelEntries(input?.models),
});

export type AmpMappingEntry = { id: string; from: string; to: string };

export const readString = (obj: Record<string, unknown> | null, ...keys: string[]): string => {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

export const readBool = (obj: Record<string, unknown> | null, ...keys: string[]): boolean => {
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
    total = { success: total.success + bucket.success, failure: total.failure + bucket.failure };
  }
  return total;
};
