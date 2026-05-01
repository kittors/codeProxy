import type { AuthFileItem } from "@/lib/http/types";
import type { QuotaItem } from "@/modules/quota/quota-types";
import {
  clampPercent,
  isRecord,
  normalizeNumberValue,
  normalizeStringValue,
  parseIdTokenPayload,
  unixSecondsToMs,
} from "@/modules/quota/quota-normalizers";

type CodexUsageWindow = {
  used_percent?: number | string;
  usedPercent?: number | string;
  limit_window_seconds?: number | string;
  limitWindowSeconds?: number | string;
  reset_after_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_at?: number | string;
  resetAt?: number | string;
};

type CodexRateLimitInfo = {
  allowed?: boolean;
  limit_reached?: boolean;
  limitReached?: boolean;
  primary_window?: CodexUsageWindow | null;
  primaryWindow?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
};

type CodexAdditionalRateLimit = {
  limit_name?: string;
  limitName?: string;
  metered_feature?: string;
  meteredFeature?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
};

export type CodexUsagePayload = {
  plan_type?: string;
  planType?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
  code_review_rate_limit?: CodexRateLimitInfo | null;
  codeReviewRateLimit?: CodexRateLimitInfo | null;
  additional_rate_limits?: CodexAdditionalRateLimit[];
  additionalRateLimits?: CodexAdditionalRateLimit[];
};

export const resolveCodexChatgptAccountId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes)
    ? (file.attributes as Record<string, unknown>)
    : null;
  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  for (const candidate of candidates) {
    const payload = parseIdTokenPayload(candidate);
    const id = payload
      ? normalizeStringValue(payload.chatgpt_account_id ?? payload.chatgptAccountId)
      : null;
    if (id) return id;
  }
  return null;
};

export const parseCodexUsagePayload = (payload: unknown): CodexUsagePayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as CodexUsagePayload;
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? (payload as CodexUsagePayload) : null;
};

const resolveCodexResetAtMs = (window?: CodexUsageWindow | null): number | undefined => {
  if (!window) return undefined;
  const resetAt = normalizeNumberValue(window.reset_at ?? window.resetAt);
  if (resetAt !== null && resetAt > 0) return unixSecondsToMs(resetAt);
  const after = normalizeNumberValue(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (after === null || after <= 0) return undefined;
  return Date.now() + after * 1000;
};

const codexAdditionalFeatureAliases: Record<string, string> = {
  "gpt-5.3-codex-spark": "codex_bengalfox",
};

const normalizeCodexQuotaKeyPart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");

const resolveAdditionalQuotaKeyPart = (entry: CodexAdditionalRateLimit, name: string): string => {
  const meteredFeature = normalizeStringValue(entry.metered_feature ?? entry.meteredFeature);
  if (meteredFeature) return normalizeCodexQuotaKeyPart(meteredFeature) || meteredFeature;
  const alias = codexAdditionalFeatureAliases[name.trim().toLowerCase()];
  if (alias) return alias;
  return normalizeCodexQuotaKeyPart(name) || "additional";
};

export const buildCodexItems = (payload: CodexUsagePayload): QuotaItem[] => {
  const fiveHourSeconds = 18000;
  const weekSeconds = 604800;
  const rate = payload.rate_limit ?? payload.rateLimit ?? null;
  const codeReview = payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? null;
  const additionalRateLimits = Array.isArray(payload.additional_rate_limits)
    ? payload.additional_rate_limits
    : Array.isArray(payload.additionalRateLimits)
      ? payload.additionalRateLimits
      : [];
  const items: QuotaItem[] = [];

  const pickWindows = (limitInfo?: CodexRateLimitInfo | null) => {
    const rawWindows = [
      limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null,
      limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null,
    ];
    let fiveHour: CodexUsageWindow | null = null;
    let weekly: CodexUsageWindow | null = null;
    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = normalizeNumberValue(
        window.limit_window_seconds ?? window.limitWindowSeconds,
      );
      if (seconds === fiveHourSeconds && !fiveHour) fiveHour = window;
      if (seconds === weekSeconds && !weekly) weekly = window;
    }
    return { fiveHour, weekly };
  };

  const addWindow = (
    key: string,
    label: string,
    windowSeconds: number,
    window?: CodexUsageWindow | null,
    limitInfo?: CodexRateLimitInfo | null,
  ) => {
    if (!window) return;
    const usedRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const limitReached = limitInfo?.limit_reached ?? limitInfo?.limitReached;
    const used =
      usedRaw !== null
        ? clampPercent(usedRaw)
        : limitInfo?.allowed === false || limitReached
          ? 100
          : null;
    items.push({
      key,
      label,
      percent: used === null ? null : clampPercent(100 - used),
      resetAtMs: resolveCodexResetAtMs(window),
      windowSeconds,
    });
  };

  const rateWindows = pickWindows(rate);
  addWindow("code_5h", "m_quota.code_5h", fiveHourSeconds, rateWindows.fiveHour, rate);
  addWindow("code_week", "m_quota.code_weekly", weekSeconds, rateWindows.weekly, rate);
  if (codeReview) {
    const reviewWindows = pickWindows(codeReview);
    addWindow(
      "review_5h",
      "m_quota.review_5h",
      fiveHourSeconds,
      reviewWindows.fiveHour,
      codeReview,
    );
    addWindow(
      "review_week",
      "m_quota.review_weekly",
      weekSeconds,
      reviewWindows.weekly,
      codeReview,
    );
  }

  additionalRateLimits.forEach((entry) => {
    const limitInfo = entry.rate_limit ?? entry.rateLimit ?? null;
    if (!limitInfo) return;
    const name =
      normalizeStringValue(entry.limit_name ?? entry.limitName) ?? "Additional Codex quota";
    const keyPart = resolveAdditionalQuotaKeyPart(entry, name);
    const windows = pickWindows(limitInfo);
    addWindow(
      `additional:${keyPart}:5h`,
      `${name}: 5h`,
      fiveHourSeconds,
      windows.fiveHour,
      limitInfo,
    );
    addWindow(
      `additional:${keyPart}:week`,
      `${name}: Weekly`,
      weekSeconds,
      windows.weekly,
      limitInfo,
    );
  });

  return items;
};
