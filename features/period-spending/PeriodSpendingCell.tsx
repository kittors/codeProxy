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

/** Lifetime spend has no reset cycle, so an overspend must read as 0 left, never negative. */
export const remainingQuotaUsd = (
  limit: number | null | undefined,
  used: number | null | undefined,
): number => {
  const safeLimit = Number.isFinite(limit) ? (limit ?? 0) : 0;
  const safeUsed = Number.isFinite(used) ? (used ?? 0) : 0;
  return Math.max(0, safeLimit - safeUsed);
};

export type LifetimeSpending = { used?: number | null; limit?: number | null };

const hasLifetimeLimit = (lifetime: LifetimeSpending | undefined): boolean =>
  Number.isFinite(lifetime?.limit) && (lifetime?.limit ?? 0) > 0;

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
  return "border-slate-900/8 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/75";
};

export function PeriodSpendingCell({
  t,
  items,
  lifetime,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  items?: PeriodSpendingItem[];
  /**
   * Lifetime spending cap. It is not one of the rolling periods, so it used to be
   * absent from this column entirely: an account with only a lifetime cap read as
   * "unlimited" here while the lifetime column showed spend without its cap.
   */
  lifetime?: LifetimeSpending;
}) {
  const visible = orderedItems(items);
  const showLifetime = hasLifetimeLimit(lifetime);
  if (visible.length === 0 && !showLifetime) {
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
      {showLifetime ? <LifetimeSpendingChip t={t} lifetime={lifetime as LifetimeSpending} /> : null}
    </div>
  );
}

/**
 * Rolling periods are shown as used/limit because they refill on their own; the
 * lifetime cap only ever counts down, so what operators need from it is how much
 * is left before the account stops.
 */
function LifetimeSpendingChip({
  t,
  lifetime,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  lifetime: LifetimeSpending;
}) {
  const limit = lifetime.limit ?? 0;
  const used = lifetime.used ?? 0;
  const remaining = remainingQuotaUsd(limit, used);
  const ratio = limit > 0 ? used / limit : 0;
  const danger = ratio >= 1;
  const warning = ratio >= 0.9 && !danger;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium tabular-nums ${chipTone(ratio)}`}
      title={t("quota.lifetime_remaining_detail", {
        used: formatQuotaUsd(used),
        limit: formatQuotaUsd(limit),
        remaining: formatQuotaUsd(remaining),
      })}
    >
      {danger ? <AlertCircle size={13} aria-hidden="true" /> : null}
      {warning ? <AlertTriangle size={13} aria-hidden="true" /> : null}
      <span className="font-semibold">{t("quota.lifetime_label")}</span>
      <span>
        {t("quota.remaining_value", { remaining: formatQuotaUsd(remaining) })} /{" "}
        {formatQuotaUsd(limit)}
      </span>
      {danger ? <span className="sr-only">{t("quota.status.exceeded")}</span> : null}
      {warning ? <span className="sr-only">{t("quota.status.warning")}</span> : null}
    </span>
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
