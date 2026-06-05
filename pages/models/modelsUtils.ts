import type {
  ModelItem,
  ModelOwnerPreset,
  ModelFormState,
  OwnerFormState,
  OpenRouterModelSyncState,
  OpenRouterModelSyncResult,
  ModelScope,
} from "./types";
import type {
  ModelAvailabilityItem,
  ConfiguredModelAvailability,
  ModelPathAvailabilityItem,
  ModelConfigMetadataItem,
} from "@features/model-availability";
import {
  emptyModelPricing,
  filterByConfiguredModelAvailability,
  formatModelPrice,
  hasModelPricing,
  invalidateConfiguredModelAvailability,
  normalizeModelConfigMetadataRows,
} from "@features/model-availability";
import { apiClient } from "@code-proxy/api-client";

export const emptyForm: ModelFormState = {
  originalId: null,
  id: "",
  ownedBy: "",
  description: "",
  enabled: true,
  mode: "token",
  inputPrice: "",
  outputPrice: "",
  cachedPrice: "",
  pricePerCall: "",
};

export const emptyOwnerForm: OwnerFormState = {
  originalValue: null,
  value: "",
  label: "",
  description: "",
  enabled: true,
};

export const defaultOpenRouterSyncState: OpenRouterModelSyncState = {
  enabled: false,
  intervalMinutes: 1440,
  lastSyncAt: "",
  lastSuccessAt: "",
  lastError: "",
  lastSeen: 0,
  lastAdded: 0,
  lastUpdated: 0,
  lastSkipped: 0,
  running: false,
};

export function parsePriceInput(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function asNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export function normalizeOwnerValue(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

function metadataToModel(item: ModelConfigMetadataItem): ModelItem {
  return {
    id: item.id,
    owned_by: item.owned_by,
    description: item.description,
    enabled: item.enabled,
    source: item.source,
    pricing: item.pricing,
    inputModalities: item.inputModalities,
    outputModalities: item.outputModalities,
    supportsVision: item.supportsVision,
  };
}

export function normalizeModelConfigResponse(payload: unknown): ModelItem[] {
  return normalizeModelConfigMetadataRows(payload).map(metadataToModel);
}

function normalizeOwnerPreset(raw: Record<string, unknown>): ModelOwnerPreset | null {
  const value = normalizeOwnerValue(String(raw.value ?? raw.id ?? raw.owner ?? "")).trim();
  if (!value) return null;
  return {
    value,
    label: String(raw.label ?? raw.name ?? value).trim() || value,
    description: String(raw.description ?? ""),
    enabled: raw.enabled === false ? false : true,
    modelCount: asNumber(raw.model_count ?? raw.modelCount),
  };
}

export function normalizeOwnerPresetResponse(payload: unknown): ModelOwnerPreset[] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawList = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(payload)
        ? payload
        : [];

  return rawList
    .map((item) =>
      item && typeof item === "object"
        ? normalizeOwnerPreset(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is ModelOwnerPreset => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function fetchModelConfigs(scope: ModelScope): Promise<ModelItem[]> {
  try {
    const data = await apiClient.get(`/model-configs?scope=${scope}`);
    return normalizeModelConfigResponse(data);
  } catch (error) {
    const legacyPayload = await apiClient.get("/models");
    const legacyModels = normalizeModelConfigResponse(legacyPayload);
    if (legacyModels.length > 0) return legacyModels;
    throw error;
  }
}

export async function fetchOwnerPresets(): Promise<ModelOwnerPreset[]> {
  return normalizeOwnerPresetResponse(await apiClient.get("/model-owner-presets"));
}

function availabilityItemToModel(item: ModelAvailabilityItem): ModelItem {
  return {
    id: item.id,
    owned_by: item.owned_by ?? "",
    description: item.description ?? "",
    enabled: true,
    source: item.source ?? "configured",
    pricing: item.pricing ?? emptyModelPricing(),
    inputModalities: item.inputModalities ?? [],
    outputModalities: item.outputModalities ?? [],
    supportsVision: item.supportsVision ?? item.inputModalities?.includes("image") ?? false,
  };
}

export function mergeConfiguredModelAvailability(
  data: ModelItem[],
  availability: ConfiguredModelAvailability | null,
  pathItems: ModelPathAvailabilityItem[] = [],
): ModelItem[] {
  const visible = availability?.scoped
    ? filterByConfiguredModelAvailability(data, availability)
    : [...data];
  const seen = new Set(visible.map((m) => m.id.toLowerCase()));
  for (const item of availability?.items ?? []) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) continue;
    visible.push(availabilityItemToModel(item));
    seen.add(key);
  }
  for (const item of pathItems) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) continue;
    visible.push(
      availabilityItemToModel({
        id: item.id,
        owned_by: item.owned_by,
        source: item.kind || "path",
      }),
    );
    seen.add(key);
  }
  return visible.sort((a, b) => a.id.localeCompare(b.id));
}

export function toFormState(model: ModelItem): ModelFormState {
  return {
    originalId: model.id,
    id: model.id,
    ownedBy: normalizeOwnerValue(model.owned_by),
    description: model.description,
    enabled: model.enabled,
    mode: model.pricing.mode,
    inputPrice: model.pricing.inputPricePerMillion
      ? String(model.pricing.inputPricePerMillion)
      : "",
    outputPrice: model.pricing.outputPricePerMillion
      ? String(model.pricing.outputPricePerMillion)
      : "",
    cachedPrice: model.pricing.cachedPricePerMillion
      ? String(model.pricing.cachedPricePerMillion)
      : "",
    pricePerCall: model.pricing.pricePerCall ? String(model.pricing.pricePerCall) : "",
  };
}

