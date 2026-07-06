import type {
  BedrockProviderConfig,
  OpenAIProvider,
  ProviderApiKeyEntry,
  ProviderModel,
  ProviderSimpleConfig,
} from "@code-proxy/api-client";
import {
  isRecord,
  normalizeApiKeyEntries,
  normalizeExcludedModels,
  normalizeHeaders,
  normalizeModels,
  normalizeString,
  serializeBedrockKey,
  serializeClineKey,
  serializeGeminiKey,
  serializeOllamaCloudKey,
  serializeOpenAIProvider,
  serializeOpenCodeGoKey,
  serializeProviderKey,
} from "@code-proxy/api-client/endpoints/helpers";
import { normalizeOpenAIBaseUrl } from "./providers-helpers";

export type ProviderImportKind =
  | "gemini"
  | "claude"
  | "codex"
  | "opencode-go"
  | "cline"
  | "ollama-cloud"
  | "vertex"
  | "bedrock"
  | "openai";

type ProviderItemsByKind = {
  gemini: ProviderSimpleConfig[];
  claude: ProviderSimpleConfig[];
  codex: ProviderSimpleConfig[];
  "opencode-go": ProviderSimpleConfig[];
  cline: ProviderSimpleConfig[];
  "ollama-cloud": ProviderSimpleConfig[];
  vertex: ProviderSimpleConfig[];
  bedrock: BedrockProviderConfig[];
  openai: OpenAIProvider[];
};

type CanonicalProviderItem = ProviderSimpleConfig | BedrockProviderConfig | OpenAIProvider;

export type ProviderImportDiff = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  duplicateEntriesRemoved: number;
  hasChanges: boolean;
  addedLabels: string[];
  removedLabels: string[];
  changedLabels: string[];
};

export type ProviderImportPreview<K extends ProviderImportKind> = {
  nextItems: ProviderItemsByKind[K];
  diff: ProviderImportDiff;
};

