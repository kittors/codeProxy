import type { QuotaItem } from "@/modules/quota/quota-types";
import {
  normalizeNumberValue,
  normalizeStringValue,
  unixSecondsToMs,
} from "@/modules/quota/quota-normalizers";

export type KiroQuotaPayload = {
  nextDateReset?: number;
  subscriptionInfo?: { subscriptionTitle?: string };
  usageBreakdownList?: {
    usageLimitWithPrecision?: number;
    currentUsageWithPrecision?: number;
    nextDateReset?: number;
    freeTrialInfo?: {
      freeTrialStatus?: string;
      usageLimitWithPrecision?: number;
      currentUsageWithPrecision?: number;
      freeTrialExpiry?: number;
    };
  }[];
};

export const parseKiroQuotaPayload = (payload: unknown): KiroQuotaPayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as KiroQuotaPayload;
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? (payload as KiroQuotaPayload) : null;
};

export const buildKiroItems = (payload: KiroQuotaPayload): QuotaItem[] => {
  const usage = payload.usageBreakdownList?.[0];
  const items: QuotaItem[] = [];
  if (usage) {
    const limit = normalizeNumberValue(usage.usageLimitWithPrecision);
    const used = normalizeNumberValue(usage.currentUsageWithPrecision);
    const resetTime = normalizeNumberValue(usage.nextDateReset ?? payload.nextDateReset);
    if (limit !== null && used !== null) {
      const remaining = Math.max(0, limit - used);
      const percent = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
      items.push({
        label: "m_quota.base_quota",
        percent,
        resetAtMs: unixSecondsToMs(resetTime),
        meta: `used ${Math.round(used).toLocaleString()} / limit ${Math.round(limit).toLocaleString()}`,
      });
    }
    const trial = usage.freeTrialInfo;
    if (trial) {
      const trialLimit = normalizeNumberValue(trial.usageLimitWithPrecision);
      const trialUsed = normalizeNumberValue(trial.currentUsageWithPrecision);
      const trialExpiry = normalizeNumberValue(trial.freeTrialExpiry);
      const status = normalizeStringValue(trial.freeTrialStatus);
      if (trialLimit !== null && trialUsed !== null) {
        const remaining = Math.max(0, trialLimit - trialUsed);
        const percent = trialLimit > 0 ? Math.round((remaining / trialLimit) * 100) : 0;
        items.push({
          label: "m_quota.trial_quota",
          percent,
          resetAtMs: unixSecondsToMs(trialExpiry),
          meta: `${status ?? "trial"} · used ${Math.round(trialUsed).toLocaleString()} / limit ${Math.round(trialLimit).toLocaleString()}`,
        });
      }
    }
  }
  const subscriptionTitle = normalizeStringValue(payload.subscriptionInfo?.subscriptionTitle);
  if (subscriptionTitle) {
    items.unshift({ label: "m_quota.subscription", percent: null, meta: subscriptionTitle });
  }
  return items;
};
