import type { QuotaItem } from "@/modules/quota/quota-types";
import {
  clampPercent,
  normalizeNumberValue,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@/modules/quota/quota-normalizers";

type KimiUsageDetail = {
  limit?: number | string;
  used?: number | string;
  remaining?: number | string;
  resetTime?: string;
  reset_time?: string;
};

type KimiUsageWindow = {
  duration?: number | string;
  timeUnit?: string;
  time_unit?: string;
};

type KimiUsageLimit = {
  window?: KimiUsageWindow | null;
  detail?: KimiUsageDetail | null;
};

type KimiUsageEntry = {
  scope?: string;
  detail?: KimiUsageDetail | null;
  limits?: KimiUsageLimit[] | null;
};

export type KimiUsagePayload = {
  usage?: KimiUsageDetail | null;
  limits?: KimiUsageLimit[] | null;
  usages?: KimiUsageEntry[] | null;
};

export const parseKimiUsagePayload = (payload: unknown): KimiUsagePayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as KimiUsagePayload;
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? (payload as KimiUsagePayload) : null;
};

const resolveKimiPercent = (detail?: KimiUsageDetail | null): number | null => {
  if (!detail) return null;
  const limit = normalizeNumberValue(detail.limit);
  if (limit === null) return null;
  if (limit <= 0) return 0;

  let remaining = normalizeNumberValue(detail.remaining);
  if (remaining === null) {
    const used = normalizeNumberValue(detail.used);
    if (used !== null) remaining = Math.max(0, limit - used);
  }
  if (remaining === null) return null;
  return Math.round(clampPercent((remaining / limit) * 100));
};

const resolveKimiWindowMinutes = (window?: KimiUsageWindow | null): number | null => {
  if (!window) return null;
  const duration = normalizeNumberValue(window.duration);
  if (duration === null || duration <= 0) return null;
  const unit = normalizeStringValue(window.timeUnit ?? window.time_unit)?.toUpperCase();
  if (!unit || unit === "TIME_UNIT_MINUTE") return duration;
  if (unit === "TIME_UNIT_HOUR") return duration * 60;
  if (unit === "TIME_UNIT_DAY") return duration * 24 * 60;
  if (unit === "TIME_UNIT_WEEK") return duration * 7 * 24 * 60;
  return null;
};

const buildKimiItem = (
  key: string,
  label: string,
  windowSeconds: number,
  detail?: KimiUsageDetail | null,
): QuotaItem | null => {
  if (!detail) return null;
  const percent = resolveKimiPercent(detail);
  const resetAtMs = parseResetTimeToMs(detail.resetTime ?? detail.reset_time);
  if (percent === null && resetAtMs === undefined) return null;
  return {
    key,
    label,
    percent,
    resetAtMs,
    windowSeconds,
  };
};

const buildItemsFromTopLevelPayload = (payload: KimiUsagePayload): QuotaItem[] => {
  const limits = Array.isArray(payload.limits) ? payload.limits : [];
  const fiveHourLimit =
    limits.find((item) => resolveKimiWindowMinutes(item.window) === 300) ?? null;
  const weeklyLimit =
    limits.find((item) => resolveKimiWindowMinutes(item.window) === 7 * 24 * 60) ?? null;

  return [
    buildKimiItem("code_5h", "m_quota.code_5h", 18000, fiveHourLimit?.detail),
    buildKimiItem(
      "code_week",
      "m_quota.code_weekly",
      604800,
      payload.usage ?? weeklyLimit?.detail ?? null,
    ),
  ].filter(Boolean) as QuotaItem[];
};

export const buildKimiItems = (payload: KimiUsagePayload): QuotaItem[] => {
  if (payload.usage || payload.limits) {
    return buildItemsFromTopLevelPayload(payload);
  }

  const usages = Array.isArray(payload.usages) ? payload.usages : [];
  const codingUsage =
    usages.find((usage) => normalizeStringValue(usage.scope)?.toUpperCase() === "FEATURE_CODING") ??
    usages[0];
  if (!codingUsage) return [];

  const limits = Array.isArray(codingUsage.limits) ? codingUsage.limits : [];
  const fiveHourLimit =
    limits.find((item) => resolveKimiWindowMinutes(item.window) === 300) ?? null;
  const weeklyLimit =
    limits.find((item) => resolveKimiWindowMinutes(item.window) === 7 * 24 * 60) ?? null;

  const items = [
    buildKimiItem("code_5h", "m_quota.code_5h", 18000, fiveHourLimit?.detail),
    buildKimiItem(
      "code_week",
      "m_quota.code_weekly",
      604800,
      codingUsage.detail ?? weeklyLimit?.detail ?? null,
    ),
  ].filter(Boolean) as QuotaItem[];

  return items;
};
