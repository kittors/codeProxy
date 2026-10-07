import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import {
  buildSidebarFromMenus,
  entriesToSections,
  FALLBACK_DASHBOARD_ITEM,
  FALLBACK_NAV_GROUPS,
  mergeSidebarEntries,
  tenantDisplayName,
  type NavSection,
  type SidebarNavItem,
} from "./navModel";

/**
 * 当前用户能看到的导航：按权限（can）与菜单状态（enabled / visible / hide_menu，沿父链逐级判断）
 * 过滤后的分区列表。桌面侧边栏（展开 / 收起后的浮层）与手机抽屉都从这里取，保证几处一致。
 */
export function useShellNav(): { sections: NavSection[]; items: SidebarNavItem[] } {
  const auth = useOptionalAuth();
  const can = auth?.can ?? (() => true);
  const principal = auth?.state.principal ?? null;

  const menuByCode = useMemo(
    () => (principal?.menus ? new Map(principal.menus.map((menu) => [menu.code, menu])) : null),
    [principal?.menus],
  );
  const menuIsVisible = useCallback(
    (code: string) => {
      if (!menuByCode) return true;
      let current = menuByCode.get(code);
      while (current) {
        if (!current.enabled || !current.visible || current.hide_menu) return false;
        current = current.parent_code ? menuByCode.get(current.parent_code) : undefined;
      }
      return true;
    },
    [menuByCode],
  );
  const builtNav = useMemo(() => {
    if (principal?.menus?.length) return buildSidebarFromMenus(principal.menus);
    return { primaryItems: [FALLBACK_DASHBOARD_ITEM], groups: [...FALLBACK_NAV_GROUPS] };
  }, [principal?.menus]);
  const canSeeMenuItem = useCallback(
    (item: { permission?: string; menuCode?: string }) => {
      if (!item.permission) return true;
      if (can(item.permission)) return true;
      // After API Keys → 用户账号 entry move: legacy key admins still see the user menu.
      if (item.menuCode === "access.end-users" && can("api_keys.read")) return true;
      return false;
    },
    [can],
  );

  return useMemo(() => {
    const visiblePrimaryItems = builtNav.primaryItems.filter(
      (item) => canSeeMenuItem(item) && menuIsVisible(item.menuCode),
    );
    const visibleGroups = builtNav.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canSeeMenuItem(item) && menuIsVisible(item.menuCode)),
      }))
      .filter((group) => menuIsVisible(group.menuCode) && group.items.length > 0);
    // 顶层叶子与目录按 sort_order 交错：系统信息（70）这类叶子可以排在所有目录之后。
    const sections = entriesToSections(mergeSidebarEntries(visiblePrimaryItems, visibleGroups));
    return { sections, items: sections.flatMap((section) => section.items) };
  }, [builtNav, canSeeMenuItem, menuIsVisible]);
}

/** 账号入口要展示的名字、所在租户与头像缩写。 */
export function useAccountIdentity() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const principal = auth?.state.principal ?? null;

  const name = principal?.user.role_codes?.includes("platform_super_admin")
    ? t("identity_admin.super_administrator")
    : principal?.user.display_name || principal?.user.username || "Admin";
  const tenant = principal
    ? tenantDisplayName(principal.effective_tenant, t("shell.system_tenant"))
    : t("shell.sidebar_account_role");
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AD";

  return { name, tenant, initials };
}
