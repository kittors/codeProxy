import type {
  AuthFileItem,
  AuthFileIdentityFingerprintSummary,
  AuthFileIdentityFingerprintSource,
  AuthFileRestriction,
  AuthFileSubscriptionPeriod,
  ClaudeOAuthHealth,
  ClaudeOAuthHealthWindow,
  ClaudeOAuthRuntimeProfile,
  EntityStatsResponse,
  OAuthModelAliasEntry,
} from "./types";
import { normalizeUsageSourceId, type KeyStatBucket } from "../providers/providerUsage";
import { resolveCodexPlanType } from "../quota/resolvers";
import { normalizePlanType } from "../quota/parsers";
import type { QuotaItem, QuotaState, QuotaStatus } from "../quota/types";
import type { StatusBarData, StatusBlockDetail, StatusBlockState } from "../usage";
import {
  getActiveCacheTenantId,
  normalizeCacheTenantId,
  readTenantBucket,
  writeTenantBucket,
} from "../tenant-cache";

export type AuthFileModelItem = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};

export type AuthFileModelOwnerGroup = {
  value: string;
  label: string;
  description: string;
  models: AuthFileModelItem[];
};

export type OAuthDialogTab =
  | "codex"
  | "anthropic"
  | "antigravity"
  | "gemini-cli"
  | "kimi"
  | "qwen"
  | "iflow"
  | "vertex";

export const AUTH_FILES_PAGE_SIZE = 9;
export const MAX_AUTH_FILE_SIZE = 50 * 1024;

/** Tenant-scoped auth-files UI filters (file group / status / search / page). */
export const AUTH_FILES_UI_STATE_KEY = "authFilesPage.uiState.v3";
/** Tenant-scoped auth-files list/quota cache (v3). Legacy v2 is read only for migration. */
export const AUTH_FILES_DATA_CACHE_KEY = "authFilesPage.dataCache.v3";
export const AUTH_FILES_DATA_CACHE_KEY_V2 = "authFilesPage.dataCache.v2";
export const AUTH_FILES_QUOTA_PREVIEW_KEY = "authFilesPage.quotaPreview.v1";
export const AUTH_FILES_QUOTA_AUTO_REFRESH_KEY = "authFilesPage.quotaAutoRefreshMs.v1";
export const AUTH_FILES_FILES_VIEW_MODE_KEY = "authFilesPage.filesViewMode.v1";
export const AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY = "authFilesPage.modelOwnerGroupMap.v1";

export type QuotaPreviewMode = "5h" | "week";
/** Off / 60s / 300s only. Legacy 5s/10s/30s migrate safely via normalizeQuotaAutoRefreshMs. */
export type QuotaAutoRefreshMs = 0 | 60000 | 300000;
export type FilesViewMode = "table" | "cards";
export type AuthFilesModelOwnerGroupMap = Record<string, string>;
export type AuthFileStatusFilter =
  | "all"
  | "http-429"
  | "http-auth"
  | "http-5xx"
  | "other-error"
  | "disabled";

export const AUTH_FILE_STATUS_FILTERS: AuthFileStatusFilter[] = [
  "all",
  "http-429",
  "http-auth",
  "http-5xx",
  "other-error",
  "disabled",
];

export type AuthFilesUiState = {
  tab?: "files" | "excluded" | "alias";
  filter?: string;
  tagFilter?: string;
  statusFilter?: AuthFileStatusFilter;
  search?: string;
  page?: number;
};

export type AuthFilesDataCache = {
  /** Effective tenant id that owns this cache bucket. Required to prevent cross-tenant reuse. */
  tenantId: string;
  savedAtMs: number;
  files: AuthFileItem[];
  usageData?: EntityStatsResponse | null;
  quotaByFileName?: Record<string, QuotaState>;
};

type AuthFilesDataCacheBucket = Omit<AuthFilesDataCache, "tenantId">;

const sanitizeDecodedIdToken = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const readOptionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const readOptionalNumber = (value: unknown): number | undefined => {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const readOptionalHttpStatus = (value: unknown): number | undefined => {
  const status = readOptionalNumber(value);
  if (status === undefined) return undefined;
  const rounded = Math.round(status);
  return rounded >= 100 && rounded <= 599 ? rounded : undefined;
};

const sanitizeClaudeOAuthHealthWindowForCache = (
  value: unknown,
): ClaudeOAuthHealthWindow | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const output: ClaudeOAuthHealthWindow = {};
  const status = readOptionalString(value.status);
  const resetAt = readOptionalString(value.reset_at);
  const utilization = readOptionalNumber(value.utilization);
  const exceeded = readOptionalBoolean(value.exceeded);
  const surpassedThreshold = readOptionalBoolean(value.surpassed_threshold);
  const updatedAt = readOptionalString(value.updated_at);

  if (status) output.status = status;
  if (resetAt) output.reset_at = resetAt;
  if (utilization !== undefined) output.utilization = utilization;
  if (exceeded !== undefined) output.exceeded = exceeded;
  if (surpassedThreshold !== undefined) output.surpassed_threshold = surpassedThreshold;
  if (updatedAt) output.updated_at = updatedAt;

  return Object.keys(output).length > 0 ? output : undefined;
};

const sanitizeClaudeOAuthRuntimeProfileForCache = (
  value: unknown,
): ClaudeOAuthRuntimeProfile | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const output: ClaudeOAuthRuntimeProfile = {};
  const name = readOptionalString(value.name);
  const identityFingerprint = readOptionalString(value.identity_fingerprint);
  const transport = readOptionalString(value.transport);
  const egress = readOptionalString(value.egress);

  if (name) output.name = name;
  if (identityFingerprint) output.identity_fingerprint = identityFingerprint;
  if (transport) output.transport = transport;
  if (egress) output.egress = egress;

  return Object.keys(output).length > 0 ? output : undefined;
};

const sanitizeClaudeOAuthHealthForCache = (value: unknown): ClaudeOAuthHealth | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const output: ClaudeOAuthHealth = {};
  const enabled = readOptionalBoolean(value.enabled);
  const status = readOptionalString(value.status);
  const updatedAt = readOptionalString(value.updated_at);
  const refreshAvailable = readOptionalBoolean(value.refresh_available);
  const lastRuntimeStatus = readOptionalHttpStatus(value.last_runtime_status);
  const lastRuntimeAt = readOptionalString(value.last_runtime_at);
  const lastRefreshAt = readOptionalString(value.last_refresh_at);
  const last401At = readOptionalString(value.last_401_at);
  const last401Message = readOptionalString(value.last_401_message);
  const temporaryUntil = readOptionalString(value.temporary_unschedulable_until);
  const temporaryReason = readOptionalString(value.temporary_unschedulable_reason);
  const windows = isPlainRecord(value.windows) ? value.windows : undefined;
  const fiveHour = sanitizeClaudeOAuthHealthWindowForCache(windows?.five_hour);
  const sevenDay = sanitizeClaudeOAuthHealthWindowForCache(windows?.seven_day);
  const runtimeProfile = sanitizeClaudeOAuthRuntimeProfileForCache(value.runtime_profile);

  if (enabled !== undefined) output.enabled = enabled;
  if (status) output.status = status;
  if (updatedAt) output.updated_at = updatedAt;
  if (refreshAvailable !== undefined) output.refresh_available = refreshAvailable;
  if (lastRuntimeStatus !== undefined) output.last_runtime_status = lastRuntimeStatus;
  if (lastRuntimeAt) output.last_runtime_at = lastRuntimeAt;
  if (lastRefreshAt) output.last_refresh_at = lastRefreshAt;
  if (last401At) output.last_401_at = last401At;
  if (last401Message) output.last_401_message = last401Message;
  if (temporaryUntil) output.temporary_unschedulable_until = temporaryUntil;
  if (temporaryReason) output.temporary_unschedulable_reason = temporaryReason;
  if (fiveHour || sevenDay) {
    output.windows = {
      ...(fiveHour ? { five_hour: fiveHour } : {}),
      ...(sevenDay ? { seven_day: sevenDay } : {}),
    };
  }
  if (runtimeProfile) output.runtime_profile = runtimeProfile;

  return Object.keys(output).length > 0 ? output : undefined;
};

const IDENTITY_FINGERPRINT_SOURCES: AuthFileIdentityFingerprintSource[] = [
  "learned",
  "preset",
  "builtin_default",
];

const sanitizeIdentityFingerprintSourceCountsForCache = (
  value: unknown,
): Partial<Record<AuthFileIdentityFingerprintSource, number>> | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const output: Partial<Record<AuthFileIdentityFingerprintSource, number>> = {};
  IDENTITY_FINGERPRINT_SOURCES.forEach((source) => {
    const count = readOptionalNumber(value[source]);
    if (count !== undefined && count >= 0) {
      output[source] = Math.floor(count);
    }
  });
  return Object.keys(output).length > 0 ? output : undefined;
};

