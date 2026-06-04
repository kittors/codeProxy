import { authFilesApi, providersApi } from "@/lib/http/apis";
import { apiClient } from "@/lib/http/client";
import type {
  AuthFileItem,
  OpenAIProvider,
  ProviderModel,
  ProviderSimpleConfig,
} from "@/lib/http/types";
import {
  matchesModelPattern,
  normalizeProviderKey,
  readAuthFilesModelOwnerGroupMap,
  resolveFileType,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import {
  getConfiguredAvailabilityCacheVersion,
  invalidateConfiguredModelAvailability,
} from "@/modules/models/configuredAvailabilityCache";

export type ModelAvailabilityItem = {
  id: string;
  owned_by?: string;
  description?: string;
  source?: string;
  enabled?: boolean;
  pricing?: ModelPricing;
  inputModalities?: string[];
  outputModalities?: string[];
  supportsVision?: boolean;
};

export type ConfiguredModelAvailability = {
  scoped: boolean;
  items: ModelAvailabilityItem[];
  idSet: Set<string>;
  metadataItems?: ModelAvailabilityItem[];
};

export type ModelPricingMode = "token" | "call";

export interface ModelPricing {
  mode: ModelPricingMode;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedPricePerMillion: number;
  cacheReadPricePerMillion: number;
  cacheWritePricePerMillion: number;
  pricePerCall: number;
}

export interface ModelConfigMetadataItem {
  id: string;
  owned_by: string;
  description: string;
  enabled: boolean;
  source: string;
  pricing: ModelPricing;
  inputModalities: string[];
  outputModalities: string[];
  supportsVision: boolean;
}

export interface ModelPathItem {
  scope: string;
  label: string;
  method: string;
  path: string;
  family: string;
}

export interface ModelPathAvailabilityItem {
  id: string;
  owned_by?: string;
  kind: string;
  alias: boolean;
  paths: ModelPathItem[];
}

export interface ModelPathRouteCapability {
  label: string;
  method: string;
  path: string;
  family: string;
}

export interface ModelPathRouteItem {
  label: string;
  path: string;
  group?: string;
  system: boolean;
  readOnly: boolean;
  capabilities: ModelPathRouteCapability[];
}

export interface ModelPathAvailability {
  items: ModelPathAvailabilityItem[];
  routes: ModelPathRouteItem[];
  idSet: Set<string>;
}

type ModelDefinition = {
  id: string;
  display_name?: string;
  owned_by?: string;
};

const PROVIDER_CHANNELS = [
  { key: "gemini", load: providersApi.getGeminiKeys },
  { key: "claude", load: providersApi.getClaudeConfigs },
  { key: "codex", load: providersApi.getCodexConfigs },
  { key: "opencode-go", load: providersApi.getOpenCodeGoConfigs },
  { key: "vertex", load: providersApi.getVertexConfigs },
] as const;

const emptyAvailability = (): ConfiguredModelAvailability => ({
  scoped: false,
  items: [],
  idSet: new Set(),
});

export const emptyModelPricing = (): ModelPricing => ({
  mode: "token",
  inputPricePerMillion: 0,
  outputPricePerMillion: 0,
  cachedPricePerMillion: 0,
  cacheReadPricePerMillion: 0,
  cacheWritePricePerMillion: 0,
  pricePerCall: 0,
});

const normalizeOwnerValue = (value: string): string =>
  value.trim().replace(/\s+/g, "-").toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
};

export const normalizeModelPricing = (raw: Record<string, unknown>): ModelPricing => {
  const pricing = isRecord(raw.pricing) ? raw.pricing : {};
  const mode: ModelPricingMode =
    pricing.mode === "call" || raw.pricing_mode === "call" ? "call" : "token";

  return {
    mode,
    inputPricePerMillion: asNumber(pricing.input_price_per_million ?? pricing.prompt),
    outputPricePerMillion: asNumber(pricing.output_price_per_million ?? pricing.completion),
    cachedPricePerMillion: asNumber(pricing.cached_price_per_million ?? pricing.cache),
    cacheReadPricePerMillion: asNumber(pricing.cache_read_price_per_million ?? pricing.cacheRead),
    cacheWritePricePerMillion: asNumber(pricing.cache_write_price_per_million ?? pricing.cacheWrite),
    pricePerCall: asNumber(pricing.price_per_call ?? pricing.perCall),
  };
};

