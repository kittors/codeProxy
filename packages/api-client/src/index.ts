export { ApiClient, apiClient } from "./client/client";
export type { RequestOptions } from "./client/client";
export {
  AUTH_PERSIST_TTL_MS,
  AUTH_STORAGE_KEY,
  BUILD_DATE_HEADER_KEYS,
  DEFAULT_API_PORT,
  MANAGEMENT_API_PREFIX,
  REQUEST_TIMEOUT_MS,
  VERSION_HEADER_KEYS,
  computeManagementApiBase,
  detectApiBaseFromLocation,
  normalizeApiBase,
} from "./client/constants";
export {
  ApiError,
  ApiClientError,
  extractApiErrorMessage,
  isApiClientError,
} from "./client/errors";
export type { ApiErrorBody, ApiErrorOptions, ApiClientErrorOptions } from "./client/errors";
export { ensureArrayPayload, isApiEnvelope, unwrapApiEnvelope } from "./client/response";
export type { ApiEnvelope, ApiListPayload, ApiSuccessEnvelope } from "./client/response";
export { publicApiClient, PublicApiClient } from "./client/public-client";
export {
  clearPersistedAuthSnapshot,
  readPersistedAuthSnapshot,
  writePersistedAuthSnapshot,
} from "./client/auth-storage";
export type * from "./dto/types";

export { configApi } from "./endpoints/config";
export { usageApi } from "./endpoints/usage";
export type * from "./endpoints/usage";
export { providersApi } from "./endpoints/providers";
export { configFileApi } from "./endpoints/config-file";
export { logsApi } from "./endpoints/logs";
export { oauthApi } from "./endpoints/oauth";
export { authFilesApi } from "./endpoints/auth-files";
export { apiCallApi, getApiCallErrorMessage } from "./endpoints/api-call";
export { ampcodeApi } from "./endpoints/ampcode";
export { vertexApi } from "./endpoints/vertex";
export { apiKeysApi, apiKeyEntriesApi } from "./endpoints/api-keys";
export type * from "./endpoints/api-keys";
export { apiKeyPermissionProfilesApi } from "./endpoints/api-key-permission-profiles";
export {
  CUSTOM_PERMISSION_PROFILE_ID,
  makePermissionProfileId,
  applyApiKeyPermissionProfile,
  resolveEntryPermissionProfileId,
} from "./endpoints/api-key-permission-profiles";
export type * from "./endpoints/api-key-permission-profiles";
export { modelsApi } from "./endpoints/models";
export type * from "./endpoints/models";
export { versionApi } from "./endpoints/version";
export { quotaApi } from "./endpoints/quota";
export { identityFingerprintApi } from "./endpoints/identity-fingerprint";
export type * from "./endpoints/identity-fingerprint";
export { updateApi } from "./endpoints/update";
export type * from "./endpoints/update";
export { imageGenerationApi } from "./endpoints/image-generation";
export { proxiesApi } from "./endpoints/proxies";
export type * from "./endpoints/proxies";
export {
  ccSwitchImportConfigsApi,
  normalizeCcSwitchImportConfigs,
} from "./endpoints/ccswitch-import-configs";
export { channelGroupsApi } from "./endpoints/channel-groups";
export type * from "./endpoints/channel-groups";
export { routingConfigApi } from "./endpoints/routing-config";
export type * from "./endpoints/routing-config";
export {
  isRecord,
  extractArrayPayload,
  normalizeString,
  normalizeHeaders,
  normalizeModels,
  normalizeExcludedModels,
  serializeHeaders,
  serializeModels,
  serializeProviderKey,
  serializeOpenCodeGoKey,
  serializeGeminiKey,
  serializeBedrockKey,
  serializeOpenAIProvider,
  normalizeOauthExcludedModels,
  normalizeOauthModelAlias,
  normalizeApiKeyEntries,
} from "./endpoints/helpers";