const sanitizeIdentityFingerprintSourceForCache = (
  value: unknown,
): AuthFileIdentityFingerprintSource | undefined => {
  const source = readOptionalString(value);
  if (!source) return undefined;
  return IDENTITY_FINGERPRINT_SOURCES.includes(source as AuthFileIdentityFingerprintSource)
    ? (source as AuthFileIdentityFingerprintSource)
    : undefined;
};

const sanitizeIdentityFingerprintSummaryForCache = (
  value: unknown,
): AuthFileIdentityFingerprintSummary | undefined => {
  if (!isPlainRecord(value)) return undefined;
  const provider = readOptionalString(value.provider);
  if (
    provider !== "claude" &&
    provider !== "codex" &&
    provider !== "gemini" &&
    provider !== "xai"
  ) {
    return undefined;
  }
  const primarySource =
    sanitizeIdentityFingerprintSourceForCache(value.primary_source) ?? "builtin_default";
  const sourceCounts = sanitizeIdentityFingerprintSourceCountsForCache(value.source_counts) ?? {};
  const summary: AuthFileIdentityFingerprintSummary = {
    provider,
    enabled: Boolean(value.enabled),
    primary_source: primarySource,
    learned: Boolean(value.learned),
    learned_fields: Math.max(0, Math.floor(readOptionalNumber(value.learned_fields) ?? 0)),
    effective_fields: Math.max(0, Math.floor(readOptionalNumber(value.effective_fields) ?? 0)),
    source_counts: sourceCounts,
  };
  const accountKey = readOptionalString(value.account_key);
  const authSubjectId = readOptionalString(value.auth_subject_id);
  const profileKey = readOptionalString(value.profile_key);
  const profileFamily = readOptionalString(value.profile_family);
  const clientProduct = readOptionalString(value.client_product);
  const clientVariant = readOptionalString(value.client_variant);
  const version = readOptionalString(value.version);
  const updatedAt = readOptionalString(value.updated_at);
  const lastSeenAt = readOptionalString(value.last_seen_at);

  if (accountKey) summary.account_key = accountKey;
  if (authSubjectId) summary.auth_subject_id = authSubjectId;
  if (profileKey) summary.profile_key = profileKey;
  if (profileFamily) summary.profile_family = profileFamily;
  if (clientProduct) summary.client_product = clientProduct;
  if (clientVariant) summary.client_variant = clientVariant;
  if (version) summary.version = version;
  if (updatedAt) summary.updated_at = updatedAt;
  if (lastSeenAt) summary.last_seen_at = lastSeenAt;

  return summary;
};

const sanitizeAuthFileRestrictionsForCache = (
  value: unknown,
): AuthFileRestriction[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const restrictions = value
    .map((entry): AuthFileRestriction | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const scope = typeof record.scope === "string" ? record.scope : undefined;
      const model = typeof record.model === "string" ? record.model : undefined;
      const status = typeof record.status === "string" ? record.status : undefined;
      const statusMessage =
        typeof record.status_message === "string" ? record.status_message : undefined;
      const httpStatus = Number(record.http_status);
      const code = typeof record.code === "string" ? record.code : undefined;
      const reason = typeof record.reason === "string" ? record.reason : undefined;
      const quotaWindow = typeof record.quota_window === "string" ? record.quota_window : undefined;
      const quotaWindowMinutes = Number(record.quota_window_minutes);
      const nextRetryAfter =
        typeof record.next_retry_after === "string" || typeof record.next_retry_after === "number"
          ? record.next_retry_after
          : undefined;
      const nextRecoverAt =
        typeof record.next_recover_at === "string" || typeof record.next_recover_at === "number"
          ? record.next_recover_at
          : undefined;
      return {
        ...(scope ? { scope } : {}),
        ...(model ? { model } : {}),
        ...(status ? { status } : {}),
        ...(statusMessage ? { status_message: statusMessage } : {}),
        ...(Number.isFinite(httpStatus) && httpStatus > 0 ? { http_status: httpStatus } : {}),
        ...(code ? { code } : {}),
        ...(reason ? { reason } : {}),
        ...(quotaWindow ? { quota_window: quotaWindow } : {}),
        ...(Number.isFinite(quotaWindowMinutes) && quotaWindowMinutes > 0
          ? { quota_window_minutes: quotaWindowMinutes }
          : {}),
        ...(record.unavailable === true ? { unavailable: true } : {}),
        ...(record.quota_exceeded === true ? { quota_exceeded: true } : {}),
        ...(record.retryable === true ? { retryable: true } : {}),
        ...(nextRetryAfter !== undefined ? { next_retry_after: nextRetryAfter } : {}),
        ...(nextRecoverAt !== undefined ? { next_recover_at: nextRecoverAt } : {}),
      };
    })
    .filter((entry): entry is AuthFileRestriction => Boolean(entry));
  return restrictions.length > 0 ? restrictions : undefined;
};

const parseAuthFilesUiStateBucket = (value: unknown): AuthFilesUiState | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // Reject tenant-store wrappers so only real UI-state objects are accepted.
  if ("byTenant" in record && !("filter" in record) && !("tab" in record) && !("page" in record)) {
    return null;
  }
  const output: AuthFilesUiState = {};
  if (record.tab === "files" || record.tab === "excluded" || record.tab === "alias") {
    output.tab = record.tab;
  }
  if (typeof record.filter === "string") output.filter = record.filter;
  if (typeof record.tagFilter === "string") output.tagFilter = record.tagFilter;
  if (
    typeof record.statusFilter === "string" &&
    AUTH_FILE_STATUS_FILTERS.includes(record.statusFilter as AuthFileStatusFilter)
  ) {
    output.statusFilter = record.statusFilter as AuthFileStatusFilter;
  }
  if (typeof record.search === "string") output.search = record.search;
  if (typeof record.page === "number" && Number.isFinite(record.page)) {
    output.page = Math.max(1, Math.round(record.page));
  }
  return output;
};

/**
 * Read auth-files UI filters for a tenant (file group, status, search, page).
 * Prefer explicit tenantId; fall back to the active cache tenant from AuthProvider.
 * Legacy unscoped v3 payloads migrate into the default tenant bucket on first write.
 */
export const readAuthFilesUiState = (
  tenantId?: string | null,
): AuthFilesUiState | null => {
  if (typeof window === "undefined") return null;
  const tenantKey = normalizeCacheTenantId(tenantId ?? getActiveCacheTenantId());
  return readTenantBucket({
    key: AUTH_FILES_UI_STATE_KEY,
    tenantId: tenantKey,
    parseBucket: parseAuthFilesUiStateBucket,
    // v3 may still hold a single unscoped UI-state object mid-migration.
    acceptUnscopedCurrent: true,
  });
};

export const writeAuthFilesUiState = (
  state: AuthFilesUiState,
  tenantId?: string | null,
) => {
  if (typeof window === "undefined") return;
  const tenantKey = normalizeCacheTenantId(tenantId ?? getActiveCacheTenantId());
  const bucket = parseAuthFilesUiStateBucket(state) ?? {};
  writeTenantBucket({
    key: AUTH_FILES_UI_STATE_KEY,
    tenantId: tenantKey,
    parseBucket: parseAuthFilesUiStateBucket,
    acceptUnscopedCurrent: true,
    bucket,
  });
};

const sanitizeModelOwnerGroupMap = (value: unknown): AuthFilesModelOwnerGroupMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: AuthFilesModelOwnerGroupMap = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = normalizeProviderKey(rawKey);
    const owner =
      typeof rawValue === "string" ? rawValue.trim().replace(/\s+/g, "-").toLowerCase() : "";
    if (!key || key === "all" || !owner) continue;
    output[key] = owner;
  }
  return output;
};

export const readAuthFilesModelOwnerGroupMap = (): AuthFilesModelOwnerGroupMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY);
    if (!raw) return {};
    return sanitizeModelOwnerGroupMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
};