export const normalizeModelModalities = (raw: unknown): string[] => {
  let values: unknown[] = [];
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        values = Array.isArray(parsed) ? parsed : [];
      } catch {
        values = [];
      }
    } else {
      values = trimmed.split(/[,+|/\s]+/);
    }
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const modality = String(value ?? "")
      .trim()
      .toLowerCase();
    if (!modality || seen.has(modality)) continue;
    seen.add(modality);
    normalized.push(modality);
  }
  return normalized;
};

const normalizeModelSupportsVision = (
  raw: Record<string, unknown>,
  inputModalities: string[],
): boolean => {
  const explicit = raw.supports_vision ?? raw.supportsVision;
  if (typeof explicit === "boolean") return explicit;
  if (typeof explicit === "string") {
    const value = explicit.trim().toLowerCase();
    if (["true", "1", "yes"].includes(value)) return true;
    if (["false", "0", "no"].includes(value)) return false;
  }
  return inputModalities.includes("image");
};

export const normalizeModelConfigMetadata = (item: unknown): ModelConfigMetadataItem | null => {
  if (!isRecord(item)) return null;
  const id = String(item.id ?? item.model_id ?? item.name ?? "").trim();
  if (!id) return null;
  const inputModalities = normalizeModelModalities(item.input_modalities ?? item.inputModalities);
  const outputModalities = normalizeModelModalities(
    item.output_modalities ?? item.outputModalities,
  );
  return {
    id,
    owned_by: String(item.owned_by ?? item.owner ?? ""),
    description: String(item.description ?? item.display_name ?? ""),
    enabled: item.enabled === false ? false : true,
    source: String(item.source ?? ""),
    pricing: normalizeModelPricing(item),
    inputModalities,
    outputModalities,
    supportsVision: normalizeModelSupportsVision(item, inputModalities),
  };
};

export const normalizeModelConfigMetadataRows = (payload: unknown): ModelConfigMetadataItem[] => {
  const record = isRecord(payload) ? payload : {};
  const rawList = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : Array.isArray(payload)
        ? payload
        : [];

  return rawList
    .map((item) => normalizeModelConfigMetadata(item))
    .filter((item): item is ModelConfigMetadataItem => Boolean(item))
    .sort((a, b) => a.id.localeCompare(b.id));
};

const normalizeModelPath = (item: unknown): ModelPathItem | null => {
  if (!isRecord(item)) return null;
  const method = String(item.method ?? "")
    .trim()
    .toUpperCase();
  const path = String(item.path ?? "").trim();
  if (!method || !path) return null;
  return {
    scope: String(item.scope ?? ""),
    label: String(item.label ?? ""),
    method,
    path,
    family: String(item.family ?? ""),
  };
};

const normalizeModelPathCapability = (item: unknown): ModelPathRouteCapability | null => {
  const normalized = normalizeModelPath(item);
  if (!normalized) return null;
  return {
    label: normalized.label,
    method: normalized.method,
    path: normalized.path,
    family: normalized.family,
  };
};

const normalizeModelPathAvailabilityItem = (item: unknown): ModelPathAvailabilityItem | null => {
  if (!isRecord(item)) return null;
  const id = String(item.id ?? "").trim();
  if (!id) return null;
  const paths = Array.isArray(item.paths)
    ? item.paths
        .map((path) => normalizeModelPath(path))
        .filter((path): path is ModelPathItem => Boolean(path))
    : [];
  return {
    id,
    owned_by: String(item.owned_by ?? ""),
    kind: String(item.kind ?? "canonical"),
    alias: item.alias === true,
    paths,
  };
};

const normalizeModelPathRouteItem = (route: unknown): ModelPathRouteItem | null => {
  if (!isRecord(route)) return null;
  const path = String(route.path ?? "").trim();
  if (!path) return null;
  const capabilities = Array.isArray(route.capabilities)
    ? route.capabilities
        .map((capability) => normalizeModelPathCapability(capability))
        .filter((capability): capability is ModelPathRouteCapability => Boolean(capability))
    : [];
  return {
    label: String(route.label ?? ""),
    path,
    group: String(route.group ?? ""),
    system: route.system === true,
    readOnly: route.read_only === true || route.readOnly === true,
    capabilities,
  };
};

