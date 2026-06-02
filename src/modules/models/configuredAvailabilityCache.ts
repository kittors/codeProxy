let configuredAvailabilityCacheVersion = 0;

export const getConfiguredAvailabilityCacheVersion = () => configuredAvailabilityCacheVersion;

export const invalidateConfiguredModelAvailability = () => {
  configuredAvailabilityCacheVersion += 1;
};
