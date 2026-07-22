import { AlertCircle, AlertTriangle, Infinity as InfinityIcon } from "lucide-react";
import type {
  PeriodSpendingItem,
  PeriodSpendingLimits,
  PeriodSpendingPeriod,
} from "@code-proxy/api-client";
import { PERIOD_SPENDING_PERIODS } from "@code-proxy/api-client";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const amountFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatQuotaUsd = (value: number): string =>
  usdFormatter.format(Number.isFinite(value) ? Math.max(0, value) : 0);

export const formatQuotaUsdAmount = (value: number | null | undefined): string =>
  amountFormatter.format(Number.isFinite(value) ? Math.max(0, value ?? 0) : 0);

const periodLabel = (
  t: (key: string, options?: Record<string, unknown>) => string,
  period: PeriodSpendingPeriod,
) => t(`quota.period.${period}`);

const orderedItems = (items: PeriodSpendingItem[] | undefined): PeriodSpendingItem[] => {
  if (!items?.length) return [];
  const byPeriod = new Map(items.map((item) => [item.period, item]));
  return PERIOD_SPENDING_PERIODS.flatMap((period) => {
    const item = byPeriod.get(period);
    return item && item.limit > 0 ? [item] : [];
  });
};

const chipTone = (ratio: number) => {
  if (ratio >= 1) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
  }
  if (ratio >= 0.9) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/75";
};

export function PeriodSpendingCell({
  t,
  items,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  items?: PeriodSpendingItem[];
}) {
  const visible = orderedItems(items);
  if (visible.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
        <InfinityIcon size={13} aria-hidden="true" />
        {t("quota.unlimited")}
      </span>
    );
  }

  return (
    <div className="flex min-w-[12rem] flex-wrap gap-1.5">
      {visible.map((item) => {
        const ratio = item.limit > 0 ? item.used / item.limit : 0;
        const danger = ratio >= 1;
        const warning = ratio >= 0.9 && !danger;
        return (
          <span
            key={item.period}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium tabular-nums ${chipTone(ratio)}`}
            title={t("quota.used_of_limit", {
              period: periodLabel(t, item.period),
              used: formatQuotaUsd(item.used),
              limit: formatQuotaUsd(item.limit),
            })}
          >
            {danger ? <AlertCircle size={13} aria-hidden="true" /> : null}
            {warning ? <AlertTriangle size={13} aria-hidden="true" /> : null}
            <span className="font-semibold">{periodLabel(t, item.period)}</span>
            <span>
              {formatQuotaUsd(item.used)} / {formatQuotaUsd(item.limit)}
            </span>
            {danger ? <span className="sr-only">{t("quota.status.exceeded")}</span> : null}
            {warning ? <span className="sr-only">{t("quota.status.warning")}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export function PeriodSpendingLimitsCell({
  t,
  limits,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  limits?: PeriodSpendingLimits;
}) {
  const visible = PERIOD_SPENDING_PERIODS.filter((period) => (limits?.[period] ?? 0) > 0);
  if (visible.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
        <InfinityIcon size={13} aria-hidden="true" />
        {t("quota.unlimited")}
      </span>
    );
  }

  return (
    <div className="flex min-w-[12rem] flex-wrap gap-1.5">
      {visible.map((period) => (
        <span
          key={period}
          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200"
        >
          <span className="font-semibold">{periodLabel(t, period)}</span>
          <span className="tabular-nums">{formatQuotaUsd(limits?.[period] ?? 0)}</span>
        </span>
      ))}
    </div>
  );
}