export const normalizeModelPathAvailability = (payload: unknown): ModelPathAvailability => {
  const record = isRecord(payload) ? payload : {};
  const rawItems = Array.isArray(record.data) ? record.data : Array.isArray(payload) ? payload : [];
  const items = rawItems
    .map((item) => normalizeModelPathAvailabilityItem(item))
    .filter((item): item is ModelPathAvailabilityItem => Boolean(item))
    .sort((a, b) => a.id.localeCompare(b.id));

  const rawRoutes = Array.isArray(record.routes) ? record.routes : [];
  const routes = rawRoutes
    .map((route) => normalizeModelPathRouteItem(route))
    .filter((route): route is ModelPathRouteItem => Boolean(route));

  return {
    items,
    routes,
    idSet: new Set(items.map((item) => item.id.toLowerCase())),
  };
};

const normalizeModelConfigRows = (payload: unknown): ModelAvailabilityItem[] =>
  normalizeModelConfigMetadataRows(payload);

const addModel = (
  map: Map<string, ModelAvailabilityItem>,
  item: ModelAvailabilityItem | null | undefined,
) => {
  const id = String(item?.id ?? "").trim();
  if (!id) return;
  const key = id.toLowerCase();
  if (map.has(key)) return;
  map.set(key, { ...item, id });
};

const buildLibraryModelIndex = (
  models: ModelAvailabilityItem[],
): Map<string, ModelAvailabilityItem> =>
  new Map(models.map((model) => [model.id.toLowerCase(), model]));

const withLibraryModelMetadata = (
  item: ModelAvailabilityItem,
  libraryIndex: Map<string, ModelAvailabilityItem>,
): ModelAvailabilityItem => {
  const libraryModel = libraryIndex.get(item.id.toLowerCase());
  if (!libraryModel) return item;
  return {
    ...libraryModel,
    ...item,
    owned_by: item.owned_by || libraryModel.owned_by,
    description: item.description || libraryModel.description,
    pricing: item.pricing ?? libraryModel.pricing,
    inputModalities: item.inputModalities ?? libraryModel.inputModalities,
    outputModalities: item.outputModalities ?? libraryModel.outputModalities,
    supportsVision: item.supportsVision ?? libraryModel.supportsVision,
  };
};

const withOptionalPrefix = (id: string, prefix?: string): string[] => {
  const trimmedId = id.trim();
  const trimmedPrefix = String(prefix ?? "").trim();
  if (!trimmedId) return [];
  if (!trimmedPrefix) return [trimmedId];
  return [trimmedId, `${trimmedPrefix}/${trimmedId}`];
};

const providerModelId = (model: ProviderModel): string => {
  const alias = String(model.alias ?? "").trim();
  if (alias) return alias;
  return String(model.name ?? "").trim();
};

const isExcluded = (modelId: string, excludedModels?: string[]) => {
  if (!Array.isArray(excludedModels) || excludedModels.length === 0) return false;
  return excludedModels.some((pattern) => matchesModelPattern(modelId, pattern));
};

const addExplicitProviderModels = (
  map: Map<string, ModelAvailabilityItem>,
  models: ProviderModel[] | undefined,
  provider: string,
  prefix?: string,
  excludedModels?: string[],
) => {
  if (!Array.isArray(models) || models.length === 0) return;
  for (const model of models) {
    const id = providerModelId(model);
    if (!id || isExcluded(id, excludedModels)) continue;
    for (const candidate of withOptionalPrefix(id, prefix)) {
      addModel(map, {
        id: candidate,
        owned_by: provider,
        source: "provider",
      });
    }
  }
};

const addStaticProviderModels = (
  map: Map<string, ModelAvailabilityItem>,
  models: ModelDefinition[],
  provider: string,
  prefix?: string,
  excludedModels?: string[],
) => {
  for (const model of models) {
    const id = String(model.id ?? "").trim();
    if (!id || isExcluded(id, excludedModels)) continue;
    for (const candidate of withOptionalPrefix(id, prefix)) {
      addModel(map, {
        id: candidate,
        owned_by: model.owned_by || provider,
        description: model.display_name,
        source: "provider",
      });
    }
  }
};

const hasCredential = (config: ProviderSimpleConfig): boolean =>
  String(config.apiKey ?? "").trim().length > 0;

const hasOpenAIProviderCredential = (provider: OpenAIProvider): boolean =>
  Array.isArray(provider.apiKeyEntries) &&
  provider.apiKeyEntries.some((entry) => String(entry.apiKey ?? "").trim());

