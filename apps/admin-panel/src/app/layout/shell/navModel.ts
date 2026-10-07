import type { MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { resolveMenuIcon } from "@code-proxy/ui";
import type { MenuIdentity, TenantIdentity } from "@code-proxy/api-client";

/**
 * 侧边栏的数据模型：把服务端下发的菜单树（principal.menus）整理成「分区 → 页面」两级。
 *
 * 侧边栏的顶层一行就是一个分区，所以这里统一产出 `NavSection`：
 * - 目录（directory）是一个多页分区：标题行可以展开出它的页面（收起侧边栏后改为悬停浮层）；
 * - 顶层的叶子菜单（仪表盘、系统信息这类）自成一个只有一页的分区，整行直接就是那一页的链接。
 * 排序沿用 sort_order：顶层叶子和目录按同一把尺子交错排列，系统信息（70）可以排在所有目录之后。
 */

export interface SidebarNavItem {
  menuCode: string;
  to: string;
  i18nKey: string;
  icon: LucideIcon;
  permission: string;
  sortOrder: number;
  external?: boolean;
}

export interface SidebarNavGroup {
  id: string;
  menuCode: string;
  i18nKey: string;
  icon: LucideIcon;
  sortOrder: number;
  items: readonly SidebarNavItem[];
}

export type SidebarNavEntry =
  | { kind: "item"; item: SidebarNavItem }
  | { kind: "group"; group: SidebarNavGroup };

/** 侧边栏顶层的一个分区。`single` 为真时它只有一页，整行就是那一页的链接。 */
export interface NavSection {
  id: string;
  i18nKey: string;
  icon: LucideIcon;
  items: readonly SidebarNavItem[];
  single: boolean;
}

const isSidebarLeaf = (menu: MenuIdentity) =>
  (menu.type === "menu" || menu.type === "embed" || menu.type === "link") &&
  !menu.hide_menu &&
  Boolean(menu.path);

export const menuLabelKey = (menu: MenuIdentity) => menu.label_key || menu.title || menu.code;

const toSidebarItem = (menu: MenuIdentity): SidebarNavItem => ({
  menuCode: menu.code,
  to: menu.type === "link" ? menu.link_url || menu.path : menu.path,
  i18nKey: menuLabelKey(menu),
  icon: resolveMenuIcon(menu.icon),
  permission: menu.permission_code || "",
  sortOrder: menu.sort_order,
  external: menu.type === "link",
});

/** 服务端没下发菜单时（旧版后端、管理密钥登录）保底能进的入口：菜单管理本身。 */
export const FALLBACK_NAV_GROUPS: readonly SidebarNavGroup[] = [
  {
    id: "group.system",
    menuCode: "group.system",
    i18nKey: "shell.nav_group_system",
    icon: resolveMenuIcon("settings"),
    sortOrder: 60,
    items: [
      {
        menuCode: "system.menus",
        to: "/system/menu-management",
        i18nKey: "shell.nav_menu_management",
        icon: resolveMenuIcon("menu"),
        permission: "platform.menus.read",
        sortOrder: 20,
      },
    ],
  },
];

export const FALLBACK_DASHBOARD_ITEM: SidebarNavItem = {
  menuCode: "dashboard",
  to: "/dashboard",
  i18nKey: "shell.nav_dashboard",
  icon: resolveMenuIcon("layout-dashboard"),
  permission: "dashboard.read",
  sortOrder: 10,
};

export function buildSidebarFromMenus(menus: MenuIdentity[]): {
  primaryItems: SidebarNavItem[];
  groups: SidebarNavGroup[];
} {
  const byParent = new Map<string, MenuIdentity[]>();
  for (const menu of menus) {
    const parent = menu.parent_code || "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), menu]);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  }

  const primaryItems: SidebarNavItem[] = [];
  const groups: SidebarNavGroup[] = [];
  for (const root of byParent.get("") ?? []) {
    if (root.type === "directory") {
      const items = (byParent.get(root.code) ?? []).filter(isSidebarLeaf).map(toSidebarItem);
      if (items.length === 0) continue;
      groups.push({
        id: root.code,
        menuCode: root.code,
        i18nKey: menuLabelKey(root),
        icon: resolveMenuIcon(root.icon),
        sortOrder: root.sort_order,
        items,
      });
      continue;
    }
    if (isSidebarLeaf(root)) primaryItems.push(toSidebarItem(root));
  }
  return { primaryItems, groups };
}

export function mergeSidebarEntries(
  primaryItems: readonly SidebarNavItem[],
  groups: readonly SidebarNavGroup[],
): SidebarNavEntry[] {
  const entries: SidebarNavEntry[] = [
    ...primaryItems.map((item): SidebarNavEntry => ({ kind: "item", item })),
    ...groups.map((group): SidebarNavEntry => ({ kind: "group", group })),
  ];
  entries.sort((a, b) => {
    const orderA = a.kind === "item" ? a.item.sortOrder : a.group.sortOrder;
    const orderB = b.kind === "item" ? b.item.sortOrder : b.group.sortOrder;
    if (orderA !== orderB) return orderA - orderB;
    const codeA = a.kind === "item" ? a.item.menuCode : a.group.menuCode;
    const codeB = b.kind === "item" ? b.item.menuCode : b.group.menuCode;
    return codeA.localeCompare(codeB);
  });
  return entries;
}

/** 把交错排好序的条目转成侧边栏分区：目录是多页分区，顶层叶子是单页分区。 */
export const entriesToSections = (entries: readonly SidebarNavEntry[]): NavSection[] =>
  entries.map((entry) =>
    entry.kind === "group"
      ? {
          id: entry.group.id,
          i18nKey: entry.group.i18nKey,
          icon: entry.group.icon,
          items: entry.group.items,
          single: false,
        }
      : {
          id: entry.item.menuCode,
          i18nKey: entry.item.i18nKey,
          icon: entry.item.icon,
          items: [entry.item],
          single: true,
        },
  );

/** 按「最长前缀」找当前路径对应的导航项，子路由（/x/123）也能高亮到 /x。 */
export const resolveActiveTo = (
  pathname: string,
  items: readonly SidebarNavItem[],
): string | null => {
  const sorted = [...items].sort((a, b) => b.to.length - a.to.length);
  return (
    sorted.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
  );
};

export const getPageTitleKey = (pathname: string, menus?: MenuIdentity[] | null): string => {
  if (menus?.length) {
    const ranked = menus
      .filter((menu) => menu.path)
      .sort((a, b) => b.path.length - a.path.length);
    const hit = ranked.find(
      (menu) => pathname === menu.path || pathname.startsWith(`${menu.path}/`),
    );
    if (hit) return menuLabelKey(hit);
  }
  if (pathname.startsWith("/dashboard")) return "shell.nav_dashboard";
  // 旧路径 /runtime/content-moderation 留着：前端还没刷新的旧外壳仍可能带着它进来。
  if (
    pathname.startsWith("/access/content-moderation") ||
    pathname.startsWith("/runtime/content-moderation")
  ) {
    return "shell.nav_content_moderation";
  }
  if (
    pathname.startsWith("/access/ai-accounts") ||
    pathname.startsWith("/system/account-security") ||
    pathname.startsWith("/account-security") ||
    pathname.startsWith("/auth-files")
  ) {
    return "shell.nav_ai_accounts";
  }
  if (
    pathname.startsWith("/access/api-key-permissions") ||
    pathname.startsWith("/system/api-key-permissions") ||
    pathname.startsWith("/api-key-permissions")
  ) {
    return "shell.nav_api_key_permissions";
  }
  if (pathname.startsWith("/system/menu-management") || pathname.startsWith("/menu-management")) {
    return "shell.nav_menu_management";
  }
  if (pathname.startsWith("/system/config") || pathname.startsWith("/config")) {
    return "shell.nav_config";
  }
  return "shell.page_home";
};

/**
 * 选中项的图标线宽。全局样式把 lucide 默认的 stroke-width="2" 统一压到 1.75
 * （styles/index.css），显式传 2 也会被同一条规则命中，所以这里用 2.25：
 * 不等于 2 才能绕开那条规则，视觉上就是「选中时线条加粗一档」。
 */
export const ACTIVE_ICON_STROKE = 2.25;

/** 带修饰键或非左键的点击交给浏览器（新标签页打开等），不走站内导航。 */
export const shouldUseNativeNavigation = (event: MouseEvent<HTMLAnchorElement>) =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.altKey ||
  event.ctrlKey ||
  event.shiftKey ||
  Boolean(event.currentTarget.target && event.currentTarget.target !== "_self");

export const tenantDisplayName = (tenant: TenantIdentity, systemTenantLabel: string) =>
  tenant.type === "system" ? systemTenantLabel : tenant.name;