export const writeAuthFilesModelOwnerGroupMap = (map: AuthFilesModelOwnerGroupMap) => {
  if (typeof window === "undefined") return;
  const normalized = sanitizeModelOwnerGroupMap(map);
  try {
    if (Object.keys(normalized).length === 0) {
      window.localStorage.removeItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage failures; the in-memory selection still updates.
  }
};

export const sanitizeAuthFilesForCache = (files: AuthFileItem[]): AuthFileItem[] =>
  files.map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
    provider: file.provider,
    label: file.label,
    email: file.email,
    account: file.account,
    account_type: file.account_type,
    auth_index: file.auth_index,
    authIndex: file.authIndex,
    disabled: file.disabled,
    status: file.status,
    status_message: file.status_message,
    unavailable: file.unavailable,
    next_retry_after: file.next_retry_after,
    restrictions: sanitizeAuthFileRestrictionsForCache(file.restrictions),
    modified: file.modified,
    modtime: file.modtime,
    size: file.size,
    runtimeOnly: file.runtimeOnly,
    runtime_only: file.runtime_only,
    plan_type: file.plan_type,
    planType: file.planType,
    subscription_started_at: file.subscription_started_at,
    subscriptionStartedAt: file.subscriptionStartedAt,
    subscription_start_at: file.subscription_start_at,
    subscriptionStartAt: file.subscriptionStartAt,
    subscription_started_at_ms: file.subscription_started_at_ms,
    subscriptionStartedAtMs: file.subscriptionStartedAtMs,
    subscription_period: file.subscription_period,
    subscriptionPeriod: file.subscriptionPeriod,
    subscription_expires_at: file.subscription_expires_at,
    subscriptionExpiresAt: file.subscriptionExpiresAt,
    subscription_expires_at_ms: file.subscription_expires_at_ms,
    subscriptionExpiresAtMs: file.subscriptionExpiresAtMs,
    subscription_remaining_minutes: file.subscription_remaining_minutes,
    subscriptionRemainingMinutes: file.subscriptionRemainingMinutes,
    subscription_expired: file.subscription_expired,
    subscriptionExpired: file.subscriptionExpired,
    default_tags: normalizeTagList(file.default_tags),
    custom_tags: normalizeTagList(file.custom_tags),
    hidden_default_tags: normalizeTagList(file.hidden_default_tags),
    display_tags: Array.isArray(file.display_tags)
      ? normalizeTagList(file.display_tags)
      : undefined,
    claude_oauth_health: sanitizeClaudeOAuthHealthForCache(file.claude_oauth_health),
    identity_fingerprint_summary: sanitizeIdentityFingerprintSummaryForCache(
      file.identity_fingerprint_summary,
    ),
    id_token: sanitizeDecodedIdToken(file.id_token),
  }));

const QUOTA_CACHE_STATUSES = new Set<QuotaStatus>(["idle", "loading", "success", "error"]);

const sanitizeQuotaItemsForCache = (items: unknown): QuotaItem[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item): QuotaItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const key = typeof record.key === "string" && record.key ? record.key : undefined;
      const label = typeof record.label === "string" ? record.label : "";
      if (!label) return null;
      const percent =
        record.percent === null ||
        (typeof record.percent === "number" && Number.isFinite(record.percent))
          ? record.percent
          : null;
      const resetAtMs =
        typeof record.resetAtMs === "number" && Number.isFinite(record.resetAtMs)
          ? record.resetAtMs
          : undefined;
      const meta = typeof record.meta === "string" ? record.meta : undefined;
      return { ...(key ? { key } : {}), label, percent, resetAtMs, meta };
    })
    .filter((item): item is QuotaItem => Boolean(item));
};

const sanitizeResetCreditCountForCache = (value: unknown): number | undefined => {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count)) return undefined;
  return Math.max(0, Math.floor(count));
};

const sanitizeResetCreditExpirationsForCache = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const expirations = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return expirations.length > 0 ? expirations : undefined;
};

const sanitizeQuotaByFileNameForCache = (
  quotaByFileName: unknown,
  fileNames?: Set<string>,
): Record<string, QuotaState> | undefined => {
  if (!quotaByFileName || typeof quotaByFileName !== "object" || Array.isArray(quotaByFileName)) {
    return undefined;
  }

  const output: Record<string, QuotaState> = {};
  Object.entries(quotaByFileName as Record<string, unknown>).forEach(([fileName, rawState]) => {
    if (!fileName || (fileNames && !fileNames.has(fileName))) return;
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return;
    const state = rawState as Record<string, unknown>;
    const items = sanitizeQuotaItemsForCache(state.items);
    if (items.length === 0) return;
    const rawStatus = typeof state.status === "string" ? state.status : "success";
    const status = QUOTA_CACHE_STATUSES.has(rawStatus as QuotaStatus) ? rawStatus : "success";
    const updatedAt =
      typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)
        ? state.updatedAt
        : undefined;
    const planType = normalizePlanType(state.planType ?? state.plan_type);
    const resetCreditCount = sanitizeResetCreditCountForCache(state.resetCreditCount);
    const resetCreditExpirations = sanitizeResetCreditExpirationsForCache(
      state.resetCreditExpirations,
    );
    const error = typeof state.error === "string" ? state.error : undefined;
    output[fileName] = {
      status: status === "loading" ? "success" : (status as QuotaStatus),
      items,
      planType: planType ?? undefined,
      resetCreditCount,
      resetCreditExpirations,
      updatedAt,
      error: status === "error" ? error : undefined,
    };
  });

  return Object.keys(output).length > 0 ? output : undefined;
};

const parseAuthFilesDataCacheBucket = (
  value: unknown,
): AuthFilesDataCacheBucket | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Partial<AuthFilesDataCacheBucket> & { tenantId?: string };
  const files = Array.isArray(parsed.files) ? (parsed.files as AuthFileItem[]) : null;
  if (!files) return null;
  const savedAtMs =
    typeof parsed.savedAtMs === "number" && Number.isFinite(parsed.savedAtMs)
      ? parsed.savedAtMs
      : Date.now();
  return {
    savedAtMs,
    files,
    usageData:
      parsed.usageData && typeof parsed.usageData === "object"
        ? (parsed.usageData as EntityStatsResponse)
        : undefined,
    quotaByFileName: sanitizeQuotaByFileNameForCache(parsed.quotaByFileName),
  };
};

/**
 * Read auth-files list/quota cache for a tenant.
 * Prefer explicit tenantId; fall back to the active cache tenant from AuthProvider.
 */
export const readAuthFilesDataCache = (
  tenantId?: string | null,
): AuthFilesDataCache | null => {
  const tenantKey = normalizeCacheTenantId(tenantId ?? getActiveCacheTenantId());
  const bucket = readTenantBucket({
    key: AUTH_FILES_DATA_CACHE_KEY,
    tenantId: tenantKey,
    legacyKey: AUTH_FILES_DATA_CACHE_KEY_V2,
    parseBucket: parseAuthFilesDataCacheBucket,
    // v3 may still hold a single unscoped bucket mid-migration.
    acceptUnscopedCurrent: true,
  });
  if (!bucket) return null;
  return { tenantId: tenantKey, ...bucket };
};

export const writeAuthFilesDataCache = (cache: AuthFilesDataCache) => {
  const tenantKey = normalizeCacheTenantId(cache.tenantId || getActiveCacheTenantId());
  writeTenantBucket({
    key: AUTH_FILES_DATA_CACHE_KEY,
    tenantId: tenantKey,
    legacyKey: AUTH_FILES_DATA_CACHE_KEY_V2,
    parseBucket: parseAuthFilesDataCacheBucket,
    acceptUnscopedCurrent: true,
    legacyKeysToRemove: [AUTH_FILES_DATA_CACHE_KEY_V2],
    bucket: {
      savedAtMs: cache.savedAtMs,
      files: cache.files,
      usageData: cache.usageData,
      quotaByFileName: cache.quotaByFileName,
    },
    merge: (previous, next) => {
      const fileNames = new Set(next.files.map((file) => file.name).filter(Boolean));
      return {
        savedAtMs: next.savedAtMs,
        files: next.files,
        usageData: next.usageData ?? previous?.usageData,
        quotaByFileName: sanitizeQuotaByFileNameForCache(
          next.quotaByFileName ?? previous?.quotaByFileName,
          fileNames,
        ),
      };
    },
  });
};

export const formatFileSize = (bytes?: number): string => {
  const value = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (value <= 0) return "--";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/, "")} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
};

export const formatModified = (file: AuthFileItem): string => {
  const raw = (file.modtime ?? file.modified) as unknown;
  if (!raw) return "--";
  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
};

const parseDateLikeMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export type AuthFileRestrictionBadge = {
  key: string;
  label: string;
  model?: string;
  reason?: string;
  quotaWindow?: string;
  quotaWindowMinutes?: number;
  quotaLimited?: boolean;
  recoverAtMs?: number;
  remainingText?: string;
  tone: "danger" | "warning" | "neutral";
};

const readRestrictionDateMs = (restriction: AuthFileRestriction): number | null =>
  parseDateLikeMs(restriction.next_retry_after) ?? parseDateLikeMs(restriction.next_recover_at);

// Grok/xAI weekly 402: user-facing recovery is the weekly period end (quota preview
// weekly_limit.resetAtMs), not short local probe NextRetryAfter when upstream omits reset.
const resolveRestrictionRecoverAtMs = (
  restriction: AuthFileRestriction,
  nowMs: number,
  weeklyResetAtMs?: number | null,
): number | null => {
  const quotaWindow = normalizeRestrictionQuotaWindow(restriction);
  const weekly =
    typeof weeklyResetAtMs === "number" && Number.isFinite(weeklyResetAtMs) && weeklyResetAtMs > nowMs
      ? weeklyResetAtMs
      : null;
  if (quotaWindow === "week" && weekly !== null) {
    return weekly;
  }
  return readRestrictionDateMs(restriction);
};