const loadStaticDefinitions = async (provider: string): Promise<ModelDefinition[]> => {
  try {
    return await authFilesApi.getModelDefinitions(provider);
  } catch {
    return [];
  }
};

const loadProviderModelItems = async (): Promise<ModelAvailabilityItem[]> => {
  const map = new Map<string, ModelAvailabilityItem>();

  await Promise.all(
    PROVIDER_CHANNELS.map(async ({ key, load }) => {
      let configs: ProviderSimpleConfig[] = [];
      try {
        configs = (await load()).filter(hasCredential);
      } catch {
        configs = [];
      }

      const needsStaticModels = configs.some(
        (config) => !Array.isArray(config.models) || config.models.length === 0,
      );
      const staticModels = needsStaticModels ? await loadStaticDefinitions(key) : [];

      for (const config of configs) {
        if (Array.isArray(config.models) && config.models.length > 0) {
          addExplicitProviderModels(map, config.models, key, config.prefix, config.excludedModels);
          continue;
        }
        addStaticProviderModels(map, staticModels, key, config.prefix, config.excludedModels);
      }
    }),
  );

  let openAIProviders: OpenAIProvider[] = [];
  try {
    openAIProviders = (await providersApi.getOpenAIProviders()).filter(hasOpenAIProviderCredential);
  } catch {
    openAIProviders = [];
  }

  for (const provider of openAIProviders) {
    addExplicitProviderModels(map, provider.models, provider.name, provider.prefix);
  }

  return Array.from(map.values());
};

const loadAuthFiles = async (): Promise<AuthFileItem[]> => {
  try {
    const payload = await authFilesApi.list();
    return Array.isArray(payload.files) ? payload.files : [];
  } catch {
    return [];
  }
};

const authFileDisabled = (file: AuthFileItem): boolean => {
  const value = file.disabled;
  return value === true || String(value ?? "").toLowerCase() === "true";
};

const loadAuthFileModelItems = async (
  authFiles: AuthFileItem[],
  libraryModels: ModelAvailabilityItem[],
): Promise<{ items: ModelAvailabilityItem[]; scoped: boolean }> => {
  const map = new Map<string, ModelAvailabilityItem>();
  const libraryIndex = buildLibraryModelIndex(libraryModels);
  const ownerByAuthGroup = readAuthFilesModelOwnerGroupMap();
  const modelsByOwner = new Map<string, ModelAvailabilityItem[]>();
  const activeAuthFiles = authFiles.filter((file) => !authFileDisabled(file));
  let scoped = authFiles.length > 0 && activeAuthFiles.length === 0;

  for (const model of libraryModels) {
    const owner = normalizeOwnerValue(model.owned_by ?? "");
    if (!owner) continue;
    const list = modelsByOwner.get(owner) ?? [];
    list.push(model);
    modelsByOwner.set(owner, list);
  }

  await Promise.all(
    activeAuthFiles.map(async (file) => {
      const group = normalizeProviderKey(resolveFileType(file));
      const owner = normalizeOwnerValue(ownerByAuthGroup[group] ?? "");
      if (owner) {
        scoped = true;
        for (const model of modelsByOwner.get(owner) ?? []) {
          addModel(map, { ...model, source: model.source || "auth-file-owner" });
        }
        return;
      }

      try {
        const liveModels = await authFilesApi.getModelsForAuthFile(file.name);
        scoped = true;
        for (const model of liveModels) {
          addModel(
            map,
            withLibraryModelMetadata(
              {
                id: model.id,
                owned_by: model.owned_by,
                description: model.display_name,
                source: "auth-file",
              },
              libraryIndex,
            ),
          );
        }
      } catch {
        // Older backends may not expose per-file model lookup. Keep the caller on its fallback path.
      }
    }),
  );

  return { items: Array.from(map.values()), scoped };
};

/* ── New backend aggregation endpoint support ── */

