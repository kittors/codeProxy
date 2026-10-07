import type { PeriodSpendingLimits, PeriodSpendingPeriod } from "@code-proxy/api-client";
import { PERIOD_SPENDING_PERIODS } from "@code-proxy/api-client";
import { FormField, TextInput } from "@code-proxy/ui";
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
  onFieldBlur,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: PeriodSpendingDraft;
  onChange: (next: PeriodSpendingDraft) => void;
  accountLimits?: PeriodSpendingLimits;
  disabled?: boolean;
  errors?: Partial<Record<PeriodSpendingPeriod, string>>;
  idPrefix?: string;
  /** 失焦回调，接 useFormValidation 的 touch：失焦后才显示该周期的错误。 */
  onFieldBlur?: (period: PeriodSpendingPeriod) => void;
}) {
  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      {PERIOD_SPENDING_PERIODS.map((period) => {
        const accountLimit = accountLimits?.[period] ?? 0;
        const label = t(`quota.field.${period}`);
        return (
          <FormField
            key={period}
            label={label}
            htmlFor={`${idPrefix}-${period}`}
            // 填 Key 子额度时把账号上限常驻在输入框下面，不用回头翻账号设置才知道能填多少。
            description={
              accountLimits
                ? accountLimit > 0
                  ? t("quota.account_limit_value", { value: formatQuotaUsd(accountLimit) })
                  : t("quota.account_unlimited")
                : undefined
            }
            error={errors[period]}
            reserveMeta={false}
          >
            <TextInput
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={value[period]}
              disabled={disabled}
              // 输入框带占位文字时 TextInput 会拿占位当可访问名称，这里显式给回字段名。
              aria-label={label}
              placeholder={t("quota.input_unlimited")}
              onBlur={() => onFieldBlur?.(period)}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "" || /^\d*(?:\.\d*)?$/.test(raw)) {
                  onChange({ ...value, [period]: raw });
                }
              }}
            />
          </FormField>
        );
      })}
    </div>
  );
}
