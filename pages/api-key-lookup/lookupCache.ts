import {
  clearTenantBucketMap,
  getActiveCacheTenantId,
  readTenantBucketMapEntry,
  updateTenantBucketMapEntry,
} from "@code-proxy/domain";
import type { PublicModelItem } from "./api";
import type { ChartDataResponse } from "./types";

/**
 * 门户用量页的会话级缓存：图表数据和模型清单按租户分桶存在 sessionStorage 里，
 * 切回来先显示上次的结果再刷新。从 ApiKeyLookupPage 拆出来的纯函数，页面只管什么时候读写。
 */

/** Tenant-scoped chart cache (v2). Legacy v1 migrates into the default tenant only. */
const LOOKUP_CHART_CACHE_STORAGE_KEY = "apiKeyLookup.chartCache.v2";
const LOOKUP_CHART_CACHE_STORAGE_KEY_V1 = "apiKeyLookup.chartCache.v1";
const LOOKUP_MODELS_CACHE_STORAGE_KEY = "apiKeyLookup.modelsCache.v3";
const LOOKUP_MODELS_CACHE_STORAGE_KEY_V2 = "apiKeyLookup.modelsCache.v2";
const LOOKUP_MODELS_CACHE_STORAGE_KEY_V1 = "apiKeyLookup.modelsCache.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChartDataResponse(value: unknown): value is ChartDataResponse {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.daily_series) &&
    Array.isArray(value.model_distribution) &&
    isRecord(value.stats)
  );
}

export const readStoredChartCache = (cacheKey: string): ChartDataResponse | null => {
  return readTenantBucketMapEntry({
    key: LOOKUP_CHART_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    legacyKey: LOOKUP_CHART_CACHE_STORAGE_KEY_V1,
    isEntry: isChartDataResponse,
  });
};

export const writeStoredChartCache = (cacheKey: string, data: ChartDataResponse): void => {
  updateTenantBucketMapEntry({
    key: LOOKUP_CHART_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    entryValue: data,
    maxEntries: 8,
    legacyKey: LOOKUP_CHART_CACHE_STORAGE_KEY_V1,
    legacyKeysToRemove: [LOOKUP_CHART_CACHE_STORAGE_KEY_V1],
  });
};

export const clearStoredChartCache = (): void => {
  clearTenantBucketMap({
    key: LOOKUP_CHART_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
  });
  try {
    window.sessionStorage.removeItem(LOOKUP_CHART_CACHE_STORAGE_KEY_V1);
  } catch {
    // ignore storage failures
  }
};

const isPublicModelItem = (value: unknown): value is PublicModelItem => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as PublicModelItem;
  return (
    typeof item.id === "string" &&
    typeof item.description === "string" &&
    typeof item.ownedBy === "string" &&
    Boolean(item.pricing) &&
    typeof item.pricing === "object" &&
    Array.isArray(item.inputModalities) &&
    Array.isArray(item.outputModalities) &&
    typeof item.supportsVision === "boolean"
  );
};

const isPublicModelArray = (value: unknown): value is PublicModelItem[] =>
  Array.isArray(value) && value.every(isPublicModelItem);

export const samePublicModelArray = (left: PublicModelItem[], right: PublicModelItem[]): boolean => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other.id &&
      item.description === other.description &&
      item.ownedBy === other.ownedBy &&
      item.supportsVision === other.supportsVision &&
      item.pricing.mode === other.pricing.mode &&
      item.pricing.inputPricePerMillion === other.pricing.inputPricePerMillion &&
      item.pricing.outputPricePerMillion === other.pricing.outputPricePerMillion &&
      item.pricing.cachedPricePerMillion === other.pricing.cachedPricePerMillion &&
      item.pricing.cacheReadPricePerMillion === other.pricing.cacheReadPricePerMillion &&
      item.pricing.cacheWritePricePerMillion === other.pricing.cacheWritePricePerMillion &&
      item.pricing.pricePerCall === other.pricing.pricePerCall
    );
  });
};

export const readStoredModelsCache = (cacheKey: string): PublicModelItem[] | null => {
  return readTenantBucketMapEntry({
    key: LOOKUP_MODELS_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    isEntry: isPublicModelArray,
  });
};

export const writeStoredModelsCache = (cacheKey: string, models: PublicModelItem[]): void => {
  updateTenantBucketMapEntry({
    key: LOOKUP_MODELS_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    entryValue: models,
    maxEntries: 8,
    legacyKeysToRemove: [LOOKUP_MODELS_CACHE_STORAGE_KEY_V2, LOOKUP_MODELS_CACHE_STORAGE_KEY_V1],
  });
};
