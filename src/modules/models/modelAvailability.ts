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

export type ModelAvailabilityItem = {
  id: string;
  owned_by?: string;
  description?: string;
  source?: string;
  enabled?: boolean;
  pricing?: ModelPricing;
};

export type ConfiguredModelAvailability = {
  scoped: boolean;
  items: ModelAvailabilityItem[];
  idSet: Set<string>;
};

export type ModelPricingMode = "token" | "call";

export interface ModelPricing {
  mode: ModelPricingMode;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedPricePerMillion: number;
  pricePerCall: number;
}

export interface ModelConfigMetadataItem {
  id: string;
  owned_by: string;
  description: string;
  enabled: boolean;
  source: string;
  pricing: ModelPricing;
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
    pricePerCall: asNumber(pricing.price_per_call ?? pricing.perCall),
  };
};

export const normalizeModelConfigMetadata = (item: unknown): ModelConfigMetadataItem | null => {
  if (!isRecord(item)) return null;
  const id = String(item.id ?? item.model_id ?? item.name ?? "").trim();
  if (!id) return null;
  return {
    id,
    owned_by: String(item.owned_by ?? item.owner ?? ""),
    description: String(item.description ?? item.display_name ?? ""),
    enabled: item.enabled === false ? false : true,
    source: String(item.source ?? ""),
    pricing: normalizeModelPricing(item),
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
          addModel(map, {
            id: model.id,
            owned_by: model.owned_by,
            description: model.display_name,
            source: "auth-file",
          });
        }
      } catch {
        // Older backends may not expose per-file model lookup. Keep the caller on its fallback path.
      }
    }),
  );

  return { items: Array.from(map.values()), scoped };
};

export const loadConfiguredModelAvailability = async (): Promise<ConfiguredModelAvailability> => {
  const [authFiles, libraryPayload, providerItems] = await Promise.all([
    loadAuthFiles(),
    apiClient.get("/model-configs?scope=library").catch(() => null),
    loadProviderModelItems(),
  ]);
  const libraryModels = normalizeModelConfigRows(libraryPayload);
  const authFileAvailability = await loadAuthFileModelItems(authFiles, libraryModels);

  const map = new Map<string, ModelAvailabilityItem>();
  for (const item of authFileAvailability.items) addModel(map, item);
  for (const item of providerItems) addModel(map, item);

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
    pricing.cachedPricePerMillion > 0
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
  return `$${formatModelPriceAmount(pricing.inputPricePerMillion)} / $${formatModelPriceAmount(pricing.outputPricePerMillion)} / $${formatModelPriceAmount(pricing.cachedPricePerMillion)}`;
};
