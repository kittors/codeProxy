import type { EndUser } from "@code-proxy/api-client";
import { normalizePeriodSpendingLimits } from "@code-proxy/api-client";
import { emptyPeriodSpendingDraft, remainingQuotaUsd } from "@features/period-spending";
import type { PeriodSpendingDraft } from "@features/period-spending";

/**
 * Whether the account has anything a reset can act on. The cumulative allowance
 * counts: granting it again is the only way to make a spent-out account usable,
 * yet it lives outside the rolling period limits, so gating on those alone left
 * lifetime-only accounts with the action permanently disabled.
 */
export const hasResettableQuota = (user: EndUser): boolean =>
  Object.values(
    normalizePeriodSpendingLimits(user["period-spending-limits"], user["daily-spending-limit"]),
  ).some((limit) => limit > 0) || (user["spending-limit"] ?? 0) > 0;

export type EndUserForm = {
  username: string;
  displayName: string;
  password: string;
  permissionProfileId: string;
  spendingLimit: string;
  dailyLimit: string;
  totalQuota: string;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  periodSpending: PeriodSpendingDraft;
};
export const emptyForm = (): EndUserForm => ({
  username: "",
  displayName: "",
  password: "",
  permissionProfileId: "",
  spendingLimit: "",
  dailyLimit: "",
  totalQuota: "",
  concurrencyLimit: "",
  rpmLimit: "",
  tpmLimit: "",
  periodSpending: emptyPeriodSpendingDraft(),
});
export /**
 * The lifetime input shows what is still spendable, not the configured cap.
 * Saving stores the entered number as the new cap, so the "did the operator
 * change it?" check below must compare against this displayed value — comparing
 * against the stored cap would treat merely opening the modal as an edit and
 * shrink the cap to the remaining amount on every save.
 */
const lifetimeRemainingText = (user: EndUser | null): string => {
  const limit = user?.["spending-limit"] ?? 0;
  if (!Number.isFinite(limit) || limit <= 0) return "";
  return limitToText(remainingQuotaUsd(limit, user?.["lifetime-spending-used"]));
};
export const spendingLimitFromText = (value: string): number => {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
};
export const requestLimitFromText = (value: string): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
export const limitToText = (value: number | undefined): string =>
  value && value > 0 ? String(value) : "";