const sortRecord = (value?: Record<string, string>) => {
  if (!value) return undefined;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const sortExcludedModels = (value: unknown) =>
  normalizeExcludedModels(value)
    ?.slice()
    .sort((left, right) => left.localeCompare(right));

const normalizeModelList = (
  value: unknown,
): { models?: ProviderModel[]; duplicateCount: number } => {
  const list = normalizeModels(value);
  if (!list?.length) return { duplicateCount: 0 };
  const seen = new Set<string>();
  const next: ProviderModel[] = [];
  let duplicateCount = 0;

  list
    .map((model) => {
      const name = normalizeString(model.name) ?? "";
      if (!name) return null;
      const normalized: ProviderModel = {
        name,
        ...(normalizeString(model.alias) && normalizeString(model.alias) !== name
          ? { alias: normalizeString(model.alias)! }
          : {}),
        ...(typeof model.priority === "number" && Number.isFinite(model.priority)
          ? { priority: model.priority }
          : {}),
        ...(normalizeString(model.testModel)
          ? { testModel: normalizeString(model.testModel)! }
          : {}),
      };
      return normalized;
    })
    .filter(Boolean)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    .forEach((model) => {
      const key = JSON.stringify(model);
      if (seen.has(key)) {
        duplicateCount += 1;
        return;
      }
      seen.add(key);
      next.push(model as ProviderModel);
    });

  return { models: next.length ? next : undefined, duplicateCount };
};

const normalizeEntryList = (
  value: unknown,
): { entries?: ProviderApiKeyEntry[]; duplicateCount: number } => {
  const list = normalizeApiKeyEntries(value);
  if (!list?.length) return { duplicateCount: 0 };
  const seen = new Set<string>();
  const next: ProviderApiKeyEntry[] = [];
  let duplicateCount = 0;

  list
    .map((entry) => {
      const apiKey = normalizeString(entry.apiKey) ?? "";
      if (!apiKey) return null;
      const headers = sortRecord(normalizeHeaders(entry.headers));
      return {
        apiKey,
        ...(entry.disabled ? { disabled: true } : {}),
        ...(normalizeString(entry.proxyUrl) ? { proxyUrl: normalizeString(entry.proxyUrl)! } : {}),
        ...(normalizeString(entry.proxyId) ? { proxyId: normalizeString(entry.proxyId)! } : {}),
        ...(headers ? { headers } : {}),
      };
    })
    .filter(Boolean)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    .forEach((entry) => {
      const key = JSON.stringify(entry);
      if (seen.has(key)) {
        duplicateCount += 1;
        return;
      }
      seen.add(key);
      next.push(entry as ProviderApiKeyEntry);
    });

  return { entries: next.length ? next : undefined, duplicateCount };
};

const normalizeSimpleItem = (
  kind: Exclude<ProviderImportKind, "bedrock" | "openai">,
  value: unknown,
): { item: ProviderSimpleConfig | null; duplicateCount: number } => {
  if (!isRecord(value)) return { item: null, duplicateCount: 0 };
  const apiKey = normalizeString(value["api-key"] ?? value.apiKey) ?? "";
  if (!apiKey) return { item: null, duplicateCount: 0 };
  const headers = sortRecord(normalizeHeaders(value.headers));
  const { models, duplicateCount } = normalizeModelList(value.models);
  const usesDynamicModelCatalog = kind === "opencode-go" || kind === "cline";
  const excludedModels = sortExcludedModels(value["excluded-models"] ?? value.excludedModels);
  const baseUrl =
    normalizeString(value["base-url"] ?? value.baseUrl) ??
    (kind === "ollama-cloud" ? "https://ollama.com" : undefined);

  return {
    item: {
      apiKey,
      ...(normalizeString(value.name) ? { name: normalizeString(value.name)! } : {}),
      ...(normalizeString(value.prefix) ? { prefix: normalizeString(value.prefix)! } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(normalizeString(value["proxy-url"] ?? value.proxyUrl)
        ? { proxyUrl: normalizeString(value["proxy-url"] ?? value.proxyUrl)! }
        : {}),
      ...(normalizeString(value["proxy-id"] ?? value.proxyId)
        ? { proxyId: normalizeString(value["proxy-id"] ?? value.proxyId)! }
        : {}),
      ...(headers ? { headers } : {}),
      ...(!usesDynamicModelCatalog && models ? { models } : {}),
      ...(excludedModels ? { excludedModels } : {}),
      ...(kind === "opencode-go" && normalizeString(value["workspace-id"] ?? value.workspaceId)
        ? { workspaceId: normalizeString(value["workspace-id"] ?? value.workspaceId)! }
        : {}),
      ...(kind === "opencode-go" && normalizeString(value["auth-cookie"] ?? value.authCookie)
        ? { authCookie: normalizeString(value["auth-cookie"] ?? value.authCookie)! }
        : {}),
      ...((value["skip-anthropic-processing"] === true || value.skipAnthropicProcessing === true) &&
      kind === "claude"
        ? { skipAnthropicProcessing: true }
        : {}),
    },
    duplicateCount,
  };
};

const normalizeBedrockItem = (
  value: unknown,
): { item: BedrockProviderConfig | null; duplicateCount: number } => {
  if (!isRecord(value)) return { item: null, duplicateCount: 0 };
  const rawMode = normalizeString(value["auth-mode"] ?? value.authMode) ?? "sigv4";
  const authMode =
    rawMode === "apikey" || rawMode === "api_key" || rawMode === "api-key" ? "api-key" : "sigv4";
  const apiKey = normalizeString(value["api-key"] ?? value.apiKey) ?? "";
  const accessKeyId = normalizeString(value["access-key-id"] ?? value.accessKeyId) ?? undefined;
  const credential = authMode === "api-key" ? apiKey : (accessKeyId ?? apiKey);
  if (!credential) return { item: null, duplicateCount: 0 };
  const headers = sortRecord(normalizeHeaders(value.headers));
  const { models, duplicateCount } = normalizeModelList(value.models);

  return {
    item: {
      apiKey: credential,
      authMode,
      ...(normalizeString(value.name) ? { name: normalizeString(value.name)! } : {}),
      ...(normalizeString(value.prefix) ? { prefix: normalizeString(value.prefix)! } : {}),
      ...(normalizeString(value.region) ? { region: normalizeString(value.region)! } : {}),
      ...(value["force-global"] === true || value.forceGlobal === true
        ? { forceGlobal: true }
        : {}),
      ...(normalizeString(value["base-url"] ?? value.baseUrl)
        ? { baseUrl: normalizeString(value["base-url"] ?? value.baseUrl)! }
        : {}),
      ...(normalizeString(value["proxy-url"] ?? value.proxyUrl)
        ? { proxyUrl: normalizeString(value["proxy-url"] ?? value.proxyUrl)! }
        : {}),
      ...(normalizeString(value["proxy-id"] ?? value.proxyId)
        ? { proxyId: normalizeString(value["proxy-id"] ?? value.proxyId)! }
        : {}),
      ...(headers ? { headers } : {}),
      ...(models ? { models } : {}),
      ...(sortExcludedModels(value["excluded-models"] ?? value.excludedModels)
        ? { excludedModels: sortExcludedModels(value["excluded-models"] ?? value.excludedModels) }
        : {}),
      ...(authMode === "sigv4" && accessKeyId ? { accessKeyId } : {}),
      ...(authMode === "sigv4" &&
      normalizeString(value["secret-access-key"] ?? value.secretAccessKey)
        ? {
            secretAccessKey: normalizeString(value["secret-access-key"] ?? value.secretAccessKey)!,
          }
        : {}),
      ...(authMode === "sigv4" && normalizeString(value["session-token"] ?? value.sessionToken)
        ? { sessionToken: normalizeString(value["session-token"] ?? value.sessionToken)! }
        : {}),
    },
    duplicateCount,
  };
};

const normalizeOpenAIItem = (
  value: unknown,
): { item: OpenAIProvider | null; duplicateCount: number } => {
  if (!isRecord(value)) return { item: null, duplicateCount: 0 };
  const name = normalizeString(value.name) ?? "";
  if (!name) return { item: null, duplicateCount: 0 };
  const headers = sortRecord(normalizeHeaders(value.headers));
  const { models, duplicateCount: modelDuplicates } = normalizeModelList(value.models);
  const { entries, duplicateCount: entryDuplicates } = normalizeEntryList(
    value["api-key-entries"] ?? value.apiKeyEntries,
  );

  return {
    item: {
      name,
      ...(value.disabled === true ? { disabled: true } : {}),
      ...(normalizeString(value["base-url"] ?? value.baseUrl)
        ? { baseUrl: normalizeOpenAIBaseUrl(normalizeString(value["base-url"] ?? value.baseUrl)!) }
        : {}),
      ...(normalizeString(value.prefix) ? { prefix: normalizeString(value.prefix)! } : {}),
      ...(headers ? { headers } : {}),
      ...(models ? { models } : {}),
      ...(entries ? { apiKeyEntries: entries } : {}),
      ...(typeof value.priority === "number" && Number.isFinite(value.priority)
        ? { priority: value.priority }
        : {}),
      ...(normalizeString(value["test-model"] ?? value.testModel)
        ? { testModel: normalizeString(value["test-model"] ?? value.testModel)! }
        : {}),
    },
    duplicateCount: modelDuplicates + entryDuplicates,
  };
};

const normalizeItems = <K extends ProviderImportKind>(
  kind: K,
  rawItems: unknown,
): { items: ProviderItemsByKind[K]; duplicateCount: number } => {
  const list = Array.isArray(rawItems) ? rawItems : [];
  const seen = new Set<string>();
  const items: CanonicalProviderItem[] = [];
  let duplicateCount = 0;

  list.forEach((value) => {
    if (kind === "openai") {
      const normalized = normalizeOpenAIItem(value);
      if (!normalized.item) return;
      const key = normalized.item.name.toLowerCase();
      if (seen.has(key)) {
        duplicateCount += 1;
        return;
      }
      seen.add(key);
      duplicateCount += normalized.duplicateCount;
      items.push(normalized.item);
      return;
    }
    if (kind === "bedrock") {
      const normalized = normalizeBedrockItem(value);
      if (!normalized.item) return;
      const key = normalized.item.apiKey.toLowerCase();
      if (seen.has(key)) {
        duplicateCount += 1;
        return;
      }
      seen.add(key);
      duplicateCount += normalized.duplicateCount;
      items.push(normalized.item);
      return;
    }
    const normalized = normalizeSimpleItem(kind, value);
    if (!normalized.item) return;
    const key = normalized.item.apiKey.toLowerCase();
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(key);
    duplicateCount += normalized.duplicateCount;
    items.push(normalized.item);
  });

  items.sort((left, right) => {
    const leftKey =
      "apiKey" in left
        ? (left.name?.toLowerCase() ?? left.apiKey.toLowerCase())
        : left.name.toLowerCase();
    const rightKey =
      "apiKey" in right
        ? (right.name?.toLowerCase() ?? right.apiKey.toLowerCase())
        : right.name.toLowerCase();
    return leftKey.localeCompare(rightKey);
  });

  return { items: items as ProviderItemsByKind[K], duplicateCount };
};

const serializeItem = (kind: ProviderImportKind, item: CanonicalProviderItem) => {
  switch (kind) {
    case "gemini":
      return serializeGeminiKey(item as ProviderSimpleConfig);
    case "cline":
      return serializeClineKey(item as ProviderSimpleConfig);
    case "claude":
    case "codex":
    case "vertex":
      return serializeProviderKey(item as ProviderSimpleConfig);
    case "ollama-cloud":
      return serializeOllamaCloudKey(item as ProviderSimpleConfig);
    case "opencode-go":
      return serializeOpenCodeGoKey(item as ProviderSimpleConfig);
    case "bedrock":
      return serializeBedrockKey(item as BedrockProviderConfig);
    case "openai":
      return serializeOpenAIProvider(item as OpenAIProvider);
  }
};

const readEnvelope = (raw: unknown): { provider?: string; items: unknown } => {
  if (Array.isArray(raw)) return { items: raw };
  if (!isRecord(raw)) return { items: [] };
  return {
    provider: normalizeString(raw.provider) ?? undefined,
    items: raw.items ?? raw.data ?? [],
  };
};

const getItemKey = (kind: ProviderImportKind, item: CanonicalProviderItem) =>
  kind === "openai"
    ? (item as OpenAIProvider).name.toLowerCase()
    : (item as ProviderSimpleConfig).apiKey.toLowerCase();

const getItemLabel = (kind: ProviderImportKind, item: CanonicalProviderItem) =>
  kind === "openai"
    ? (item as OpenAIProvider).name
    : (item as ProviderSimpleConfig).name || (item as ProviderSimpleConfig).apiKey;

export const createProviderExportText = <K extends ProviderImportKind>(
  kind: K,
  items: ProviderItemsByKind[K],
) => {
  const normalized = normalizeItems(kind, items);
  return JSON.stringify(
    {
      provider: kind,
      version: 1,
      items: normalized.items.map((item) => serializeItem(kind, item)),
    },
    null,
    2,
  );
};

export const prepareProviderImport = <K extends ProviderImportKind>(
  kind: K,
  rawText: string,
  currentItems: ProviderItemsByKind[K],
): ProviderImportPreview<K> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("invalid_json");
  }

  const envelope = readEnvelope(parsed);
  if (envelope.provider && envelope.provider !== kind) {
    throw new Error("provider_mismatch");
  }

  const next = normalizeItems(kind, envelope.items);
  const current = normalizeItems(kind, currentItems);
  const currentMap = new Map(
    current.items.map((item) => [
      getItemKey(kind, item),
      JSON.stringify(serializeItem(kind, item)),
    ]),
  );
  const nextMap = new Map(
    next.items.map((item) => [getItemKey(kind, item), JSON.stringify(serializeItem(kind, item))]),
  );

  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  const addedLabels: string[] = [];
  const removedLabels: string[] = [];
  const changedLabels: string[] = [];

  next.items.forEach((item) => {
    const key = getItemKey(kind, item);
    const currentValue = currentMap.get(key);
    const nextValue = nextMap.get(key);
    if (!currentValue) {
      added += 1;
      addedLabels.push(getItemLabel(kind, item));
      return;
    }
    if (currentValue !== nextValue) {
      changed += 1;
      changedLabels.push(getItemLabel(kind, item));
      return;
    }
    unchanged += 1;
  });

  current.items.forEach((item) => {
    const key = getItemKey(kind, item);
    if (!nextMap.has(key)) {
      removed += 1;
      removedLabels.push(getItemLabel(kind, item));
    }
  });

  return {
    nextItems: next.items,
    diff: {
      added,
      removed,
      changed,
      unchanged,
      duplicateEntriesRemoved: next.duplicateCount,
      hasChanges:
        added > 0 || removed > 0 || changed > 0 || current.items.length !== next.items.length,
      addedLabels,
      removedLabels,
      changedLabels,
    },
  };
};
