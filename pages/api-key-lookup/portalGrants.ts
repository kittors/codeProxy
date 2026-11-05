import type { ApiKeyLookupTab } from "./components/LookupResultsToolbar";

/**
 * 门户账号从 /v0/portal/auth/me 拿到的、和标签有关的两件事。
 *
 * - 敏感词：只给管理员允许的账号。
 * - 隐私脱敏：后端在 capabilities 里声明了 `privacy-masking` 就有这个标签，而且一律只读——要不要
 *   脱敏、遮什么由管理员决定，门户只让用户知道脱敏怎么做、自己的请求遮了什么。旧后端不声明，也没有
 *   门户脱敏接口，就既不给标签、也不发任何请求——面板会自动更新到仍是旧后端的部署上。
 */
export interface PortalGrants {
  words: boolean;
  /** 后端有门户脱敏。 */
  privacyMasking: boolean;
}

export const NO_PORTAL_GRANTS: PortalGrants = { words: false, privacyMasking: false };

/** 字段缺省按旧后端处理（单测里 me() 的假数据也常常不带它们）。 */
export const portalGrantsOf = (me: {
  wordPolicyAllowed?: boolean;
  privacyMasking?: boolean;
}): PortalGrants => ({
  words: me.wordPolicyAllowed === true,
  privacyMasking: me.privacyMasking === true,
});

/** 当前账号还有没有这个标签：退出、切换账号、权限被收回后不再停在没有的标签上。 */
export function portalTabAvailable(
  tab: ApiKeyLookupTab,
  signedIn: boolean,
  grants: PortalGrants,
): boolean {
  if (tab === "words") return signedIn && grants.words;
  if (tab === "privacy") return signedIn && grants.privacyMasking;
  return true;
}