const normalizeAvailabilityItem = (raw: unknown): ModelAvailabilityItem | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = String(record.id ?? "").trim();
  if (!id) return null;

  const pricingRecord = record.pricing && typeof record.pricing === "object" ? (record.pricing as Record<string, unknown>) : {};
  const pricing: ModelPricing = {
    mode: String(pricingRecord.mode ?? "token") === "call" ? "call" : "token",
    inputPricePerMillion: asNumber(pricingRecord.input_price_per_million ?? pricingRecord.inputPricePerMillion),
    outputPricePerMillion: asNumber(pricingRecord.output_price_per_million ?? pricingRecord.outputPricePerMillion),
    cachedPricePerMillion: asNumber(pricingRecord.cached_price_per_million ?? pricingRecord.cachedPricePerMillion),
    cacheReadPricePerMillion: asNumber(pricingRecord.cache_read_price_per_million ?? pricingRecord.cacheReadPricePerMillion),
    cacheWritePricePerMillion: asNumber(pricingRecord.cache_write_price_per_million ?? pricingRecord.cacheWritePricePerMillion),
    pricePerCall: asNumber(pricingRecord.price_per_call ?? pricingRecord.pricePerCall),
  };

  const inputModalities = Array.isArray(record.input_modalities) ? (record.input_modalities as string[]) : [];
  const outputModalities = Array.isArray(record.output_modalities) ? (record.output_modalities as string[]) : [];
  const supportsVision = record.supports_vision === true || inputModalities.some((m: string) => ["image", "vision"].includes(m.toLowerCase()));

  return {
    id,
    owned_by: String(record.owned_by ?? ""),
    description: String(record.description ?? ""),
    source: String(record.source ?? record.metadata_source ?? ""),
    enabled: record.enabled !== false,
    pricing,
    inputModalities,
    outputModalities,
    supportsVision,
  };
};

export const normalizeConfiguredModelAvailability = (payload: unknown): ConfiguredModelAvailability => {
  const record = isRecord(payload) ? payload : {};
  const rawItems = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : Array.isArray(record.items)
        ? record.items
        : [];
  const items = rawItems
    .map((item) => normalizeAvailabilityItem(item))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a!.id.localeCompare(b!.id));

  const rawMetadata = Array.isArray(record.active_metadata) ? record.active_metadata : [];
  const metadataItems = rawMetadata
    .map((item) => normalizeAvailabilityItem(item))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a!.id.localeCompare(b!.id));

  return {
    scoped: typeof record.scoped === "boolean" ? record.scoped : items.length > 0,
    items,
    metadataItems,
    idSet: new Set(items.map((item) => item.id.toLowerCase())),
  };
};

/* ── In-flight/TTL cache ── */

const CONFIGURED_AVAILABILITY_TTL_MS = 15_000;
let configuredAvailabilityCache:
  | { expiresAt: number; version: number; value: ConfiguredModelAvailability }
  | null = null;
let configuredAvailabilityInFlight:
  | { version: number; promise: Promise<ConfiguredModelAvailability> }
  | null = null;

interface GroupAvailabilityCacheEntry {
  expiresAt: number;
  cacheVersion: number;
  promise: Promise<ConfiguredModelAvailability>;
}

const GROUP_AVAILABILITY_TTL_MS = 15_000;
const groupAvailabilityCache = new Map<string, GroupAvailabilityCacheEntry>();

export { invalidateConfiguredModelAvailability };

export const loadConfiguredModelAvailability = async (
  options?: { allowedChannelGroups?: string[] },
): Promise<ConfiguredModelAvailability> => {
  const validGroups = (options?.allowedChannelGroups ?? [])
    .map((g) => String(g ?? "").trim())
    .filter(Boolean);

  if (validGroups.length > 0) {
    const cacheKey = validGroups.join(",");
    const now = Date.now();
    const cacheVersion = getConfiguredAvailabilityCacheVersion();
    const cached = groupAvailabilityCache.get(cacheKey);
    if (cached && cached.cacheVersion === cacheVersion && now < cached.expiresAt) {
      return cached.promise;
    }
    const promise = (async (): Promise<ConfiguredModelAvailability> => {
      try {
        const result = normalizeConfiguredModelAvailability(
          await apiClient.get(
            `/models/configured-availability?allowed_channel_groups=${encodeURIComponent(cacheKey)}`,
          ),
        );
        groupAvailabilityCache.set(cacheKey, {
          expiresAt: now + GROUP_AVAILABILITY_TTL_MS,
          cacheVersion,
          promise: Promise.resolve(result),
        });
        return result;
      } catch {
        return loadConfiguredModelAvailabilityFallback();
      }
    })();
    groupAvailabilityCache.set(cacheKey, { expiresAt: now + GROUP_AVAILABILITY_TTL_MS, cacheVersion, promise });
    return promise;
  }

  const now = Date.now();
  const cacheVersion = getConfiguredAvailabilityCacheVersion();
  if (
    configuredAvailabilityCache &&
    configuredAvailabilityCache.version === cacheVersion &&
    now < configuredAvailabilityCache.expiresAt
  ) {
    return configuredAvailabilityCache.value;
  }
  if (
    configuredAvailabilityInFlight &&
    configuredAvailabilityInFlight.version === cacheVersion
  ) {
    return configuredAvailabilityInFlight.promise;
  }

  const promise = (async (): Promise<ConfiguredModelAvailability> => {
    try {
      const result = normalizeConfiguredModelAvailability(
        await apiClient.get("/models/configured-availability"),
      );
      configuredAvailabilityCache = {
        expiresAt: now + CONFIGURED_AVAILABILITY_TTL_MS,
        version: cacheVersion,
        value: result,
      };
      return result;
    } catch {
      // Fallback to old multi-API aggregation for backward compatibility.
      return loadConfiguredModelAvailabilityFallback();
    }
  })();
  configuredAvailabilityInFlight = { version: cacheVersion, promise };

  try {
    return await promise;
  } finally {
    if (configuredAvailabilityInFlight?.promise === promise) {
      configuredAvailabilityInFlight = null;
    }
  }
};

