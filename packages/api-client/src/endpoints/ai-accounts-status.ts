import { apiClient } from "../client/client";
import type {
  AiAccountLatestStatusDto,
  AiAccountQuotaItemDto,
  AiAccountsStatusSnapshotDto,
  AiAccountStatusRefreshAcceptedDto,
  AiAccountStatusRefreshAccountResultDto,
  AiAccountStatusRefreshAccountState,
  AiAccountStatusRefreshJobDto,
  AiAccountStatusRefreshJobState,
  AiAccountStatusRefreshRequest,
  AiAccountUsageSummaryDto,
} from "../dto/types";
import { isRecord, normalizeString } from "./helpers";

const AI_ACCOUNTS_STATUS_PATH = "/ai-accounts/status";
const AI_ACCOUNTS_STATUS_REFRESH_PATH = "/ai-accounts/status-refresh";

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  return undefined;
};

const normalizeQuotaItem = (value: unknown): AiAccountQuotaItemDto | null => {
  if (!isRecord(value)) return null;
  const quotaKey =
    normalizeString(value.quota_key) ??
    normalizeString(value.quotaKey) ??
    normalizeString(value.key);
  if (!quotaKey) return null;
  return {
    quota_key: quotaKey,
    quota_label:
      normalizeString(value.quota_label) ??
      normalizeString(value.quotaLabel) ??
      normalizeString(value.label) ??
      undefined,
    percent: toFiniteNumber(value.percent),
    reset_at: normalizeString(value.reset_at ?? value.resetAt),
    window_seconds: toFiniteNumber(value.window_seconds ?? value.windowSeconds),
    value: normalizeString(value.value) ?? undefined,
    meta: normalizeString(value.meta) ?? undefined,
  };
};

const normalizeUsageSummary = (value: unknown): AiAccountUsageSummaryDto | null => {
  if (!isRecord(value)) return null;
  return {
    auth_subject_id:
      normalizeString(value.auth_subject_id ?? value.authSubjectId) ??
      undefined,
    request_total: toFiniteNumber(value.request_total ?? value.requestTotal),
    success_total: toFiniteNumber(value.success_total ?? value.successTotal),
    failure_total: toFiniteNumber(value.failure_total ?? value.failureTotal),
    cost_total: toFiniteNumber(value.cost_total ?? value.costTotal),
    success_rate: toFiniteNumber(value.success_rate ?? value.successRate),
    request_total_7d: toFiniteNumber(
      value.request_total_7d ?? value.requestTotal7d,
    ),
    cost_total_7d: toFiniteNumber(value.cost_total_7d ?? value.costTotal7d),
    request_total_30d: toFiniteNumber(value.request_total_30d ?? value.requestTotal30d),
    success_total_30d: toFiniteNumber(value.success_total_30d ?? value.successTotal30d),
    failure_total_30d: toFiniteNumber(value.failure_total_30d ?? value.failureTotal30d),
    cycle_request_total: toFiniteNumber(
      value.cycle_request_total ?? value.cycleRequestTotal,
    ),
    cycle_cost_total: toFiniteNumber(value.cycle_cost_total ?? value.cycleCostTotal),
    cycle_total_tokens: toFiniteNumber(
      value.cycle_total_tokens ?? value.cycleTotalTokens,
    ),
    cycle_known: toOptionalBoolean(value.cycle_known ?? value.cycleKnown),
    cycle_start: normalizeString(value.cycle_start ?? value.cycleStart),
    projected_since: normalizeString(
      value.projected_since ?? value.projectedSince,
    ),
    history_complete: toOptionalBoolean(
      value.history_complete ?? value.historyComplete,
    ),
    weekly_quota_used_percent: toFiniteNumber(
      value.weekly_quota_used_percent ?? value.weeklyQuotaUsedPercent,
    ),
    updated_at: normalizeString(value.updated_at ?? value.updatedAt),
  };
};

/** Authoritative backend: restriction_summary is a plain string. */
const normalizeRestrictionSummary = (value: unknown): string | null => {
  if (typeof value === "string") return normalizeString(value);
  if (!isRecord(value)) return null;
  // Tolerate legacy object shapes by collapsing to a readable string.
  return (
    normalizeString(value.status_message ?? value.statusMessage) ??
    normalizeString(value.reason) ??
    normalizeString(value.status) ??
    normalizeString(value.code) ??
    null
  );
};

