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

/**
 * 只有 5h 是服务端锚定的窗口，到点整窗清零，因此它能给出确切的恢复时刻。
 * 缺少 resets_at（未开窗，或日历周期）时不编造倒计时。
 */
const resetHint = (
  t: (key: string, options?: Record<string, unknown>) => string,
  item: PeriodSpendingItem,
): string | null => {
  if (!item.resets_at) return null;
  const resetsAt = new Date(item.resets_at);
  if (Number.isNaN(resetsAt.getTime())) return null;
  return t("quota.window_resets_at", { time: resetsAt.toLocaleString() });
};

/*
 * 额度胶囊只用淡底、不描边：正常是中性灰，接近上限（≥ 90%）琥珀、用尽红色。
 * 「不限制」的基础形态（简约风格）是中性胶囊，多彩风格下叠回绿色胶囊。
 */
const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium";
const NEUTRAL_CHIP = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";
const UNLIMITED_CHIP =
  "colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/10 colorful:dark:text-emerald-300";

const chipTone = (ratio: number) => {
  if (ratio >= 1) return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (ratio >= 0.9) return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return NEUTRAL_CHIP;
};

function UnlimitedChip({ label }: { label: string }) {
  return (
    <span className={`${CHIP} ${NEUTRAL_CHIP} ${UNLIMITED_CHIP}`}>
      <InfinityIcon
        size={13}
        className="text-ink-3 colorful:text-emerald-700 colorful:dark:text-emerald-300"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

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
    return <UnlimitedChip label={t("quota.unlimited")} />;
  }

  return (
    <div className="flex min-w-[12rem] flex-wrap gap-1.5">
      {visible.map((item) => {
        const ratio = item.limit > 0 ? item.used / item.limit : 0;
        const danger = ratio >= 1;
        const warning = ratio >= 0.9 && !danger;
        const usage = t("quota.used_of_limit", {
          period: periodLabel(t, item.period),
          used: formatQuotaUsd(item.used),
          limit: formatQuotaUsd(item.limit),
        });
        const reset = resetHint(t, item);
        return (
          <span
            key={item.period}
            className={`${CHIP} tabular-nums ${chipTone(ratio)}`}
            title={reset ? `${usage} · ${reset}` : usage}
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
 * Windowed periods are shown as used/limit because they refill on their own; the
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
      className={`${CHIP} tabular-nums ${chipTone(ratio)}`}
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
    return <UnlimitedChip label={t("quota.unlimited")} />;
  }

  return (
    <div className="flex min-w-[12rem] flex-wrap gap-1.5">
      {visible.map((period) => (
        <span key={period} className={`${CHIP} ${NEUTRAL_CHIP}`}>
          <span className="font-semibold">{periodLabel(t, period)}</span>
          <span className="tabular-nums">{formatQuotaUsd(limits?.[period] ?? 0)}</span>
        </span>
      ))}
    </div>
  );
}
