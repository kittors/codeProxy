import type {
  BedrockProviderConfig,
  OpenAIProvider,
  ProviderApiKeyEntry,
  ProviderModel,
  ProviderSimpleConfig,
} from "@code-proxy/api-client";
import { readRawRecord, withRawRecord } from "@code-proxy/api-client";
import {
  isRecord,
  normalizeApiKeyEntries,
  normalizeExcludedModels,
  normalizeHeaders,
  normalizeModels,
  normalizeString,
  serializeBedrockKey,
  serializeClineKey,
  serializeCommandCodeKey,
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
  | "commandcode"
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
  commandcode: ProviderSimpleConfig[];
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

const normalizeModelAccessExcludedModels = (value: unknown) =>
  normalizeExcludedModels(value)?.some((model) => model === "*") ? ["*"] : undefined;

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
        ...(normalizeString(entry.id) ? { id: normalizeString(entry.id)! } : {}),
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

// 导出文件里写的是 disable-cooling，手写的 JSON 也可能用 camelCase。不写就是跟随全局设置。
const readCoolingOverride = (value: Record<string, unknown>): { disableCooling?: boolean } => {
  const raw = value["disable-cooling"] ?? value.disableCooling;
  return typeof raw === "boolean" ? { disableCooling: raw } : {};
};

const normalizeSimpleItem = (
  kind: Exclude<ProviderImportKind, "bedrock" | "openai">,
  value: unknown,
): { item: ProviderSimpleConfig | null; duplicateCount: number } => {
  if (!isRecord(value)) return { item: null, duplicateCount: 0 };
  const apiKey = normalizeString(value["api-key"] ?? value.apiKey) ?? "";
  if (!apiKey) return { item: null, duplicateCount: 0 };
  const headers = sortRecord(normalizeHeaders(value.headers));
  const hasDynamicModelAccess =
    kind === "opencode-go" ||
    kind === "cline" ||
    kind === "ollama-cloud" ||
    kind === "commandcode";
  const { models, duplicateCount } = hasDynamicModelAccess
    ? { models: undefined, duplicateCount: 0 }
    : normalizeModelList(value.models);
  const excludedModels = hasDynamicModelAccess
    ? normalizeModelAccessExcludedModels(value["excluded-models"] ?? value.excludedModels)
    : sortExcludedModels(value["excluded-models"] ?? value.excludedModels);
  const baseUrl =
    normalizeString(value["base-url"] ?? value.baseUrl) ??
    (kind === "ollama-cloud"
      ? "https://ollama.com"
      : kind === "commandcode"
        ? "https://api.commandcode.ai/provider/v1"
        : undefined);

  return {
    item: {
      ...(normalizeString(value.id) ? { id: normalizeString(value.id)! } : {}),
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
      ...(models ? { models } : {}),
      ...(excludedModels ? { excludedModels } : {}),
      ...(hasDynamicModelAccess &&
      normalizeString(value["vision-fallback-model"] ?? value.visionFallbackModel)
        ? {
            visionFallbackModel: normalizeString(
              value["vision-fallback-model"] ?? value.visionFallbackModel,
            )!,
          }
        : {}),
      ...((kind === "cline" || kind === "ollama-cloud") &&
      normalizeString(value["auth-cookie"] ?? value.authCookie)
        ? { authCookie: normalizeString(value["auth-cookie"] ?? value.authCookie)! }
        : {}),
      ...((value["skip-anthropic-processing"] === true || value.skipAnthropicProcessing === true) &&
      kind === "claude"
        ? { skipAnthropicProcessing: true }
        : {}),
      ...readCoolingOverride(value),
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
      ...(normalizeString(value.id) ? { id: normalizeString(value.id)! } : {}),
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
      ...readCoolingOverride(value),
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
      ...(normalizeString(value.id) ? { id: normalizeString(value.id)! } : {}),
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
      ...readCoolingOverride(value),
    },
    duplicateCount: modelDuplicates + entryDuplicates,
  };
};

// 导出文件和导入文件都不带这两个键，哪怕后端记录里还留着：OpenCode Go 的用量早改成走 API Key，
// 面板不再接触 dashboard 会话，旧导出文件里的这两个键不能再被导回去。
// （Cline / Ollama Cloud 的 auth-cookie 是建模字段，走 authCookie 写出，不经过这里。）
const RETIRED_FILE_KEYS = new Set(["workspace-id", "auth-cookie"]);

// "state"：面板内存里的条目，带着 getter 挂上的后端原始记录；"file"：导入文件里的条目，本身就是线上格式的记录。
type ItemSource = "state" | "file";

/**
 * 条目对应的后端记录。面板没建模的字段（priority、cloak、alpha-search……）靠它走完
 * 导出 → 导入 → 保存：序列化时 serializer 以它为底，导出文件里有这些字段，导入后整表保存也不会丢。
 */
const backendRecordOf = (value: unknown, source: ItemSource) => {
  const record = source === "state" ? readRawRecord(value) : isRecord(value) ? value : undefined;
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).filter(([key]) => !RETIRED_FILE_KEYS.has(key)));
};

const normalizeItems = <K extends ProviderImportKind>(
  kind: K,
  rawItems: unknown,
  source: ItemSource,
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
      items.push(withRawRecord(backendRecordOf(value, source), normalized.item));
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
      items.push(withRawRecord(backendRecordOf(value, source), normalized.item));
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
    items.push(withRawRecord(backendRecordOf(value, source), normalized.item));
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
    case "commandcode":
      return serializeCommandCodeKey(item as ProviderSimpleConfig);
    case "opencode-go":
      return serializeOpenCodeGoKey(item as ProviderSimpleConfig);
    case "bedrock":
      return serializeBedrockKey(item as BedrockProviderConfig);
    case "openai":
      return serializeOpenAIProvider(item as OpenAIProvider);
  }
};

// 比较两条记录是否相同用的序列化：键按字母序排。面板没建模的字段原样跟在记录后面，
// 它们的先后取决于后端或导入文件的写法，「内容相同」不该因此被判成「有改动」。
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : inner,
  );

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
  const normalized = normalizeItems(kind, items, "state");
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

  const next = normalizeItems(kind, envelope.items, "file");
  const current = normalizeItems(kind, currentItems, "state");
  const currentMap = new Map(
    current.items.map((item) => [
      getItemKey(kind, item),
      canonicalJson(serializeItem(kind, item)),
    ]),
  );
  const nextMap = new Map(
    next.items.map((item) => [getItemKey(kind, item), canonicalJson(serializeItem(kind, item))]),
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
