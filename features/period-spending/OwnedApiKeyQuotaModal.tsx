import type { PeriodSpendingLimits, PeriodSpendingPeriod } from "@code-proxy/api-client";
import { Button, Modal, TextInput } from "@code-proxy/ui";
import { formatQuotaUsd } from "./PeriodSpendingCell";
import {
  PeriodSpendingFields,
  periodSpendingDraftToLimits,
  validatePeriodSpendingDraft,
  type PeriodSpendingDraft,
} from "./PeriodSpendingFields";

export interface OwnedApiKeyQuotaForm {
  name: string;
  periods: PeriodSpendingDraft;
}

export function OwnedApiKeyQuotaModal({
  t,
  open,
  mode,
  value,
  accountLimits,
  saving,
  serverError,
  onChange,
  onClose,
  onSubmit,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  mode: "create" | "edit";
  value: OwnedApiKeyQuotaForm;
  accountLimits: PeriodSpendingLimits;
  saving: boolean;
  serverError?: string;
  onChange: (next: OwnedApiKeyQuotaForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const exceededPeriod = validatePeriodSpendingDraft(value.periods, accountLimits);
  const limits = periodSpendingDraftToLimits(value.periods);
  const errors: Partial<Record<PeriodSpendingPeriod, string>> = exceededPeriod
    ? {
        [exceededPeriod]: t("quota.validation.key_exceeds_account", {
          period: t(`quota.period.${exceededPeriod}`),
          keyLimit: formatQuotaUsd(limits[exceededPeriod]),
          accountLimit: formatQuotaUsd(accountLimits[exceededPeriod]),
        }),
      }
    : {};
  const invalid = !value.name.trim() || Boolean(exceededPeriod);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? t("api_keys_page.create_key") : t("api_keys_page.edit_key_quota")}
      description={t("api_keys_page.key_quota_account_hint")}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={saving || invalid}>
            {saving
              ? t("api_keys_page.saving")
              : mode === "create"
                ? t("api_keys_page.create_btn")
                : t("api_keys_page.save_btn")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-white/80">
            {t("api_keys_page.form_name_label")} <span className="text-rose-500">*</span>
          </span>
          <TextInput
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            placeholder={t("api_keys_page.form_name_placeholder")}
            autoFocus
          />
        </label>

        <section className="rounded-2xl border border-indigo-200/80 bg-indigo-50/45 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("api_keys_page.key_quota_title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
              {t("quota.key_fields_hint")}
            </p>
          </div>
          <PeriodSpendingFields
            t={t}
            value={value.periods}
            onChange={(periods) => onChange({ ...value, periods })}
            accountLimits={accountLimits}
            errors={errors}
            idPrefix={`owned-key-${mode}`}
          />
        </section>

        {serverError ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200"
          >
            {serverError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
