let configuredAvailabilityCacheVersion = 0;

export const getConfiguredAvailabilityCacheVersion = () => configuredAvailabilityCacheVersion;

/**
 * Bump the process-global availability cache version.
 * Used as a hard invalidation on tenant switch / logout so in-flight promises
 * from a previous tenant cannot be reused even if a tenant map entry lingers.
 */
export const invalidateConfiguredModelAvailability = () => {
  configuredAvailabilityCacheVersion += 1;
};
