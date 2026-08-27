// Live model discovery contract, mirrored from the backend.
//
// The provider set has to match internal/management/authfiles/models.go: a
// provider missing here silently loses the shared discovery cache and falls back
// to the per-file registry list, which is how kimi kept showing a stale
// compiled-in catalog after the backend had started serving the live one.

/** Mirrors backend normalizeDiscoveryProvider (x-ai / grok → xai). */
export const normalizeDiscoveryProviderKey = (provider: string): string => {
  const key = provider.trim().toLowerCase();
  return key === "x-ai" || key === "grok" ? "xai" : key;
};

const SHARED_DISCOVERY_PROVIDERS = new Set(["claude", "codex", "xai", "kimi"]);

/**
 * Mirrors backend supportsSharedDiscovery: accounts of these providers share one
 * live model list per tenant, so opening any of them warms the same cache.
 */
export const supportsSharedModelDiscovery = (provider: string): boolean =>
  SHARED_DISCOVERY_PROVIDERS.has(normalizeDiscoveryProviderKey(provider));