export function buildModelPayload(form: ModelFormState) {
  const base = {
    id: form.id.trim(),
    owned_by: form.ownedBy.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
  };

  if (form.mode === "call") {
    return {
      ...base,
      pricing: {
        mode: "call" as const,
        price_per_call: parsePriceInput(form.pricePerCall),
      },
    };
  }

  return {
    ...base,
    pricing: {
      mode: "token" as const,
      input_price_per_million: parsePriceInput(form.inputPrice),
      output_price_per_million: parsePriceInput(form.outputPrice),
      cached_price_per_million: parsePriceInput(form.cachedPrice),
      cache_read_price_per_million: 0,
      cache_write_price_per_million: 0,
    },
  };
}

export function payloadToModel(
  payload: ReturnType<typeof buildModelPayload>,
  source: string,
): ModelItem {
  const pricing =
    payload.pricing.mode === "call"
      ? {
          ...emptyModelPricing(),
          mode: "call" as const,
          pricePerCall: payload.pricing.price_per_call,
        }
      : {
          mode: "token" as const,
          inputPricePerMillion: payload.pricing.input_price_per_million,
          outputPricePerMillion: payload.pricing.output_price_per_million,
          cachedPricePerMillion: payload.pricing.cached_price_per_million,
          cacheReadPricePerMillion: payload.pricing.cache_read_price_per_million ?? 0,
          cacheWritePricePerMillion: payload.pricing.cache_write_price_per_million ?? 0,
          pricePerCall: 0,
        };

  return {
    id: payload.id,
    owned_by: payload.owned_by,
    description: payload.description,
    enabled: payload.enabled,
    source,
    pricing,
    inputModalities: [],
    outputModalities: [],
    supportsVision: false,
  };
}

export function modelHasTextCapability(model: ModelItem): boolean {
  if (model.inputModalities.includes("text") || model.outputModalities.includes("text")) {
    return true;
  }
  return model.inputModalities.length === 0 && model.outputModalities.length === 0;
}

export function modelConfigCollectionPath(scope: ModelScope): string {
  return scope === "library" ? "/model-configs?scope=library" : "/model-configs";
}

export function modelConfigItemPath(modelId: string, scope: ModelScope): string {
  const suffix = scope === "library" ? "?scope=library" : "";
  return `/model-configs/${encodeURIComponent(modelId)}${suffix}`;
}

export async function saveModelConfig(form: ModelFormState, scope: ModelScope) {
  const payload = buildModelPayload(form);
  if (!payload.id) throw new Error("Model ID is required");

  if (form.originalId) {
    await apiClient.put(modelConfigItemPath(form.originalId, scope), payload);
  } else {
    await apiClient.post(modelConfigCollectionPath(scope), payload);
  }
  invalidateConfiguredModelAvailability();

  return payloadToModel(payload, scope === "library" ? "seed" : "user");
}

export function formatPrice(model: ModelItem, notPricedLabel: string): string {
  return formatModelPrice(model.pricing, notPricedLabel);
}

export function hasModelPricingData(model: ModelItem): boolean {
  return hasModelPricing(model.pricing);
}

export function buildOwnerPresetDrafts(
  models: ModelItem[],
  presets: ModelOwnerPreset[],
): ModelOwnerPreset[] {
  const map = new Map<string, ModelOwnerPreset>();
  for (const preset of presets) {
    const value = normalizeOwnerValue(preset.value);
    if (!value) continue;
    map.set(value, { ...preset, value });
  }
  for (const model of models) {
    const value = normalizeOwnerValue(model.owned_by);
    if (!value || map.has(value)) continue;
    map.set(value, {
      value,
      label: model.owned_by || value,
      description: "",
      enabled: true,
      modelCount: 0,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function toOwnerFormState(owner: ModelOwnerPreset): OwnerFormState {
  return {
    originalValue: owner.value,
    value: owner.value,
    label: owner.label,
    description: owner.description,
    enabled: owner.enabled,
  };
}

export function normalizeOwnerPresetItems(presets: ModelOwnerPreset[]) {
  const items = presets
    .map((owner) => ({
      value: normalizeOwnerValue(owner.value),
      label: owner.label.trim(),
      description: owner.description.trim(),
      enabled: owner.enabled,
    }))
    .filter((owner) => owner.value && owner.label);

  return Array.from(new Map(items.map((item) => [item.value, item])).values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function normalizeOpenRouterSyncState(payload: unknown): OpenRouterModelSyncState {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    enabled: record.enabled === true,
    intervalMinutes: Math.max(60, Math.round(asNumber(record.interval_minutes) || 1440)),
    lastSyncAt: String(record.last_sync_at ?? ""),
    lastSuccessAt: String(record.last_success_at ?? ""),
    lastError: String(record.last_error ?? ""),
    lastSeen: Math.round(asNumber(record.last_seen)),
    lastAdded: Math.round(asNumber(record.last_added)),
    lastUpdated: Math.round(asNumber(record.last_updated)),
    lastSkipped: Math.round(asNumber(record.last_skipped)),
    running: record.running === true,
  };
}

export function normalizeOpenRouterSyncResult(payload: unknown): OpenRouterModelSyncResult | null {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (!("seen" in record) && !("added" in record) && !("skipped" in record)) return null;
  return {
    seen: Math.round(asNumber(record.seen)),
    added: Math.round(asNumber(record.added)),
    updated: Math.round(asNumber(record.updated)),
    skipped: Math.round(asNumber(record.skipped)),
  };
}

export function syncIntervalHoursValue(intervalMinutes: number): string {
  return String(Math.max(1, Math.round(intervalMinutes / 60)));
}

export function syncIntervalMinutesFromHours(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1440;
  return Math.max(60, Math.round(parsed * 60));
}

export function formatSyncTimestamp(value: string, emptyLabel: string): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