export const resolveAuthFileWeeklyQuotaResetAtMs = (
  items: Array<{ key?: string; label?: string; resetAtMs?: number }> | null | undefined,
): number | null => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weekly = items.find((item) => {
    const key = normalizeTagValue(item.key);
    if (key === "weekly_limit" || key === "week" || key.includes("weekly")) return true;
    const label = normalizeQuotaLabel(item.label ?? "");
    return label.includes("weekly") || label.includes("week") || label.includes("周");
  });
  const resetAtMs = weekly?.resetAtMs;
  return typeof resetAtMs === "number" && Number.isFinite(resetAtMs) ? resetAtMs : null;
};

const isLegacyAuthRestrictionActive = (file: AuthFileItem): boolean => {
  if (file.unavailable === true) return true;
  const status = normalizeTagValue(file.status);
  if (status === "error") return true;
  return parseDateLikeMs(file.next_retry_after) !== null;
};

const getAuthLevelRestrictions = (file: AuthFileItem): AuthFileRestriction[] =>
  (Array.isArray(file.restrictions) ? file.restrictions : []).filter(
    (restriction) => normalizeTagValue(restriction.scope) !== "model",
  );

const readRestrictionHttpStatus = (restriction: AuthFileRestriction): number | null => {
  const status = Number(restriction.http_status);
  return Number.isFinite(status) && status > 0 ? Math.round(status) : null;
};

const normalizeClaudeOAuthHealthToken = (value: unknown): string =>
  normalizeTagValue(value).replace(/_/g, "-");

export type ClaudeOAuthHealthBadge = {
  key: "refresh-pending" | "five-hour-limited" | "seven-day-limited";
  label: "OAuth refresh pending" | "5h limited" | "7d limited";
  tone: "danger" | "warning";
  status?: string;
  reason?: string;
  resetAtMs?: number;
  utilization?: number;
};

const CLAUDE_OAUTH_429_REASONS = new Set([
  "anthropic-5h-window-exhausted",
  "anthropic-7d-window-exhausted",
]);

const CLAUDE_OAUTH_LIMITED_WINDOW_STATUSES = new Set([
  "blocked",
  "error",
  "exceeded",
  "limited",
  "rate-limited",
  "rejected",
]);

const isClaudeOAuthHealthWindowLimited = (window: ClaudeOAuthHealthWindow | undefined): boolean => {
  if (!window) return false;
  const status = normalizeClaudeOAuthHealthToken(window.status);
  const utilization = readOptionalNumber(window.utilization);
  return (
    window.exceeded === true ||
    window.surpassed_threshold === true ||
    (utilization !== undefined && utilization >= 1) ||
    CLAUDE_OAUTH_LIMITED_WINDOW_STATUSES.has(status)
  );
};

export const isClaudeOAuthAuthFile = (file: AuthFileItem): boolean => {
  if (normalizeProviderKey(resolveFileType(file)) !== "claude") return false;
  const accountType = normalizeClaudeOAuthHealthToken(file.account_type);
  if (accountType) return accountType === "oauth";
  const health = sanitizeClaudeOAuthHealthForCache(file.claude_oauth_health);
  if (!health) return false;
  return Boolean(
    health.enabled === true ||
    health.refresh_available === true ||
    health.last_runtime_status ||
    normalizeClaudeOAuthHealthToken(health.status),
  );
};

export const resolveClaudeOAuthHealth = (file: AuthFileItem): ClaudeOAuthHealth | null => {
  if (!isClaudeOAuthAuthFile(file)) return null;
  return sanitizeClaudeOAuthHealthForCache(file.claude_oauth_health) ?? null;
};

const hasClaudeOAuthAuthFailure = (health: ClaudeOAuthHealth | null): boolean => {
  if (!health) return false;
  const status = normalizeClaudeOAuthHealthToken(health.status);
  const reason = normalizeClaudeOAuthHealthToken(health.temporary_unschedulable_reason);
  return (
    health.last_runtime_status === 401 ||
    health.last_runtime_status === 403 ||
    status === "refresh-pending" ||
    reason === "oauth-401"
  );
};

const hasClaudeOAuthRateLimit = (health: ClaudeOAuthHealth | null): boolean => {
  if (!health) return false;
  const reason = normalizeClaudeOAuthHealthToken(health.temporary_unschedulable_reason);
  return (
    health.last_runtime_status === 429 ||
    CLAUDE_OAUTH_429_REASONS.has(reason) ||
    isClaudeOAuthHealthWindowLimited(health.windows?.five_hour) ||
    isClaudeOAuthHealthWindowLimited(health.windows?.seven_day)
  );
};

export const resolveClaudeOAuthHealthBadges = (
  file: AuthFileItem,
  nowMs = Date.now(),
): ClaudeOAuthHealthBadge[] => {
  const health = resolveClaudeOAuthHealth(file);
  if (!health) return [];

  const badges: ClaudeOAuthHealthBadge[] = [];
  const reason = readOptionalString(health.temporary_unschedulable_reason);
  const temporaryUntilMs = parseDateLikeMs(health.temporary_unschedulable_until);
  if (
    hasClaudeOAuthAuthFailure(health) &&
    (temporaryUntilMs === null || temporaryUntilMs > nowMs)
  ) {
    badges.push({
      key: "refresh-pending",
      label: "OAuth refresh pending",
      tone: "warning",
      ...(health.status ? { status: health.status } : {}),
      ...(reason ? { reason } : {}),
      ...(temporaryUntilMs !== null ? { resetAtMs: temporaryUntilMs } : {}),
    });
  }

  const appendWindowBadge = (
    windowKey: "five-hour-limited" | "seven-day-limited",
    label: "5h limited" | "7d limited",
    window: ClaudeOAuthHealthWindow | undefined,
  ) => {
    if (!isClaudeOAuthHealthWindowLimited(window)) return;
    const resetAtMs = parseDateLikeMs(window?.reset_at);
    const utilization = readOptionalNumber(window?.utilization);
    badges.push({
      key: windowKey,
      label,
      tone: "danger",
      ...(window?.status ? { status: window.status } : {}),
      ...(resetAtMs !== null ? { resetAtMs } : {}),
      ...(utilization !== undefined ? { utilization } : {}),
    });
  };

  appendWindowBadge("five-hour-limited", "5h limited", health.windows?.five_hour);
  appendWindowBadge("seven-day-limited", "7d limited", health.windows?.seven_day);

  return badges;
};

const hasRestrictionErrorSignal = (restriction: AuthFileRestriction): boolean => {
  if (readRestrictionHttpStatus(restriction) !== null) return true;
  if (restriction.unavailable === true || restriction.quota_exceeded === true) return true;
  if (normalizeTagValue(restriction.status) === "error") return true;
  return Boolean(
    String(restriction.reason ?? restriction.code ?? restriction.status_message ?? "").trim(),
  );
};

export const resolveAuthFileStatusBuckets = (file: AuthFileItem): Set<AuthFileStatusFilter> => {
  const buckets = new Set<AuthFileStatusFilter>();
  if (file.disabled === true) buckets.add("disabled");
  const claudeOAuthHealth = resolveClaudeOAuthHealth(file);

  const restrictions = getAuthLevelRestrictions(file);
  const statuses = restrictions
    .map(readRestrictionHttpStatus)
    .filter((status): status is number => status !== null);

  const has429 = statuses.includes(429) || hasClaudeOAuthRateLimit(claudeOAuthHealth);
  const hasAuthError =
    statuses.some((status) => status === 401 || status === 403) ||
    hasClaudeOAuthAuthFailure(claudeOAuthHealth);
  const hasServerError = statuses.some((status) => status >= 500);
  const hasOtherHttpError = statuses.some(
    (status) => status !== 429 && status !== 401 && status !== 403 && status < 500,
  );

  if (has429) buckets.add("http-429");
  if (hasAuthError) buckets.add("http-auth");
  if (hasServerError) buckets.add("http-5xx");

  const hasErrorSignal =
    isLegacyAuthRestrictionActive(file) || restrictions.some(hasRestrictionErrorSignal);
  if (hasErrorSignal && ((!has429 && !hasAuthError && !hasServerError) || hasOtherHttpError)) {
    buckets.add("other-error");
  }

  return buckets;
};

export const authFileMatchesStatusFilter = (
  file: AuthFileItem,
  statusFilter: AuthFileStatusFilter,
): boolean => {
  if (statusFilter === "all") return true;
  return resolveAuthFileStatusBuckets(file).has(statusFilter);
};

