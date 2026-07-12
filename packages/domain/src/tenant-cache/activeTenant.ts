/** Fallback bucket when no effective tenant is available (logged out / first paint). */
export const DEFAULT_CACHE_TENANT_ID = "default";

let activeCacheTenantId = DEFAULT_CACHE_TENANT_ID;
let cacheTenantResolver: (() => string | null | undefined) | null = null;

/**
 * Normalize a tenant id for cache buckets.
 * Empty / whitespace collapses to DEFAULT_CACHE_TENANT_ID so reads and writes
 * always share one stable key instead of inventing empty-string buckets.
 */
export const normalizeCacheTenantId = (tenantId?: string | null): string => {
  const trimmed = typeof tenantId === "string" ? tenantId.trim() : "";
  return trimmed || DEFAULT_CACHE_TENANT_ID;
};

/**
 * Optional live resolver (e.g. AuthProvider principal).
 * When set, getActiveCacheTenantId prefers the resolver over the last explicit set.
 */
export const setCacheTenantResolver = (
  resolver: (() => string | null | undefined) | null,
): void => {
  cacheTenantResolver = resolver;
};

/** Explicitly pin the active cache tenant (switchTenant / login / logout). */
export const setActiveCacheTenantId = (tenantId?: string | null): void => {
  activeCacheTenantId = normalizeCacheTenantId(tenantId);
};

/**
 * Current tenant used by tenant-scoped data caches.
 * Resolution order: resolver() → last setActiveCacheTenantId → default.
 */
export const getActiveCacheTenantId = (): string => {
  if (cacheTenantResolver) {
    try {
      const resolved = cacheTenantResolver();
      if (resolved != null && String(resolved).trim()) {
        return normalizeCacheTenantId(resolved);
      }
    } catch {
      // Resolver is best-effort; fall through to the pinned value.
    }
  }
  return activeCacheTenantId;
};