const loadConfiguredModelAvailabilityFallback = async (): Promise<ConfiguredModelAvailability> => {
  const [authFiles, libraryPayload, providerItems] = await Promise.all([
    loadAuthFiles(),
    apiClient.get("/model-configs?scope=library").catch(() => null),
    loadProviderModelItems(),
  ]);
  const libraryModels = normalizeModelConfigRows(libraryPayload);
  const authFileAvailability = await loadAuthFileModelItems(authFiles, libraryModels);
  const libraryIndex = buildLibraryModelIndex(libraryModels);

  const map = new Map<string, ModelAvailabilityItem>();
  for (const item of authFileAvailability.items) addModel(map, item);
  for (const item of providerItems) addModel(map, withLibraryModelMetadata(item, libraryIndex));

  if (!authFileAvailability.scoped && providerItems.length === 0) {
    return emptyAvailability();
  }

  const items = Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  return {
    scoped: true,
    items,
    idSet: new Set(items.map((item) => item.id.toLowerCase())),
  };
};

export const loadModelPathAvailability = async (): Promise<ModelPathAvailability> =>
  normalizeModelPathAvailability(await apiClient.get("/model-path-availability"));

export const filterByConfiguredModelAvailability = <T extends { id: string }>(
  models: T[],
  availability: ConfiguredModelAvailability,
): T[] => {
  if (!availability.scoped) return models;
  return models.filter((model) => availability.idSet.has(model.id.toLowerCase()));
};

export const hasModelPricing = (pricing: ModelPricing): boolean => {
  if (pricing.mode === "call") return pricing.pricePerCall > 0;
  return (
    pricing.inputPricePerMillion > 0 ||
    pricing.outputPricePerMillion > 0 ||
    pricing.cachedPricePerMillion > 0 ||
    pricing.cacheReadPricePerMillion > 0 ||
    pricing.cacheWritePricePerMillion > 0
  );
};

export const formatModelPriceAmount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(rounded);
};

export const formatModelPrice = (pricing: ModelPricing, notPricedLabel: string): string => {
  if (pricing.mode === "call") {
    return pricing.pricePerCall > 0
      ? `$${formatModelPriceAmount(pricing.pricePerCall)} / call`
      : notPricedLabel;
  }

  if (!hasModelPricing(pricing)) return notPricedLabel;
  const parts = [
    `$${formatModelPriceAmount(pricing.inputPricePerMillion)}`,
    `$${formatModelPriceAmount(pricing.outputPricePerMillion)}`,
  ];
  if (pricing.cacheReadPricePerMillion > 0 || pricing.cachedPricePerMillion > 0) {
    const readPrice = pricing.cacheReadPricePerMillion > 0 ? pricing.cacheReadPricePerMillion : pricing.cachedPricePerMillion;
    parts.push(`Read $${formatModelPriceAmount(readPrice)}`);
  }
  if (pricing.cacheWritePricePerMillion > 0) {
    parts.push(`Write $${formatModelPriceAmount(pricing.cacheWritePricePerMillion)}`);
  }
  return parts.join(" / ");
};
