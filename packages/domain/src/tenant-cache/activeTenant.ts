/** Fallback bucket when no effective tenant is available (logged out / first paint). */
export const DEFAULT_CACHE_TENANT_ID = "default";

let activeCacheTenantId = DEFAULT_CACHE_TENANT_ID;
/** Optional prefix: apiBase + account so caches do not collide across accounts/hosts. */
let activeCacheScopePrefix = "";
let cacheTenantResolver: (() => string | null | undefined) | null = null;
let cacheScopeResolver: (() => string | null | undefined) | null = null;

/**
 * Normalize a tenant id for cache buckets.
 * Empty / whitespace collapses to DEFAULT_CACHE_TENANT_ID so reads and writes
 * always share one stable key instead of inventing empty-string buckets.
 */
export const normalizeCacheTenantId = (tenantId?: string | null): string => {
  const trimmed = typeof tenantId === "string" ? tenantId.trim() : "";
  return trimmed || DEFAULT_CACHE_TENANT_ID;
};

const normalizeScopePrefix = (value?: string | null): string => {
  if (typeof value !== "string") return "";
  return value.trim();
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

/** Optional live resolver for apiBase+account scope prefix. */
export const setCacheScopeResolver = (
  resolver: (() => string | null | undefined) | null,
): void => {
  cacheScopeResolver = resolver;
};

/** Explicitly pin the active cache tenant (switchTenant / login / logout). */
export const setActiveCacheTenantId = (tenantId?: string | null): void => {
  activeCacheTenantId = normalizeCacheTenantId(tenantId);
};

/**
 * Pin account/host scope used as a prefix on tenant cache keys.
 * Empty clears the prefix (logged out).
 */
export const setActiveCacheScopePrefix = (scope?: string | null): void => {
  activeCacheScopePrefix = normalizeScopePrefix(scope);
};

export const getActiveCacheScopePrefix = (): string => {
  if (cacheScopeResolver) {
    try {
      const resolved = cacheScopeResolver();
      if (resolved != null && String(resolved).trim()) {
        return normalizeScopePrefix(resolved);
      }
    } catch {
      /* best-effort */
    }
  }
  return activeCacheScopePrefix;
};

/**
 * Current tenant used by tenant-scoped data caches.
 * Resolution order: resolver() → last setActiveCacheTenantId → default.
 * When an account/host scope is set, it is prefixed so keys do not collide.
 */
export const getActiveCacheTenantId = (): string => {
  let tenant = activeCacheTenantId;
  if (cacheTenantResolver) {
    try {
      const resolved = cacheTenantResolver();
      if (resolved != null && String(resolved).trim()) {
        tenant = normalizeCacheTenantId(resolved);
      }
    } catch {
      // Resolver is best-effort; fall through to the pinned value.
    }
  }
  const scope = getActiveCacheScopePrefix();
  return scope ? `${scope}::${tenant}` : tenant;
};
