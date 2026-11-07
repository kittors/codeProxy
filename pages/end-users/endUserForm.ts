import type { EndUser } from "@code-proxy/api-client";
import { resettableWindows } from "@features/access-policy";

/**
 * Whether the account has anything a reset can act on: any window limited by a
 * spending, request or token cell of its matrix, or by a per-model rule. The
 * cumulative allowance counts too: granting it again is the only way to make a
 * spent-out account usable.
 */
export const hasResettableQuota = (user: EndUser): boolean =>
  resettableWindows(user["quota-limits"], user["model-rules"]).length > 0;

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

/** 创建账号的表单（编辑走 accountEditForm）。 */
export type EndUserForm = {
  username: string;
  displayName: string;
  password: string;
  /** 创建即绑定的权限模板；空表示暂不绑定。 */
  permissionProfileId: string;
};

export const emptyForm = (): EndUserForm => ({
  username: "",
  displayName: "",
  password: "",
  permissionProfileId: "",
});