export const formatAuthFileRestrictionRemaining = (
  recoverAtMs: number,
  nowMs = Date.now(),
  labels: { day: string; hour: string; minute: string; second: string } = {
    day: "d",
    hour: "h",
    minute: "m",
    second: "s",
  },
): string => {
  let seconds = Math.max(0, Math.ceil((recoverAtMs - nowMs) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}${labels.day}`);
  if (hours) parts.push(`${hours}${labels.hour}`);
  if (minutes) parts.push(`${minutes}${labels.minute}`);
  parts.push(`${seconds || 1}${labels.second}`);
  return parts.join(" ");
};

const resolveRestrictionLabel = (restriction: AuthFileRestriction): string => {
  const status = Number(restriction.http_status);
  if (Number.isFinite(status) && status > 0) return `${Math.round(status)} Error`;
  if (restriction.quota_exceeded || restriction.reason === "quota") return "Quota Limited";
  return "Restricted";
};

const resolveRestrictionTone = (
  restriction: AuthFileRestriction,
): AuthFileRestrictionBadge["tone"] => {
  const status = Number(restriction.http_status);
  if (status === 401 || status === 403 || status === 429 || restriction.quota_exceeded) {
    return "danger";
  }
  if (status >= 500 || restriction.retryable) return "warning";
  return "neutral";
};

const isQuotaRestriction = (restriction: AuthFileRestriction): boolean => {
  const status = Number(restriction.http_status);
  if (status === 429) return true;
  if (restriction.quota_exceeded || normalizeTagValue(restriction.reason) === "quota") return true;
  const message = String(restriction.status_message ?? "").toLowerCase();
  return message.includes("usage_limit") || message.includes("usage limit");
};

const normalizeRestrictionQuotaWindow = (restriction: AuthFileRestriction): string => {
  const raw = normalizeTagValue(restriction.quota_window);
  if (raw === "5h" || raw === "five_hour" || raw === "five-hour" || raw === "primary") {
    return "5h";
  }
  if (raw === "week" || raw === "weekly" || raw === "7d" || raw === "secondary") {
    return "week";
  }
  const minutes = Number(restriction.quota_window_minutes);
  if (minutes === 300) return "5h";
  if (minutes === 10080) return "week";
  return raw;
};

const resolveRestrictionReason = (restriction: AuthFileRestriction): string => {
  const rawMessage = String(restriction.status_message || "").trim();
  if (rawMessage) {
    try {
      const parsed = JSON.parse(rawMessage) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const error = record.error;
        if (error && typeof error === "object" && !Array.isArray(error)) {
          const errorRecord = error as Record<string, unknown>;
          const message = String(errorRecord.message ?? "").trim();
          if (message) return message;
          const type = String(errorRecord.type ?? "").trim();
          if (type && type !== "usage_limit_reached") return type;
        }
        const topMessage = String(record.message ?? "").trim();
        if (topMessage) return topMessage;
      }
    } catch {
      // Keep raw non-JSON upstream bodies (often the full 429 text).
      return rawMessage;
    }
  }
  const reason = String(restriction.reason || restriction.code || "").trim();
  if (reason && reason !== "quota") return reason;
  const status = Number(restriction.http_status);
  if (status === 429) {
    // quota reason alone is not user-facing; surface a clear rate-limit label.
    return "rate limited (HTTP 429)";
  }
  if (reason) return reason;
  if (Number.isFinite(status) && status > 0) return `HTTP ${Math.round(status)}`;
  return "";
};

export const resolveAuthFileRestrictionBadges = (
  file: AuthFileItem,
  nowMs = Date.now(),
  weeklyResetAtMs?: number | null,
): AuthFileRestrictionBadge[] => {
  const rawRestrictions = Array.isArray(file.restrictions) ? file.restrictions : [];
  const displayableRawRestrictions = rawRestrictions.filter((restriction) => {
    const scope = normalizeTagValue(restriction.scope);
    if (scope === "model") return false;
    const status = Number(restriction.http_status);
    if (status >= 500) return false;
    return true;
  });
  const restrictions =
    rawRestrictions.length > 0
      ? displayableRawRestrictions
      : isLegacyAuthRestrictionActive(file)
        ? [
            {
              scope: "auth",
              status: file.status,
              status_message: file.status_message,
              unavailable: file.unavailable,
              next_retry_after: file.next_retry_after,
            },
          ]
        : [];

  return restrictions
    .map((restriction): AuthFileRestrictionBadge | null => {
      const recoverAtMs = resolveRestrictionRecoverAtMs(restriction, nowMs, weeklyResetAtMs);
      if (recoverAtMs !== null && recoverAtMs <= nowMs) return null;
      const model = typeof restriction.model === "string" ? restriction.model.trim() : "";
      const reason = resolveRestrictionReason(restriction);
      const restrictionDateKey =
        typeof restriction.next_retry_after === "string" ||
        typeof restriction.next_retry_after === "number"
          ? String(restriction.next_retry_after)
          : typeof restriction.next_recover_at === "string" ||
              typeof restriction.next_recover_at === "number"
            ? String(restriction.next_recover_at)
            : "";
      // Prefer raw restriction timestamps for key stability; weekly_limit only fills gaps.
      const dateKey =
        restrictionDateKey || (recoverAtMs !== null ? String(recoverAtMs) : "");
      const status = Number(restriction.http_status);
      const statusKey = Number.isFinite(status) && status > 0 ? String(Math.round(status)) : "";
      const quotaWindow = normalizeRestrictionQuotaWindow(restriction);
      const quotaWindowMinutes = Number(restriction.quota_window_minutes);
      const quotaLimited = isQuotaRestriction(restriction);
      const key = [
        restriction.scope || "auth",
        model,
        statusKey || restriction.reason || restriction.status || "restricted",
        dateKey,
      ].join(":");
      return {
        key,
        label: resolveRestrictionLabel(restriction),
        ...(model ? { model } : {}),
        ...(reason ? { reason } : {}),
        ...(quotaWindow ? { quotaWindow } : {}),
        ...(Number.isFinite(quotaWindowMinutes) && quotaWindowMinutes > 0
          ? { quotaWindowMinutes }
          : {}),
        ...(quotaLimited ? { quotaLimited: true } : {}),
        ...(recoverAtMs !== null
          ? {
              recoverAtMs,
              remainingText: formatAuthFileRestrictionRemaining(recoverAtMs, nowMs),
            }
          : {}),
        tone: resolveRestrictionTone(restriction),
      };
    })
    .filter((badge): badge is AuthFileRestrictionBadge => Boolean(badge));
};

export type AuthFileSubscriptionStatus = {
  startedAtMs: number;
  startedAtText: string;
  expiresAtMs: number;
  expiresAtText: string;
  remainingDays: number;
  expired: boolean;
  period: AuthFileSubscriptionPeriod;
  tone: "active" | "warning" | "urgent" | "expired";
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeAuthFileSubscriptionPeriod = (value: unknown): AuthFileSubscriptionPeriod => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "year" || normalized === "yearly" || normalized === "annual") {
    return "yearly";
  }
  return "monthly";
};

const resolveSubscriptionStartMs = (file: AuthFileItem): number | null =>
  parseDateLikeMs(file.subscription_started_at_ms ?? file.subscriptionStartedAtMs) ??
  parseDateLikeMs(
    file.subscription_started_at ??
      file.subscriptionStartedAt ??
      file.subscription_start_at ??
      file.subscriptionStartAt,
  );

const addCalendarMonths = (startMs: number, months: number): number | null => {
  const date = new Date(startMs);
  if (Number.isNaN(date.getTime())) return null;

  const day = date.getDate();
  const result = new Date(startMs);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));

  return Number.isNaN(result.getTime()) ? null : result.getTime();
};

export const resolveAuthFileSubscriptionStatus = (
  file: AuthFileItem,
  nowMs = Date.now(),
): AuthFileSubscriptionStatus | null => {
  const startedAtMs = resolveSubscriptionStartMs(file);
  if (startedAtMs === null) return null;

  const period = normalizeAuthFileSubscriptionPeriod(
    file.subscription_period ?? file.subscriptionPeriod,
  );
  const expiresAtMs = addCalendarMonths(startedAtMs, period === "yearly" ? 12 : 1);
  if (expiresAtMs === null) return null;

  const diffMs = expiresAtMs - nowMs;
  const remainingDays =
    diffMs === 0
      ? 0
      : diffMs > 0
        ? Math.ceil(diffMs / DAY_MS)
        : -Math.ceil(Math.abs(diffMs) / DAY_MS);
  const expired = remainingDays <= 0;
  const tone = expired ? "expired" : remainingDays <= 5 ? "urgent" : "active";

  return {
    startedAtMs,
    startedAtText: new Date(startedAtMs).toLocaleString(),
    expiresAtMs,
    expiresAtText: new Date(expiresAtMs).toLocaleString(),
    remainingDays,
    expired,
    period,
    tone,
  };
};

const padDatePart = (value: number): string => String(value).padStart(2, "0");

export const dateLikeToDateTimeLocalInput = (value: unknown): string => {
  const ms = parseDateLikeMs(value);
  if (ms === null) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");
};

export const dateTimeLocalInputToIso = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const normalizeProviderKey = (value: string): string => value.trim().toLowerCase();

export const normalizeTagValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, "-").toLowerCase();
};

export const normalizeTagList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  value.forEach((entry) => {
    const normalized = normalizeTagValue(entry);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(normalized);
  });
  return tags;
};

export const buildAuthFileDisplayTags = (
  defaultTags: string[],
  customTags: string[],
  hiddenDefaultTags: string[],
): string[] => {
  const hiddenSet = new Set(normalizeTagList(hiddenDefaultTags));
  return normalizeTagList([
    ...normalizeTagList(defaultTags).filter((tag) => !hiddenSet.has(tag)),
    ...normalizeTagList(customTags),
  ]);
};

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const matchesModelPattern = (modelId: string, pattern: string): boolean => {
  const rawModel = String(modelId ?? "").trim();
  const rawPattern = String(pattern ?? "").trim();
  if (!rawModel || !rawPattern) return false;

  if (!rawPattern.includes("*")) {
    return rawModel.toLowerCase() === rawPattern.toLowerCase();
  }

  const escaped = escapeRegExp(rawPattern).replace(/\\\*/g, ".*");
  try {
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(rawModel);
  } catch {
    return false;
  }
};

export const TYPE_BADGE_CLASSES: Record<string, string> = {
  qwen: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  kimi: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  gemini: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  "gemini-cli": "bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200",
  aistudio: "bg-slate-50 text-slate-800 dark:bg-white/10 dark:text-slate-200",
  claude: "bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  codex: "bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
  antigravity: "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
  iflow: "bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
  vertex: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-200",
  empty: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
  unknown: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
};

/** Membership plan pills: solid/gradient chips, never the soft sky/amber tag look. */
export const PLAN_BADGE_CLASSES: Record<string, string> = {
  // Codex Plus: silver / platinum
  plus: "bg-gradient-to-r from-slate-100 via-zinc-200 to-slate-300 text-slate-800 ring-1 ring-inset ring-slate-300/70 shadow-sm shadow-slate-400/20 dark:from-zinc-300 dark:via-slate-400 dark:to-zinc-500 dark:text-slate-950 dark:ring-white/20",
  // Codex Pro family: gold scale (base / 5X / 20X)
  pro: "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-amber-950 shadow-sm shadow-amber-500/30 dark:from-amber-300 dark:via-yellow-400 dark:to-amber-500 dark:text-amber-950",
  pro_5x:
    "bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-400 text-amber-950 shadow-sm shadow-amber-500/35 dark:from-amber-400 dark:via-yellow-400 dark:to-orange-400 dark:text-amber-950",
  "pro-5x":
    "bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-400 text-amber-950 shadow-sm shadow-amber-500/35 dark:from-amber-400 dark:via-yellow-400 dark:to-orange-400 dark:text-amber-950",
  pro_20x:
    "bg-gradient-to-r from-yellow-300 via-amber-500 to-orange-600 text-amber-950 shadow-sm shadow-orange-500/40 dark:from-yellow-300 dark:via-amber-400 dark:to-orange-500 dark:text-amber-950",
  "pro-20x":
    "bg-gradient-to-r from-yellow-300 via-amber-500 to-orange-600 text-amber-950 shadow-sm shadow-orange-500/40 dark:from-yellow-300 dark:via-amber-400 dark:to-orange-500 dark:text-amber-950",
  chatgptpro:
    "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-amber-950 shadow-sm shadow-amber-500/30 dark:from-amber-300 dark:via-yellow-400 dark:to-amber-500 dark:text-amber-950",
  free: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80 dark:bg-white/10 dark:text-white/65 dark:ring-white/10",
  team: "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm shadow-violet-500/25 dark:from-violet-400 dark:to-indigo-500",
  // Claude Code family: warm clay / copper
  max: "bg-gradient-to-r from-orange-400 via-amber-500 to-orange-600 text-white shadow-sm shadow-orange-500/30 dark:from-orange-400 dark:via-amber-500 dark:to-orange-500",
  max_5x:
    "bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 text-white shadow-sm shadow-orange-500/35 dark:from-orange-400 dark:via-amber-400 dark:to-rose-400",
  "max-5x":
    "bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 text-white shadow-sm shadow-orange-500/35 dark:from-orange-400 dark:via-amber-400 dark:to-rose-400",
  max_20x:
    "bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 text-white shadow-sm shadow-rose-500/35 dark:from-amber-400 dark:via-orange-500 dark:to-rose-500",
  "max-20x":
    "bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 text-white shadow-sm shadow-rose-500/35 dark:from-amber-400 dark:via-orange-500 dark:to-rose-500",
  premium: "bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm shadow-fuchsia-500/25 dark:from-fuchsia-400 dark:to-purple-500",
  business: "bg-gradient-to-r from-slate-700 to-slate-900 text-white shadow-sm shadow-slate-900/20 dark:from-slate-500 dark:to-slate-700",
  enterprise: "bg-gradient-to-r from-zinc-800 via-slate-900 to-black text-amber-100 shadow-sm shadow-black/20 dark:from-zinc-600 dark:via-slate-700 dark:to-zinc-900",
  // Grok: dark emerald
  supergrok:
    "bg-gradient-to-r from-neutral-900 to-emerald-700 text-emerald-50 shadow-sm shadow-emerald-900/30 dark:from-neutral-800 dark:to-emerald-600",
  "supergrok-heavy":
    "bg-gradient-to-r from-black via-emerald-900 to-teal-700 text-emerald-50 shadow-sm shadow-emerald-950/40 dark:from-black dark:via-emerald-800 dark:to-teal-600",
  supergrok_heavy:
    "bg-gradient-to-r from-black via-emerald-900 to-teal-700 text-emerald-50 shadow-sm shadow-emerald-950/40 dark:from-black dark:via-emerald-800 dark:to-teal-600",
  supergrokheavy:
    "bg-gradient-to-r from-black via-emerald-900 to-teal-700 text-emerald-50 shadow-sm shadow-emerald-950/40 dark:from-black dark:via-emerald-800 dark:to-teal-600",
  unknown:
    "bg-gradient-to-r from-slate-400 to-slate-500 text-white shadow-sm shadow-slate-500/20 dark:from-slate-500 dark:to-slate-600",
};

/** Codex-only: weekly budget (USD) thresholds for Pro multiplier badges. */
export const CODEX_PRO_20X_WEEKLY_BUDGET_USD = 1000;
export const CODEX_PRO_5X_WEEKLY_BUDGET_USD = 200;

export type AuthFileCycleBudgetStats = {
  cycleCostTotal?: number | null;
  weeklyQuotaUsedPercent?: number | null;
};

/** cost / (used%/100) → estimated full-window budget; null when underdetermined. */
export const estimateQuotaBudgetUsd = (
  cost: number | null | undefined,
  usedPercent: number | null | undefined,
): number | null => {
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) return null;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) return null;
  const normalizedUsed = Math.min(100, Math.max(0, usedPercent));
  if (normalizedUsed <= 0) return null;
  return cost / (normalizedUsed / 100);
};

/**
 * Codex Pro only: map estimated weekly USD budget → pro_20x / pro_5x / pro.
 * Non-pro base plans pass through unchanged; missing budget falls back to plain pro.
 */
export const resolveCodexProMultiplierTier = (
  basePlan: string | null | undefined,
  estimatedWeeklyBudgetUsd: number | null | undefined,
): string | null => {
  const base = normalizeTagValue(basePlan);
  if (!base) return null;
  if (base === "pro_20x" || base === "pro-20x") return "pro_20x";
  if (base === "pro_5x" || base === "pro-5x") return "pro_5x";
  if (base !== "pro" && base !== "chatgptpro") return base;
  if (
    typeof estimatedWeeklyBudgetUsd !== "number" ||
    !Number.isFinite(estimatedWeeklyBudgetUsd) ||
    estimatedWeeklyBudgetUsd <= 0
  ) {
    return "pro";
  }
  if (estimatedWeeklyBudgetUsd >= CODEX_PRO_20X_WEEKLY_BUDGET_USD) return "pro_20x";
  if (estimatedWeeklyBudgetUsd >= CODEX_PRO_5X_WEEKLY_BUDGET_USD) return "pro_5x";
  return "pro";
};

export const resolveAuthFileDisplayPlanType = (
  file: AuthFileItem,
  quotaState?: QuotaState | null,
  cycleStats?: AuthFileCycleBudgetStats | null,
): string | null => {
  const base = resolveAuthFilePlanType(file, quotaState);
  if (!base) return null;
  if (normalizeProviderKey(resolveFileType(file)) !== "codex") return base;
  const budget = estimateQuotaBudgetUsd(
    cycleStats?.cycleCostTotal,
    cycleStats?.weeklyQuotaUsedPercent,
  );
  return resolveCodexProMultiplierTier(base, budget);
};

export const resolvePlanBadgeClass = (planType: string | null | undefined): string => {
  const normalized = normalizeTagValue(planType);
  if (!normalized) return PLAN_BADGE_CLASSES.unknown;
  if (normalized === "chatgptpro") return PLAN_BADGE_CLASSES.pro;
  return PLAN_BADGE_CLASSES[normalized] ?? PLAN_BADGE_CLASSES.unknown;
};

/** Short membership chip copy (PRO / PLUS / PRO 20X), distinct from soft info tags. */
export const formatPlanBadgeLabel = (planType: string | null | undefined): string => {
  const normalized = normalizeTagValue(planType);
  if (!normalized) return "";
  if (
    normalized === "supergrok-heavy" ||
    normalized === "supergrok_heavy" ||
    normalized === "supergrokheavy"
  ) {
    return "SUPERGROK HEAVY";
  }
  if (normalized === "supergrok") return "SUPERGROK";
  if (normalized === "free") return "FREE";
  if (normalized === "plus") return "PLUS";
  if (normalized === "pro_20x" || normalized === "pro-20x") return "PRO 20X";
  if (normalized === "pro_5x" || normalized === "pro-5x") return "PRO 5X";
  if (normalized === "pro" || normalized === "chatgptpro") return "PRO";
  if (normalized === "max_20x" || normalized === "max-20x") return "MAX 20X";
  if (normalized === "max_5x" || normalized === "max-5x") return "MAX 5X";
  if (normalized === "max") return "MAX";
  if (normalized === "team") return "TEAM";
  if (normalized === "premium") return "PREMIUM";
  if (normalized === "business") return "BUSINESS";
  if (normalized === "enterprise") return "ENTERPRISE";
  return normalized.replace(/[-_]+/g, " ").toUpperCase();
};

const KNOWN_AUTH_FILE_PROVIDER_KEYS = Object.keys(TYPE_BADGE_CLASSES)
  .filter((key) => key !== "empty" && key !== "unknown")
  .sort((left, right) => right.length - left.length);

const trimAuthFileExtension = (name: string): string =>
  String(name ?? "")
    .trim()
    .replace(/\.[^.]+$/u, "");

const matchKnownAuthFileProviderKey = (value: string): string => {
  const normalized = normalizeProviderKey(value);
  if (!normalized) return "";
  return (
    KNOWN_AUTH_FILE_PROVIDER_KEYS.find(
      (providerKey) => normalized === providerKey || normalized.startsWith(`${providerKey}-`),
    ) ?? ""
  );
};

export const resolveFileType = (file: AuthFileItem): string => {
  const type = typeof file.type === "string" ? file.type : "";
  const provider = typeof file.provider === "string" ? file.provider : "";
  const directMatch =
    matchKnownAuthFileProviderKey(type) || matchKnownAuthFileProviderKey(provider);
  if (directMatch) return directMatch;

  const explicitCandidate = normalizeProviderKey(type || provider);
  if (explicitCandidate) return explicitCandidate;

  const fromName = trimAuthFileExtension(String(file.name || ""));
  const nameMatch = matchKnownAuthFileProviderKey(fromName);
  if (nameMatch) return nameMatch;

  return normalizeProviderKey(fromName) || "unknown";
};

export const resolveProviderLabel = (providerKey: string): string => {
  const normalized = normalizeProviderKey(providerKey);
  if (!normalized || normalized === "all") return "All";
  return normalized.replace(
    /(^|-)([a-z])/g,
    (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`,
  );
};