const normalizeSkippedAuthIndexes = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
  return items;
};

const normalizeResetCreditExpirations = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
};

export const normalizeAccountStatusView = (
  value: unknown,
): AiAccountLatestStatusDto | null => {
  if (!isRecord(value)) return null;
  const authIndex = normalizeString(value.auth_index ?? value.authIndex);
  if (!authIndex) return null;

  const quotasRaw = value.quotas;
  const quotas = Array.isArray(quotasRaw)
    ? quotasRaw
        .map(normalizeQuotaItem)
        .filter((item): item is AiAccountQuotaItemDto => item != null)
    : [];

  return {
    auth_subject_id:
      normalizeString(value.auth_subject_id ?? value.authSubjectId) ?? undefined,
    auth_index: authIndex,
    provider: normalizeString(value.provider) ?? undefined,
    status_scope:
      normalizeString(value.status_scope ?? value.statusScope) ?? undefined,
    subject_scope:
      normalizeString(value.subject_scope ?? value.subjectScope) ?? undefined,
    share_eligible: toOptionalBoolean(
      value.share_eligible ?? value.shareEligible,
    ),
    subject_seed_kind:
      normalizeString(value.subject_seed_kind ?? value.subjectSeedKind) ??
      undefined,
    current_tenant_binding_count: toFiniteNumber(
      value.current_tenant_binding_count ?? value.currentTenantBindingCount,
    ),
    refresh_state:
      normalizeString(value.refresh_state ?? value.refreshState) ?? undefined,
    health_status:
      normalizeString(value.health_status ?? value.healthStatus) ?? undefined,
    plan_type: normalizeString(value.plan_type ?? value.planType),
    restriction_summary: normalizeRestrictionSummary(
      value.restriction_summary ?? value.restrictionSummary,
    ),
    error_summary: normalizeString(value.error_summary ?? value.errorSummary),
    error_code: normalizeString(value.error_code ?? value.errorCode),
    error_message: normalizeString(value.error_message ?? value.errorMessage),
    quotas,
    usage: normalizeUsageSummary(value.usage),
    subscription_started_at: normalizeString(
      value.subscription_started_at ?? value.subscriptionStartedAt,
    ),
    subscription_expires_at: normalizeString(
      value.subscription_expires_at ?? value.subscriptionExpiresAt,
    ),
    subscription_source: normalizeString(
      value.subscription_source ?? value.subscriptionSource,
    ),
    reset_credit_count: toFiniteNumber(
      value.reset_credit_count ?? value.resetCreditCount,
    ),
    reset_credit_expirations: normalizeResetCreditExpirations(
      value.reset_credit_expirations ?? value.resetCreditExpirations,
    ),
    upstream_checked_at: normalizeString(
      value.upstream_checked_at ?? value.upstreamCheckedAt,
    ),
    usage_updated_at: normalizeString(value.usage_updated_at ?? value.usageUpdatedAt),
    expires_at: normalizeString(value.expires_at ?? value.expiresAt),
    version:
      typeof value.version === "number" || typeof value.version === "string"
        ? value.version
        : null,
    updated_at: normalizeString(value.updated_at ?? value.updatedAt),
  };
};

const normalizeSnapshot = (value: unknown): AiAccountsStatusSnapshotDto => {
  if (!isRecord(value)) {
    throw new Error("invalid_ai_accounts_status_snapshot");
  }
  // Authoritative shape: { items: AccountStatusView[] }
  if (!Array.isArray(value.items)) {
    throw new Error("invalid_ai_accounts_status_items");
  }
  const items = value.items
    .map(normalizeAccountStatusView)
    .filter((item): item is AiAccountLatestStatusDto => item != null);
  return { items };
};

const normalizeRefreshAccepted = (value: unknown): AiAccountStatusRefreshAcceptedDto => {
  if (!isRecord(value)) {
    throw new Error("invalid_status_refresh_response");
  }
  const jobId = normalizeString(value.job_id ?? value.jobId);
  if (!jobId) throw new Error("invalid_status_refresh_job_id");
  return {
    job_id: jobId,
    accepted: toFiniteNumber(value.accepted) ?? 0,
    deduplicated: toFiniteNumber(value.deduplicated) ?? 0,
    skipped: normalizeSkippedAuthIndexes(value.skipped),
  };
};

const ACCOUNT_RESULT_STATES: ReadonlyArray<AiAccountStatusRefreshAccountState> = [
  "queued",
  "running",
  "success",
  "error",
];

