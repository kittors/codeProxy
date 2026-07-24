import type {
  AiAccountLatestStatusDto,
  AiAccountQuotaItemDto,
  EntityStatsResponse,
} from "@code-proxy/api-client";
import {
  normalizeAuthIndexValue,
  type AuthFileCycleBudgetStats,
} from "@code-proxy/domain";
import type { QuotaItem, QuotaState } from "@features/quota-preview/quota-types";
import type { AuthFileCycleUsageSnapshot } from "./useAuthFilesCycleUsageState";

const parseTimestampMs = (value: string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};

/** Server-provided freshness for monotonic merge (never Date.now). */
export type AccountStatusFreshness = {
  version: number | null;
  timeMs: number | null;
  usageTimeMs?: number | null;
  cycleRequestTotal?: number | null;
};

export const readAccountStatusFreshness = (
  account: Pick<
    AiAccountLatestStatusDto,
    "version" | "upstream_checked_at" | "updated_at" | "usage_updated_at" | "usage"
  >,
): AccountStatusFreshness => {
  let version: number | null = null;
  if (typeof account.version === "number" && Number.isFinite(account.version)) {
    version = account.version;
  } else if (typeof account.version === "string" && account.version.trim()) {
    const parsed = Number(account.version);
    if (Number.isFinite(parsed)) version = parsed;
  }
  const usageTimes = [
    parseTimestampMs(account.usage_updated_at),
    parseTimestampMs(account.usage?.updated_at),
  ].filter((value): value is number => typeof value === "number");
  const usageTimeMs = usageTimes.length > 0 ? Math.max(...usageTimes) : null;
  const times = [
    parseTimestampMs(account.upstream_checked_at),
    parseTimestampMs(account.updated_at),
    usageTimeMs ?? undefined,
  ].filter((value): value is number => typeof value === "number");
  const cycleRequestTotal = account.usage?.cycle_request_total;
  return {
    version,
    timeMs: times.length > 0 ? Math.max(...times) : null,
    usageTimeMs,
    cycleRequestTotal:
      typeof cycleRequestTotal === "number" && Number.isFinite(cycleRequestTotal)
        ? cycleRequestTotal
        : null,
  };
};

/**
 * true when `incoming` is not proven older than `current`.
 * Prefer version; then time. Only block when both sides carry comparable
 * markers and incoming is strictly older — unstamped progressive results
 * must still apply after a stamped first paint.
 */
export const isAccountStatusFresher = (
  incoming: AccountStatusFreshness,
  current: AccountStatusFreshness | null | undefined,
): boolean => {
  if (!current) return true;

  if (incoming.version != null && current.version != null) {
    if (incoming.version !== current.version) {
      return incoming.version > current.version;
    }
    // Usage can advance without bumping the status row version.
    if (
      incoming.usageTimeMs != null &&
      (current.usageTimeMs == null || incoming.usageTimeMs > current.usageTimeMs)
    ) {
      return true;
    }
    if (
      incoming.cycleRequestTotal != null &&
      incoming.cycleRequestTotal !== current.cycleRequestTotal
    ) {
      return true;
    }
    if (incoming.timeMs != null && current.timeMs != null) {
      return incoming.timeMs >= current.timeMs;
    }
    return true;
  }
  if (incoming.version != null) return true;
  if (current.version != null) {
    // Current has version, incoming does not: only block if both have times
    // and incoming is older. Unstamped refresh results are allowed.
    if (incoming.timeMs != null && current.timeMs != null) {
      return incoming.timeMs >= current.timeMs;
    }
    return true;
  }

  if (incoming.timeMs != null && current.timeMs != null) {
    return incoming.timeMs >= current.timeMs;
  }
  // Incomplete markers — cannot prove stale.
  return true;
};

export const mapQuotaItemDto = (item: AiAccountQuotaItemDto): QuotaItem => {
  const resetAtMs = parseTimestampMs(item.reset_at ?? undefined);
  return {
    key: item.quota_key,
    label: item.quota_label ?? item.quota_key,
    percent:
      typeof item.percent === "number" && Number.isFinite(item.percent)
        ? item.percent
        : null,
    value: item.value,
    resetAtMs,
    windowSeconds:
      typeof item.window_seconds === "number" && Number.isFinite(item.window_seconds)
        ? item.window_seconds
        : undefined,
    meta: item.meta,
  };
};

export const mapAccountStatusToQuotaState = (
  account: AiAccountLatestStatusDto,
): QuotaState => {
  const items = Array.isArray(account.quotas) ? account.quotas.map(mapQuotaItemDto) : [];
  const freshness = readAccountStatusFreshness(account);
  const updatedAt = freshness.timeMs ?? undefined;
  const errorMessage =
    account.error_message ?? account.error_summary ?? account.error_code ?? null;
  const isError =
    Boolean(errorMessage) ||
    account.health_status === "error" ||
    account.refresh_state === "error";

  if (isError && items.length === 0) {
    return {
      status: "error",
      items: [],
      planType: account.plan_type ?? undefined,
      resetCreditCount:
        typeof account.reset_credit_count === "number"
          ? account.reset_credit_count
          : undefined,
      resetCreditExpirations: account.reset_credit_expirations,
      error: errorMessage ?? "status_error",
      updatedAt,
    };
  }

  return {
    status: "success",
    items,
    planType: account.plan_type ?? undefined,
    resetCreditCount:
      typeof account.reset_credit_count === "number"
        ? account.reset_credit_count
        : undefined,
    resetCreditExpirations: account.reset_credit_expirations,
    error: errorMessage ?? undefined,
    updatedAt,
  };
};