export const formatTrendDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const buildLast7DayAxis = () => {
  const result: { date: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = formatTrendDateKey(date);
    result.push({ date: key, label: key.slice(5) });
  }
  return result;
};

const codexFilenamePlanSuffixes = new Set([
  "plus",
  "pro",
  "free",
  "team",
  "premium",
  "business",
  "enterprise",
]);

const readCodexFilenameChannelName = (fileName: string): string => {
  const normalized = String(fileName ?? "")
    .trim()
    .toLowerCase();
  const base = trimAuthFileExtension(normalized);
  if (!base.startsWith("codex-")) return "";
  const rest = base.slice("codex-".length);
  if (!rest) return "";
  const parts = rest.split("-").filter(Boolean);
  if (parts.length === 0) return "";

  const emailIndex = parts.findIndex((part) => part.includes("@"));
  if (emailIndex >= 0) {
    return parts[emailIndex] ?? "";
  }

  const lastPart = parts.at(-1) ?? "";
  if (codexFilenamePlanSuffixes.has(lastPart) && parts.length > 1) {
    return parts.slice(0, -1).join("-");
  }

  return "";
};

const readCodexFilenamePlanType = (fileName: string): string | null => {
  const normalized = String(fileName ?? "")
    .trim()
    .toLowerCase();
  const base = trimAuthFileExtension(normalized);
  if (!base.startsWith("codex-")) return null;
  const rest = base.slice("codex-".length);
  if (!rest) return null;
  const parts = rest.split("-").filter(Boolean);
  const lastPart = parts.at(-1) ?? "";
  return codexFilenamePlanSuffixes.has(lastPart) ? lastPart : null;
};

