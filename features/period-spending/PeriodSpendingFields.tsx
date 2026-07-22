import type { PeriodSpendingLimits, PeriodSpendingPeriod } from "@code-proxy/api-client";
import { PERIOD_SPENDING_PERIODS } from "@code-proxy/api-client";
import { TextInput } from "@code-proxy/ui";
import { formatQuotaUsd } from "./PeriodSpendingCell";

export type PeriodSpendingDraft = Record<PeriodSpendingPeriod, string>;

export const emptyPeriodSpendingDraft = (): PeriodSpendingDraft => ({
  "5h": "",
  day: "",
  week: "",
  month: "",
});

export const limitsToPeriodSpendingDraft = (
  limits: PeriodSpendingLimits | undefined,
): PeriodSpendingDraft => ({
  "5h": limits?.["5h"] ? String(limits["5h"]) : "",
  day: limits?.day ? String(limits.day) : "",
  week: limits?.week ? String(limits.week) : "",
  month: limits?.month ? String(limits.month) : "",
});

const normalizeDraftValue = (value: string): number => {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
};

export const periodSpendingDraftToLimits = (draft: PeriodSpendingDraft): PeriodSpendingLimits => ({
  "5h": normalizeDraftValue(draft["5h"]),
  day: normalizeDraftValue(draft.day),
  week: normalizeDraftValue(draft.week),
  month: normalizeDraftValue(draft.month),
});

export const validatePeriodSpendingDraft = (
  draft: PeriodSpendingDraft,
  accountLimits: PeriodSpendingLimits | undefined,
): PeriodSpendingPeriod | null => {
  if (!accountLimits) return null;
  const limits = periodSpendingDraftToLimits(draft);
  return (
    PERIOD_SPENDING_PERIODS.find(
      (period) =>
        limits[period] > 0 && accountLimits[period] > 0 && limits[period] > accountLimits[period],
    ) ?? null
  );
};

export function PeriodSpendingFields({
  t,
  value,
  onChange,
  accountLimits,
  disabled = false,
  errors = {},
  idPrefix = "period-spending",
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: PeriodSpendingDraft;
  onChange: (next: PeriodSpendingDraft) => void;
  accountLimits?: PeriodSpendingLimits;
  disabled?: boolean;
  errors?: Partial<Record<PeriodSpendingPeriod, string>>;
  idPrefix?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PERIOD_SPENDING_PERIODS.map((period) => {
        const accountLimit = accountLimits?.[period] ?? 0;
        const error = errors[period];
        const inputId = `${idPrefix}-${period}`;
        return (
          <label key={period} htmlFor={inputId} className="block space-y-1.5">
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700 dark:text-white/80">
              <span>{t(`quota.field.${period}`)}</span>
              {accountLimits ? (
                <span className="text-xs font-normal text-slate-400 dark:text-white/40">
                  {accountLimit > 0
                    ? t("quota.account_limit_value", { value: formatQuotaUsd(accountLimit) })
                    : t("quota.account_unlimited")}
                </span>
              ) : null}
            </span>
            <TextInput
              id={inputId}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={value[period]}
              disabled={disabled}
              aria-label={t(`quota.field.${period}`)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${inputId}-error` : undefined}
              placeholder={t("quota.input_unlimited")}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "" || /^\d*(?:\.\d*)?$/.test(raw)) {
                  onChange({ ...value, [period]: raw });
                }
              }}
            />
            {error ? (
              <span
                id={`${inputId}-error`}
                className="block text-xs text-rose-600 dark:text-rose-300"
              >
                {error}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
