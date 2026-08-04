import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PERIOD_SPENDING_PERIODS,
  type PeriodSpendingItem,
  type PeriodSpendingLimits,
  type PeriodSpendingPeriod,
} from "@code-proxy/api-client";
import { Button, Checkbox, ConfirmModal, Modal } from "@code-proxy/ui";
import { formatQuotaUsd } from "./PeriodSpendingCell";

export type PeriodQuotaResetScope = "account" | "key";

export interface PeriodQuotaResetModalProps {
  open: boolean;
  scope: PeriodQuotaResetScope;
  subjectName: string;
  configuredLimits?: PeriodSpendingLimits;
  periodSpendingItems?: PeriodSpendingItem[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (periods: PeriodSpendingPeriod[]) => void;
}

const configuredPeriodsFrom = (
  limits: PeriodSpendingLimits | undefined,
  items: PeriodSpendingItem[] | undefined,
): Array<{ period: PeriodSpendingPeriod; limit: number }> => {
  const itemLimits = new Map(items?.map((item) => [item.period, item.limit]) ?? []);
  return PERIOD_SPENDING_PERIODS.flatMap((period) => {
    const limit = limits?.[period] ?? itemLimits.get(period) ?? 0;
    return limit > 0 ? [{ period, limit }] : [];
  });
};

export function PeriodQuotaResetModal({
  open,
  scope,
  subjectName,
  configuredLimits,
  periodSpendingItems,
  busy = false,
  onClose,
  onConfirm,
}: PeriodQuotaResetModalProps) {
  const { t } = useTranslation();
  const configuredPeriods = useMemo(
    () => configuredPeriodsFrom(configuredLimits, periodSpendingItems),
    [configuredLimits, periodSpendingItems],
  );
  const [selectedPeriods, setSelectedPeriods] = useState<Set<PeriodSpendingPeriod>>(
    () => new Set(),
  );

  useEffect(() => {
    if (open) setSelectedPeriods(new Set());
  }, [open, scope, subjectName]);

  if (configuredPeriods.length === 0) return null;

  const title = t(`quota.reset.${scope}_title`);
  if (configuredPeriods.length === 1) {
    const [{ period }] = configuredPeriods;
    return (
      <ConfirmModal
        open={open}
        title={title}
        description={t(`quota.reset.${scope}_single_description`, {
          name: subjectName,
          period: t(`quota.period.${period}`),
        })}
        confirmText={t("quota.reset.confirm")}
        variant="primary"
        busy={busy}
        onClose={onClose}
        onConfirm={() => onConfirm([period])}
      />
    );
  }

  const selected = configuredPeriods
    .filter(({ period }) => selectedPeriods.has(period))
    .map(({ period }) => period);

  return (
    <Modal
      open={open}
      title={title}
      description={t(`quota.reset.${scope}_multiple_description`, { name: subjectName })}
      maxWidth="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            {t("quota.reset.confirm_selected")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {configuredPeriods.map(({ period, limit }) => {
          const checked = selectedPeriods.has(period);
          const checkboxId = `period-quota-reset-${scope}-${period}`;
          return (
            <label
              key={period}
              htmlFor={checkboxId}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-white/10 dark:bg-white/5 dark:hover:border-indigo-500/35 dark:hover:bg-indigo-500/10"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={busy}
                  onCheckedChange={(nextChecked) => {
                    setSelectedPeriods((current) => {
                      const next = new Set(current);
                      if (nextChecked) next.add(period);
                      else next.delete(period);
                      return next;
                    });
                  }}
                  aria-label={t("quota.reset.period_checkbox", {
                    period: t(`quota.period.${period}`),
                  })}
                />
                <span className="font-medium text-slate-800 dark:text-white/85">
                  {t(`quota.period.${period}`)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                {formatQuotaUsd(limit)}
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
