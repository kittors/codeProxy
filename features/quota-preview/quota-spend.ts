import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { estimateQuotaBudgetUsd } from "@code-proxy/domain";
import type { QuotaItem } from "./quota-types";

/**
 * What the proxy spent inside a quota window (CliRelay#1103).
 *
 * The backend sums the account's recorded cost from the window's start to now
 * and sends it as `used_cost_usd`. Next to the share used it tells the window's
 * size in dollars, which is how an upstream lowering a plan becomes visible: the
 * same 40% now stands for fewer dollars.
 */

/**
 * Below this share used, cost ÷ share is mostly rounding: upstreams report whole
 * percents, so at 1% the true share is anywhere from 0.5% to 1.5% and the
 * implied window size could be off by half.
 */
export const QUOTA_WINDOW_SIZE_MIN_USED_PERCENT = 5;

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Whole dollars past $1,000, with the fraction digits set explicitly: older ICU
// builds otherwise print "$1,234.0" for the same options (see the compact
// currency drift between Node versions).
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatQuotaSpendUsd = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return usdCents.format(0);
  // A few requests on a cheap model round to $0.00, which would read as unused.
  if (value < 0.005) return "<$0.01";
  return value >= 1000 ? usdWhole.format(value) : usdCents.format(value);
};

export type QuotaWindowSpend = {
  usedCostUsd: number;
  /** Share of the window used, from the same reading; null when unknown. */
  usedPercent: number | null;
  /** Cost ÷ share used: the whole window in dollars, when the share says enough. */
  windowSizeUsd: number | null;
};

export const resolveQuotaWindowSpend = (
  item: QuotaItem | null | undefined,
): QuotaWindowSpend | null => {
  const cost = item?.usedCostUsd;
  if (typeof cost !== "number" || !Number.isFinite(cost)) return null;
  const remaining = item?.percent;
  // percent is the share left; the projection divides by the share used.
  const usedPercent =
    typeof remaining === "number" && Number.isFinite(remaining)
      ? Math.min(100, Math.max(0, 100 - remaining))
      : null;
  const windowSizeUsd =
    usedPercent !== null && usedPercent >= QUOTA_WINDOW_SIZE_MIN_USED_PERCENT
      ? estimateQuotaBudgetUsd(cost, usedPercent)
      : null;
  return { usedCostUsd: Math.max(0, cost), usedPercent, windowSizeUsd };
};

export type QuotaWindowSpendText = {
  /** The amount for the row itself, e.g. "$12.34". */
  text: string;
  /** Hover text: what the amount is, what it implies, and how it is estimated. */
  title: string;
};

/** Binds the spend wording to the current language. */
export const useQuotaWindowSpendText = () => {
  const { t } = useTranslation();
  return useCallback(
    (item: QuotaItem | null | undefined): QuotaWindowSpendText | null => {
      const spend = resolveQuotaWindowSpend(item);
      if (!spend) return null;
      const amount = formatQuotaSpendUsd(spend.usedCostUsd);
      const parts = [t("m_quota.window_spend", { amount })];
      if (spend.windowSizeUsd !== null && spend.usedPercent !== null) {
        parts.push(
          t("m_quota.window_spend_size", {
            used: `${Math.round(spend.usedPercent)}%`,
            size: formatQuotaSpendUsd(spend.windowSizeUsd),
          }),
        );
      }
      parts.push(t("m_quota.window_spend_basis"));
      return { text: amount, title: parts.join(" · ") };
    },
    [t],
  );
};
