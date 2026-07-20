export {
  DEFAULT_CACHE_TENANT_ID,
  getActiveCacheScopePrefix,
  getActiveCacheTenantId,
  normalizeCacheTenantId,
  setActiveCacheScopePrefix,
  setActiveCacheTenantId,
  setCacheScopeResolver,
  setCacheTenantResolver,
} from "./activeTenant";

export {
  clearTenantBucketMap,
  readTenantBucket,
  readTenantBucketMapEntry,
  readTenantBucketStore,
  readTenantTtlSlot,
  removeTenantTtlSlot,
  updateTenantBucketMapEntry,
  writeTenantBucket,
  writeTenantBucketStore,
  writeTenantTtlSlot,
  type TenantBucketStore,
  type TtlSlotEntry,
  type WebStorageKind,
} from "./tenantScopedStorage";
