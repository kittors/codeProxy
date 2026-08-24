import type { QuotaState } from "@features/quota-preview/quota-helpers";

/**
 * Whether a quota area with no rows should hold placeholders rather than say
 * the account has no quota.
 *
 * Two probes reach the same account and only one of them marks it loading. A
 * refresh the reader asked for does (`status: "loading"`), so it gets
 * placeholders outright. The probe that fires on entering the page is
 * deliberately silent, to stop cards that already hold values from flickering —
 * but a card that has never had values would otherwise sit on "no quota" until
 * the response lands, stating a conclusion the page has not reached yet.
 *
 * So the silent probe shows placeholders too, but only before the first result
 * ever arrives for that account. Once anything has come back, "no quota" is a
 * real answer and later background probes leave it alone rather than blinking
 * the card grey every refresh interval.
 */
export const shouldShowQuotaPlaceholder = (
  state: Pick<QuotaState, "status" | "updatedAt"> | undefined,
  pageProbing: boolean,
): boolean => {
  if (state?.status === "loading") return true;
  if (!pageProbing) return false;
  if (state?.status === "error") return false;
  return !state?.updatedAt;
};