const parseAccountResultState = (
  value: string | null,
): AiAccountStatusRefreshAccountState => {
  for (const state of ACCOUNT_RESULT_STATES) {
    if (value === state) return state;
  }
  return "queued";
};

const normalizeAccountResult = (
  value: unknown,
): AiAccountStatusRefreshAccountResultDto | null => {
  if (!isRecord(value)) return null;
  const authIndex = normalizeString(value.auth_index ?? value.authIndex);
  if (!authIndex) return null;
  const state = parseAccountResultState(normalizeString(value.state));
  return {
    auth_index: authIndex,
    auth_subject_id:
      normalizeString(value.auth_subject_id ?? value.authSubjectId) ?? undefined,
    state,
    error_code: normalizeString(value.error_code ?? value.errorCode),
    error_message: normalizeString(value.error_message ?? value.errorMessage),
    updated_at: normalizeString(value.updated_at ?? value.updatedAt),
    result: normalizeAccountStatusView(value.result),
  };
};

const normalizeRefreshJob = (value: unknown): AiAccountStatusRefreshJobDto => {
  if (!isRecord(value)) {
    throw new Error("invalid_status_refresh_job");
  }
  const jobId = normalizeString(value.job_id ?? value.jobId);
  if (!jobId) throw new Error("invalid_status_refresh_job_id");
  if (!Array.isArray(value.results)) {
    throw new Error("invalid_status_refresh_job_results");
  }
  const rawState = normalizeString(value.state) ?? "running";
  const state: AiAccountStatusRefreshJobState =
    rawState === "completed" ? "completed" : "running";
  const results = value.results
    .map(normalizeAccountResult)
    .filter((item): item is AiAccountStatusRefreshAccountResultDto => item != null);
  return {
    job_id: jobId,
    tenant_id: normalizeString(value.tenant_id ?? value.tenantId) ?? undefined,
    state,
    total: toFiniteNumber(value.total) ?? results.length,
    completed: toFiniteNumber(value.completed) ?? 0,
    failed: toFiniteNumber(value.failed) ?? 0,
    created_at: normalizeString(value.created_at ?? value.createdAt),
    updated_at: normalizeString(value.updated_at ?? value.updatedAt),
    results,
  };
};

const appendAuthIndexQuery = (authIndexes?: string[]): string => {
  const unique = Array.from(
    new Set(
      (authIndexes ?? [])
        .map((value) => normalizeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (unique.length === 0) return AI_ACCOUNTS_STATUS_PATH;
  const qs = new URLSearchParams();
  for (const authIndex of unique) {
    qs.append("auth_index", authIndex);
  }
  return `${AI_ACCOUNTS_STATUS_PATH}?${qs.toString()}`;
};

export const aiAccountsStatusApi = {
  getStatus: async (options?: {
    signal?: AbortSignal;
    /** When set, request only these auth indexes (single GET, repeated auth_index params). */
    authIndexes?: string[];
  }): Promise<AiAccountsStatusSnapshotDto> => {
    const data = await apiClient.get<unknown>(appendAuthIndexQuery(options?.authIndexes), {
      signal: options?.signal,
    });
    return normalizeSnapshot(data);
  },

  startStatusRefresh: async (
    payload: AiAccountStatusRefreshRequest,
    options?: { signal?: AbortSignal },
  ): Promise<AiAccountStatusRefreshAcceptedDto> => {
    const authIndexes = Array.from(
      new Set(
        (payload.auth_indexes ?? [])
          .map((value) => normalizeString(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const data = await apiClient.post<unknown>(
      AI_ACCOUNTS_STATUS_REFRESH_PATH,
      {
        auth_indexes: authIndexes,
        force: Boolean(payload.force),
      },
      { signal: options?.signal },
    );
    return normalizeRefreshAccepted(data);
  },

  getStatusRefreshJob: async (
    jobId: string,
    options?: { signal?: AbortSignal },
  ): Promise<AiAccountStatusRefreshJobDto> => {
    const normalizedJobId = normalizeString(jobId);
    if (!normalizedJobId) throw new Error("missing_status_refresh_job_id");
    const data = await apiClient.get<unknown>(
      `${AI_ACCOUNTS_STATUS_REFRESH_PATH}/${encodeURIComponent(normalizedJobId)}`,
      { signal: options?.signal },
    );
    return normalizeRefreshJob(data);
  },
};
