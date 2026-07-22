import { extractApiErrorCode, isApiClientError } from "../client/errors";
import { isRecord } from "../client/response";

export const PERIOD_SPENDING_PERIODS = ["5h", "day", "week", "month"] as const;

export type PeriodSpendingPeriod = (typeof PERIOD_SPENDING_PERIODS)[number];

export const isPeriodSpendingPeriod = (value: unknown): value is PeriodSpendingPeriod =>
  PERIOD_SPENDING_PERIODS.some((period) => period === value);

export interface PeriodSpendingLimits {
  "5h": number;
  day: number;
  week: number;
  month: number;
}

export type PeriodSpendingLimitsPatch = Partial<PeriodSpendingLimits>;

export interface PeriodSpendingItem {
  period: PeriodSpendingPeriod;
  limit: number;
  used: number;
  remaining: number;
}

export interface CappedKey {
  id: string;
  period: PeriodSpendingPeriod;
  from: number;
  to: number;
}

export type QuotaValidationErrorCode =
  | "key_period_limit_exceeds_account"
  | "period_day_legacy_conflict"
  | "five_hour_quota_projection_warming";

export interface QuotaValidationErrorDetails {
  period?: PeriodSpendingPeriod;
  keyLimit?: number;
  accountLimit?: number;
}

export interface QuotaValidationError {
  code: QuotaValidationErrorCode | string;
  message: string;
  details: QuotaValidationErrorDetails;
}

export const EMPTY_PERIOD_SPENDING_LIMITS: PeriodSpendingLimits = {
  "5h": 0,
  day: 0,
  week: 0,
  month: 0,
};

const finiteNonNegative = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const normalizePeriodSpendingLimits = (
  value: unknown,
  legacyDay?: unknown,
): PeriodSpendingLimits => {
  const record = isRecord(value) ? value : {};
  return {
    "5h": finiteNonNegative(record["5h"]),
    day: finiteNonNegative(record.day ?? legacyDay),
    week: finiteNonNegative(record.week),
    month: finiteNonNegative(record.month),
  };
};

export const hasPeriodSpendingLimits = (limits: PeriodSpendingLimits): boolean =>
  PERIOD_SPENDING_PERIODS.some((period) => limits[period] > 0);

export const extractQuotaValidationError = (error: unknown): QuotaValidationError | null => {
  if (!isApiClientError(error)) return null;
  const code = extractApiErrorCode(error.payload);
  if (!code) return null;

  const payload = isRecord(error.payload) ? error.payload : null;
  const nested = payload && isRecord(payload.error) ? payload.error : null;
  const detailsRecord = nested && isRecord(nested.details) ? nested.details : null;
  const period = detailsRecord?.period;
  const keyLimit = detailsRecord?.key_limit;
  const accountLimit = detailsRecord?.account_limit;

  return {
    code,
    message:
      typeof nested?.message === "string" && nested.message.trim()
        ? nested.message.trim()
        : error.message,
    details: {
      period: isPeriodSpendingPeriod(period) ? period : undefined,
      keyLimit: typeof keyLimit === "number" && Number.isFinite(keyLimit) ? keyLimit : undefined,
      accountLimit:
        typeof accountLimit === "number" && Number.isFinite(accountLimit)
          ? accountLimit
          : undefined,
    },
  };
};