export const mapAccountStatusToCycleUsage = (
  account: AiAccountLatestStatusDto,
): AuthFileCycleUsageSnapshot | null => {
  const usage = account.usage;
  if (!usage) return null;
  const cycleTotal = usage.cycle_request_total;
  // Only emit a cycle snapshot when the weekly cycle is known. Returning
  // calls:null here would overwrite a good local value after partial refresh.
  if (usage.cycle_known !== true) return null;
  if (typeof cycleTotal !== "number" || !Number.isFinite(cycleTotal)) return null;
  return {
    calls: Math.max(0, Math.round(cycleTotal)),
    cycleCostTotal:
      typeof usage.cycle_cost_total === "number" && Number.isFinite(usage.cycle_cost_total)
        ? usage.cycle_cost_total
        : null,
    cycleTotalTokens:
      typeof usage.cycle_total_tokens === "number" && Number.isFinite(usage.cycle_total_tokens)
        ? Math.max(0, Math.round(usage.cycle_total_tokens))
        : null,
    weeklyQuotaUsedPercent:
      typeof usage.weekly_quota_used_percent === "number" &&
      Number.isFinite(usage.weekly_quota_used_percent)
        ? usage.weekly_quota_used_percent
        : null,
  };
};

/** Prefer auth_subject_id, fall back to auth_index for merge keys. */
export const resolveStatusMergeKey = (
  account: AiAccountLatestStatusDto,
): string | null =>
  normalizeAuthIndexValue(account.auth_subject_id) ??
  normalizeAuthIndexValue(account.auth_index);

export const resolveStatusAuthIndex = (
  account: AiAccountLatestStatusDto,
): string | null => normalizeAuthIndexValue(account.auth_index);

export type AppliedAccountStatusPatch = {
  quotaByKey: Record<string, QuotaState>;
  cycleByKey: Record<string, AuthFileCycleUsageSnapshot>;
  cycleBudgetByKey: Record<string, AuthFileCycleBudgetStats>;
  planTypeByKey: Record<string, string>;
  entityStats: EntityStatsResponse;
};

const readFiniteUsageNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const mapAccountUsageToEntityStats = (
  authIndex: string,
  usage: NonNullable<AiAccountLatestStatusDto["usage"]>,
): EntityStatsResponse["auth_index"][number] | null => {
  const requestTotal = readFiniteUsageNumber(usage.request_total);
  const successTotal = readFiniteUsageNumber(usage.success_total);
  const failureTotal = readFiniteUsageNumber(usage.failure_total);
  const requestTotal30d = readFiniteUsageNumber(usage.request_total_30d);
  const successTotal30d = readFiniteUsageNumber(usage.success_total_30d);
  const failureTotal30d = readFiniteUsageNumber(usage.failure_total_30d);

  let requests: number | null = null;
  let failed: number | null = null;
  if (requestTotal !== null && failureTotal !== null) {
    requests = requestTotal;
    failed = failureTotal;
  } else if (successTotal !== null && failureTotal !== null) {
    requests = successTotal + failureTotal;
    failed = failureTotal;
  } else if (requestTotal30d !== null && failureTotal30d !== null) {
    requests = requestTotal30d;
    failed = failureTotal30d;
  } else if (successTotal30d !== null && failureTotal30d !== null) {
    requests = successTotal30d + failureTotal30d;
    failed = failureTotal30d;
  }
  if (requests === null || failed === null) return null;

  const normalizedRequests = Math.max(0, Math.round(requests));
  const normalizedFailed = Math.min(normalizedRequests, Math.max(0, Math.round(failed)));
  return {
    entity_name: authIndex,
    requests: normalizedRequests,
    failed: normalizedFailed,
    avg_latency: 0,
    total_tokens: 0,
  };
};

export const applyAccountStatuses = (
  accounts: AiAccountLatestStatusDto[],
): AppliedAccountStatusPatch => {
  const quotaByKey: Record<string, QuotaState> = {};
  const cycleByKey: Record<string, AuthFileCycleUsageSnapshot> = {};
  const cycleBudgetByKey: Record<string, AuthFileCycleBudgetStats> = {};
  const planTypeByKey: Record<string, string> = {};
  const authIndexPoints: EntityStatsResponse["auth_index"] = [];

  for (const account of accounts) {
    const mergeKey = resolveStatusMergeKey(account);
    const authIndex = resolveStatusAuthIndex(account);
    const key = mergeKey ?? authIndex;
    if (!key) continue;
    quotaByKey[key] = mapAccountStatusToQuotaState(account);
    if (authIndex && authIndex !== key) {
      quotaByKey[authIndex] = quotaByKey[key];
    }

    const cycle = mapAccountStatusToCycleUsage(account);
    if (cycle) {
      cycleByKey[key] = cycle;
      cycleBudgetByKey[key] = {
        cycleCostTotal: cycle.cycleCostTotal,
        weeklyQuotaUsedPercent: cycle.weeklyQuotaUsedPercent,
      };
      if (authIndex && authIndex !== key) {
        cycleByKey[authIndex] = cycle;
        cycleBudgetByKey[authIndex] = cycleBudgetByKey[key];
      }
    }

    if (account.plan_type) {
      planTypeByKey[key] = account.plan_type;
      if (authIndex && authIndex !== key) {
        planTypeByKey[authIndex] = account.plan_type;
      }
    }

    const usage = account.usage;
    if (authIndex && usage) {
      const point = mapAccountUsageToEntityStats(authIndex, usage);
      if (point) authIndexPoints.push(point);
    }
  }

  return {
    quotaByKey,
    cycleByKey,
    cycleBudgetByKey,
    planTypeByKey,
    entityStats: { source: [], auth_index: authIndexPoints },
  };
};
