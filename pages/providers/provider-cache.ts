import {
  getActiveCacheTenantId,
  readTenantTtlSlot,
  removeTenantTtlSlot,
  writeTenantTtlSlot,
} from "@code-proxy/domain";

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Tenant-bucketed store. Legacy unscoped keys used `providers-page:cache:${slot}`. */
export const PROVIDERS_PAGE_CACHE_KEY = "providers-page:cache.v2";
const LEGACY_PREFIX = "providers-page:cache:";

export function getCachedData<T>(key: string): T | null {
  return readTenantTtlSlot<T>({
    key: PROVIDERS_PAGE_CACHE_KEY,
    tenantId: getActiveCacheTenantId(),
    slot: key,
    ttlMs: CACHE_TTL,
    legacyPrefix: LEGACY_PREFIX,
  });
}

export function setCachedData<T>(key: string, data: T): void {
  writeTenantTtlSlot({
    key: PROVIDERS_PAGE_CACHE_KEY,
    tenantId: getActiveCacheTenantId(),
    slot: key,
    data,
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
