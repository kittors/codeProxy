import type { ApiKeyLookupTab } from "./components/LookupResultsToolbar";

/**
 * 门户账号从 /v0/portal/auth/me 拿到的自助权限。
 *
 * 敏感词只给管理员允许的账号。隐私脱敏只要后端支持就有这个标签：不允许自设的只读，记录照样看；
 * 后端没说（旧后端不带 privacy_masking_allowed）就既没有标签、也不发任何门户脱敏请求——面板会自动
 * 更新到仍是旧后端的部署上。
 */
export interface PortalGrants {
  words: boolean;
  /** 能否自己设置脱敏；null 是后端没有门户脱敏。 */
  privacyMasking: boolean | null;
}

export const NO_PORTAL_GRANTS: PortalGrants = { words: false, privacyMasking: null };

/** 字段缺省按旧后端处理（单测里 me() 的假数据也常常不带它们）。 */
export const portalGrantsOf = (me: {
  wordPolicyAllowed?: boolean;
  privacyMaskingAllowed?: boolean | null;
}): PortalGrants => ({
  words: me.wordPolicyAllowed === true,
  privacyMasking: typeof me.privacyMaskingAllowed === "boolean" ? me.privacyMaskingAllowed : null,
});

/** 当前账号还有没有这个标签：退出、切换账号、权限被收回后不再停在没有的标签上。 */
export function portalTabAvailable(
  tab: ApiKeyLookupTab,
  signedIn: boolean,
  grants: PortalGrants,
): boolean {
  if (tab === "words") return signedIn && grants.words;
  if (tab === "privacy") return signedIn && grants.privacyMasking !== null;
  return true;
}
