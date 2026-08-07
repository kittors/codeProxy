import { normalizePlanType } from "../quota/parsers";
import type { QuotaItem, QuotaState, QuotaStatus } from "../quota/types";

const QUOTA_CACHE_STATUSES = new Set<QuotaStatus>(["idle", "loading", "success", "error"]);

export const sanitizeQuotaItemsForCache = (items: unknown): QuotaItem[] => {
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
      const value = typeof record.value === "string" ? record.value : undefined;
      const windowSeconds =
        typeof record.windowSeconds === "number" && Number.isFinite(record.windowSeconds)
          ? record.windowSeconds
          : undefined;
      const meta = typeof record.meta === "string" ? record.meta : undefined;
      const type = typeof record.type === "string" ? record.type : undefined;
      // Age must survive the round-trip: a cached window rehydrated without its
      // observation time would repaint on cold start as if it were just fetched.
      const observedAtMs =
        typeof record.observedAtMs === "number" && Number.isFinite(record.observedAtMs)
          ? record.observedAtMs
          : undefined;
      return {
        ...(key ? { key } : {}),
        label,
        percent,
        value,
        resetAtMs,
        windowSeconds,
        meta,
        type,
        observedAtMs,
      };
    })
    .filter((item): item is QuotaItem => Boolean(item));
};

export const sanitizeResetCreditCountForCache = (value: unknown): number | undefined => {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count)) return undefined;
  return Math.max(0, Math.floor(count));
};

export const sanitizeResetCreditExpirationsForCache = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const expirations = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return expirations.length > 0 ? expirations : undefined;
};

export const sanitizeQuotaByFileNameForCache = (
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
    const fetchedAt =
      typeof state.fetchedAt === "number" && Number.isFinite(state.fetchedAt)
        ? state.fetchedAt
        : undefined;
    const source = typeof state.source === "string" ? state.source : undefined;
    if (
      items.length === 0 &&
      !planType &&
      resetCreditCount === undefined &&
      resetCreditExpirations === undefined &&
      !error
    ) {
      return;
    }
    const quotaObservedAtMs =
      typeof state.quotaObservedAtMs === "number" && Number.isFinite(state.quotaObservedAtMs)
        ? state.quotaObservedAtMs
        : undefined;
    output[fileName] = {
      status: status === "loading" ? "success" : (status as QuotaStatus),
      items,
      planType: planType ?? undefined,
      resetCreditCount,
      resetCreditExpirations,
      updatedAt,
      fetchedAt,
      source,
      error: status === "error" ? error : undefined,
      quotaObservedAtMs,
    };
  });

  return Object.keys(output).length > 0 ? output : undefined;
};
