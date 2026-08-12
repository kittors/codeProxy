/**
 * Quota meta lines ("$40.00 / $50.00", period ranges) as rendered next to a
 * window's countdown. Extracted from useAuthFilesFilesPresentation so the card
 * detail line and the chip meta slot share one set of rules.
 */

/** Raw ISO period ranges, e.g. "2026-07-16T06:45:51+00:00 - …". */
const ISO_PERIOD_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MONEY_PATTERN = /\$\s*(-?[\d,]+(?:\.\d+)?)/g;

export const quotaMetaHasMoney = (meta: string): boolean => meta.includes("$");

/**
 * True when every amount in the line is zero, e.g. "$0.00 / $0.00".
 *
 * Upstreams report an unfunded balance this way, so the line states no budget
 * out of no budget — it costs a row on the card and tells the reader nothing
 * the countdown next to it does not already say.
 */
export const isZeroMoneyQuotaMeta = (meta: string): boolean => {
  const amounts = [...meta.matchAll(MONEY_PATTERN)];
  if (amounts.length === 0) return false;
  return amounts.every((match) => {
    const value = Number.parseFloat(match[1].replaceAll(",", ""));
    return Number.isFinite(value) && value === 0;
  });
};

/** Meta worth rendering: not an ISO period range, not an all-zero money line. */
export const resolveDisplayableQuotaMeta = (
  meta: string | null | undefined,
): string | null => {
  const trimmed = meta?.trim();
  if (!trimmed) return null;
  if (ISO_PERIOD_PATTERN.test(trimmed)) return null;
  if (isZeroMoneyQuotaMeta(trimmed)) return null;
  return trimmed;
};
