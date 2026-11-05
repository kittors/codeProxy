import { readRawRecord, withRawRecord } from "@code-proxy/api-client";
import {
  getActiveCacheTenantId,
  readTenantTtlSlot,
  removeTenantTtlSlot,
  writeTenantTtlSlot,
} from "@code-proxy/domain";

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
/**
 * Tenant-bucketed store. Legacy unscoped keys used `providers-page:cache:${slot}`.
 *
 * v3: list items are stored together with the backend record they were read from (see
 * CACHED_RECORD_FIELD). A v2 snapshot has none, and the page seeds its lists from the cache before
 * the first fetch returns — saving from such a list would write back without the fields the panel
 * has no input for, so v2 snapshots must not be read.
 */
export const PROVIDERS_PAGE_CACHE_KEY = "providers-page:cache.v3";
const LEGACY_PREFIX = "providers-page:cache:";

/**
 * The backend record each provider list item was read from rides on the item as a hidden property
 * (api-client provider-raw.ts), which JSON cannot hold. It is stored beside the item as an ordinary
 * field and put back on read; without it a list seeded from this cache would drop every field the
 * panel has no input for on its next save.
 */
const CACHED_RECORD_FIELD = "__backendRecord";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const encodeItem = (item: unknown): unknown => {
  const record = readRawRecord(item);
  return record && isRecord(item) ? { ...item, [CACHED_RECORD_FIELD]: record } : item;
};

const decodeItem = (item: unknown): unknown => {
  if (!isRecord(item) || !(CACHED_RECORD_FIELD in item)) return item;
  const { [CACHED_RECORD_FIELD]: record, ...rest } = item;
  return withRawRecord(record, rest);
};

export function getCachedData<T>(key: string): T | null {
  const data = readTenantTtlSlot<T>({
    key: PROVIDERS_PAGE_CACHE_KEY,
    tenantId: getActiveCacheTenantId(),
    slot: key,
    ttlMs: CACHE_TTL,
    legacyPrefix: LEGACY_PREFIX,
  });
  return Array.isArray(data) ? (data.map(decodeItem) as T) : data;
}

export function setCachedData<T>(key: string, data: T): void {
  writeTenantTtlSlot({
    key: PROVIDERS_PAGE_CACHE_KEY,
    tenantId: getActiveCacheTenantId(),
    slot: key,
    data: Array.isArray(data) ? data.map(encodeItem) : data,
    ttlMs: CACHE_TTL,
    legacyPrefix: LEGACY_PREFIX,
  });
}

export function removeCachedData(key: string): void {
  removeTenantTtlSlot({
    key: PROVIDERS_PAGE_CACHE_KEY,
    tenantId: getActiveCacheTenantId(),
    slot: key,
    legacyPrefix: LEGACY_PREFIX,
  });
}