export const readAuthFileChannelName = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (normalizeProviderKey(resolveFileType(file)) === "codex") {
    const fromName = readCodexFilenameChannelName(String(file.name || ""));
    if (fromName) return fromName;
  }
  return "";
};

export const isOauthAuthFile = (file: AuthFileItem): boolean =>
  String(file.account_type || "")
    .trim()
    .toLowerCase() === "oauth";

export const canRenameAuthFileChannel = (file: AuthFileItem): boolean =>
  isOauthAuthFile(file) ||
  normalizeProviderKey(resolveFileType(file)) === "kimi" ||
  normalizeProviderKey(resolveFileType(file)) === "codex";

export const resolveAuthFileDisplayName = (file: AuthFileItem): string => {
  const channelName = readAuthFileChannelName(file);
  if (canRenameAuthFileChannel(file) && channelName) return channelName;
  return String(file.name || "");
};

export const resolveAuthFileSortKey = (file: AuthFileItem): string => {
  const channelName = readAuthFileChannelName(file);
  const fileName = String(file.name || "").trim();
  return `${channelName || fileName}\u0000${fileName}`;
};

export const authFilesSortCollator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

export const readAuthFileDefaultTags = (file: AuthFileItem): string[] =>
  normalizeTagList(file.default_tags);

export const readAuthFileCustomTags = (file: AuthFileItem): string[] =>
  normalizeTagList(file.custom_tags);

export const readAuthFileHiddenDefaultTags = (file: AuthFileItem): string[] =>
  normalizeTagList(file.hidden_default_tags);

export const readAuthFileTagCandidates = (file: AuthFileItem): string[] =>
  normalizeTagList([
    ...readAuthFileDefaultTags(file),
    ...readAuthFileCustomTags(file),
    ...resolveAuthFileDisplayTags(file),
  ]);

export const resolveAuthFileDisplayTags = (file: AuthFileItem): string[] => {
  if (Array.isArray(file.display_tags)) {
    const displayTags = normalizeTagList(file.display_tags);
    const candidates = normalizeTagList([
      ...readAuthFileDefaultTags(file),
      ...readAuthFileCustomTags(file),
    ]);
    if (candidates.length === 0) return displayTags;
    const candidateSet = new Set(candidates);
    return displayTags.filter((tag) => candidateSet.has(normalizeTagValue(tag)));
  }
  return buildAuthFileDisplayTags(
    readAuthFileDefaultTags(file),
    readAuthFileCustomTags(file),
    readAuthFileHiddenDefaultTags(file),
  );
};

export const shouldShowAuthFileDisplayTag = (file: AuthFileItem, tag: unknown): boolean => {
  const normalizedTag = normalizeTagValue(tag);
  if (!normalizedTag) return false;

  if (Array.isArray(file.display_tags)) {
    return resolveAuthFileDisplayTags(file).includes(normalizedTag);
  }

  return !readAuthFileHiddenDefaultTags(file).includes(normalizedTag);
};

export const resolveAuthFilePlanType = (
  file: AuthFileItem,
  quotaState?: QuotaState | null,
): string | null =>
  resolveCodexPlanType(file) ??
  readCodexFilenamePlanType(String(file.name || "")) ??
  normalizePlanType(quotaState?.planType);

/**
 * Plan badges may come from auth-file tags (Codex plus/pro) or quota state (xAI SuperGrok).
 * Only enforce display_tags visibility when the plan is part of the file's default tags;
 * quota-derived plans are always shown when resolved.
 */
export const shouldShowAuthFilePlanBadge = (
  file: AuthFileItem,
  planType: string | null | undefined,
): boolean => {
  const normalized = normalizeTagValue(planType);
  if (!normalized) return false;
  const defaultTags = readAuthFileDefaultTags(file);
  if (defaultTags.includes(normalized)) {
    return shouldShowAuthFileDisplayTag(file, normalized);
  }
  return true;
};

