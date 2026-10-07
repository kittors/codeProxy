import type { EndUser } from "@code-proxy/api-client";
import { normalizePeriodSpendingLimits } from "@code-proxy/api-client";
import { validateDisplayName, validatePassword } from "@code-proxy/domain";
import { rules, type Rule } from "@code-proxy/ui";
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

/**
 * 弹窗标题、对象卡片里的账号名：昵称和用户名不同时写成「昵称 / 用户名」，
 * 只有一个（或两者相同）时只写一个，避免出现「Bob / Bob」。
 */
export const endUserLabel = (user: EndUser): string => {
  const displayName = user.display_name.trim();
  const username = user.username.trim();
  return displayName && displayName !== username
    ? `${displayName} / ${username}`
    : displayName || username;
};

/*
 * 门户账号字段规则：判断沿用 @code-proxy/domain 里与 CliRelay 对齐的校验器，失败码与
 * `validation.*` 文案键同名，不用再维护一张「失败码 → 文案」的映射。
 * 门户用户名后端只做小写化与重名自动加后缀，没有字符集限制，所以这里只要求非空。
 */
export const displayNameRules: readonly Rule<string>[] = [
  rules.required(),
  rules.custom<string>((value) => {
    const result = validateDisplayName(value);
    return result.ok || result.code;
  }),
];

/** 密码留空 = 由服务端生成（创建）/ 不修改（编辑）；填了就必须满足服务端同一套密码策略。 */
export const optionalPasswordRules: readonly Rule<string>[] = [
  rules.custom<string>((value) => {
    if (!value) return true;
    const result = validatePassword(value);
    return result.ok || result.code;
  }),
];

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