export const resolveAuthFileSupplementalTags = (
  file: AuthFileItem,
  quotaState?: QuotaState | null,
): string[] => {
  const hiddenByPrimaryBadges = new Set<string>();
  const typeTag = normalizeTagValue(resolveFileType(file));
  if (typeTag) hiddenByPrimaryBadges.add(typeTag);
  const planTag = normalizeTagValue(resolveAuthFilePlanType(file, quotaState) ?? "");
  if (planTag) hiddenByPrimaryBadges.add(planTag);
  return resolveAuthFileDisplayTags(file).filter(
    (tag) => !hiddenByPrimaryBadges.has(normalizeTagValue(tag)),
  );
};

export const isRuntimeOnlyAuthFile = (file: AuthFileItem): boolean => {
  const raw = (file.runtime_only ?? file.runtimeOnly) as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};

export const normalizeAuthIndexValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

export const downloadTextAsFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  downloadBlobAsFile(blob, filename);
};

export const downloadBlobAsFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
};

export const normalizeQuotaLabel = (label: string): string =>
  String(label ?? "")
    .trim()
    .toLowerCase();

export const parseAdditionalQuotaWindowLabel = (
  label: string,
): { name: string; window: "5h" | "weekly" } | null => {
  const match = String(label ?? "").match(/^(.+?)\s*[:：]\s*(5h|weekly)$/i);
  if (!match) return null;
  const name = match[1]?.trim();
  if (!name) return null;
  return {
    name,
    window: match[2]?.toLowerCase() === "5h" ? "5h" : "weekly",
  };
};

export const pickQuotaPreviewItem = (
  items: QuotaItem[],
  mode: QuotaPreviewMode,
): QuotaItem | null => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const patterns =
    mode === "week"
      ? ["weekly", "week", "周", "7天", "seven_day", "seven day"]
      : ["_5h", "5h", "5小时", "five_hour", "five hour"];

  const match = items.find((item) => {
    const key = normalizeQuotaLabel(item.label);
    return patterns.some((p) => key.includes(normalizeQuotaLabel(p)));
  });

  return match ?? items[0] ?? null;
};

export const normalizeQuotaAutoRefreshMs = (value: unknown): QuotaAutoRefreshMs => {
  const parsed = typeof value === "number" ? value : Number(value);
  // Default Off: never auto-fan-out on first visit.
  if (!Number.isFinite(parsed)) return 0;
  const rounded = Math.max(0, Math.round(parsed));
  if (rounded === 0) return 0;
  // Legacy 5s/10s/30s (and any sub-minute) → 60s so old localStorage cannot resume storms.
  if (rounded > 0 && rounded < 60_000) return 60_000;
  if (rounded === 60_000) return 60_000;
  if (rounded === 300_000) return 300_000;
  // Anything else ≥ 60s clamps to nearest allowed bucket (prefer 60s over inventing intervals).
  if (rounded > 60_000 && rounded < 300_000) return 60_000;
  if (rounded >= 300_000) return 300_000;
  return 0;
};

/** Read + migrate auto-refresh localStorage immediately (write-back allowed buckets only). */
export const readAndMigrateQuotaAutoRefreshMs = (
  storageKey: string = AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
): QuotaAutoRefreshMs => {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) {
      window.localStorage.setItem(storageKey, JSON.stringify(0));
      return 0;
    }
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      // keep raw string
    }
    const normalized = normalizeQuotaAutoRefreshMs(parsed);
    const rawNumber =
      typeof parsed === "number"
        ? parsed
        : typeof parsed === "string"
          ? Number(parsed)
          : Number.NaN;
    if (!Number.isFinite(rawNumber) || rawNumber !== normalized) {
      window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return 0;
  }
};

export type UsageIndex = {
  statsBySource: Record<string, KeyStatBucket>;
  statsByAuthIndex: Record<string, KeyStatBucket>;
};

export const buildUsageIndex = (usage: EntityStatsResponse | null): { index: UsageIndex } => {
  const statsBySource: Record<string, KeyStatBucket> = {};
  const statsByAuthIndex: Record<string, KeyStatBucket> = {};

  if (usage?.source) {
    usage.source.forEach((pt) => {
      const src = normalizeUsageSourceId(pt.entity_name, (v) => v);
      if (src) {
        statsBySource[src] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  if (usage?.auth_index) {
    usage.auth_index.forEach((pt) => {
      const idx = normalizeAuthIndexValue(pt.entity_name);
      if (idx) {
        statsByAuthIndex[idx] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  return { index: { statsBySource, statsByAuthIndex } };
};

export const buildAuthFileSourceCandidates = (file: AuthFileItem): string[] => {
  const rawName = String(file.name || "").trim();
  if (!rawName) return [];
  const withoutExt = rawName.replace(/\.[^/.]+$/, "");
  const list = [
    normalizeUsageSourceId(rawName, (v) => v),
    normalizeUsageSourceId(withoutExt, (v) => v),
  ].filter(Boolean) as string[];
  return Array.from(new Set(list));
};

export const resolveAuthFileStats = (file: AuthFileItem, index: UsageIndex): KeyStatBucket => {
  const authIndexKey = normalizeAuthIndexValue(
    file.auth_index ?? file.authIndex ?? file.authIndex ?? file.auth_index,
  );
  if (authIndexKey && index.statsByAuthIndex[authIndexKey]) {
    return index.statsByAuthIndex[authIndexKey];
  }

  const candidates = buildAuthFileSourceCandidates(file);
  let bucket: KeyStatBucket = { success: 0, failure: 0 };
  candidates.forEach((key) => {
    const entry = index.statsBySource[key];
    if (!entry) return;
    bucket = { success: bucket.success + entry.success, failure: bucket.failure + entry.failure };
  });
  return bucket;
};

export const resolveAuthFileStatusBar = (file: AuthFileItem, index: UsageIndex): StatusBarData => {
  const stats = resolveAuthFileStats(file, index);
  if (stats.success === 0 && stats.failure === 0) {
    return { blocks: [], blockDetails: [], successRate: 100, totalSuccess: 0, totalFailure: 0 };
  }

  const total = stats.success + stats.failure;
  const blockCount = 20;
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  let tempFail = stats.failure;
  let tempSuccess = stats.success;

  for (let i = 0; i < blockCount; i++) {
    const failPart = Math.floor(tempFail / (blockCount - i));
    const successPart = Math.floor(tempSuccess / (blockCount - i));
    tempFail -= failPart;
    tempSuccess -= successPart;

    if (failPart === 0 && successPart === 0) {
      blocks.push("idle");
    } else if (failPart === 0) {
      blocks.push("success");
    } else if (successPart === 0) {
      blocks.push("failure");
    } else {
      blocks.push("mixed");
    }

    blockDetails.push({
      success: successPart,
      failure: failPart,
      rate: successPart + failPart > 0 ? successPart / (successPart + failPart) : -1,
      startTime: 0,
      endTime: 0,
    });
  }

  return {
    blocks,
    blockDetails,
    successRate: (stats.success / total) * 100,
    totalSuccess: stats.success,
    totalFailure: stats.failure,
  };
};

export type PrefixProxyEditorState = {
  open: boolean;
  fileName: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  json: Record<string, unknown> | null;
  prefix: string;
  proxyUrl: string;
  proxyId: string;
  subscriptionStartedAt: string;
  subscriptionPeriod: AuthFileSubscriptionPeriod;
};

export type AuthFilesGroupOverview = {
  totalCalls: number;
  averageFiveHour: number | null;
  averageWeekly: number | null;
  quotaSampleCount: number;
};

export type AuthFilesGroupOverviewRow = {
  name: string;
  totalCalls: number;
  averageFiveHour: number | null;
  averageWeekly: number | null;
  hasQuota: boolean;
};

export type AuthFilesGroupTrendPoint = {
  date: string;
  label: string;
  calls: number;
  weeklyPercent: number | null;
};

export type ChannelEditorState = {
  open: boolean;
  fileName: string;
  label: string;
  saving: boolean;
  error: string | null;
};

export type CodexOAuthAdmissionAllowedClient = {
  id: string;
  label: string;
  description?: string;
};

export type CodexOAuthAdmissionEditorState = {
  fileName: string;
  supported: boolean;
  enabled: boolean;
  allowedClients: string[];
  availableAllowedClients: CodexOAuthAdmissionAllowedClient[];
  saving: boolean;
  error: string | null;
};

export type CodexImageGenerationBridgeEditorState = {
  fileName: string;
  supported: boolean;
  enabled: boolean;
  saving: boolean;
  error: string | null;
};

/** xAI OAuth endpoint mode: false = Grok Build/CLI, true = official API. */
export type XAIEndpointEditorState = {
  fileName: string;
  supported: boolean;
  usingApi: boolean;
  saving: boolean;
  error: string | null;
};

export type AliasRow = OAuthModelAliasEntry & { id: string };

export const buildAliasRows = (entries: OAuthModelAliasEntry[] | undefined): AliasRow[] => {
  if (!entries?.length) {
    return [{ id: `row-${Date.now()}`, name: "", alias: "" }];
  }
  return entries.map((entry) => ({
    id: `row-${entry.name}-${entry.alias}-${entry.fork ? "1" : "0"}`,
    ...entry,
  }));
};
