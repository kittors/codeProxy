import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommandItem } from "satin-ui";
import { CommandPalette } from "satin-ui/react";
import { useTheme } from "@code-proxy/ui";
import type { NavSection, SidebarNavItem } from "./navModel";
import type { RouteNavigation } from "./useRouteNavigation";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
const SIDEBAR_SHORTCUT = IS_MAC ? "⌘B" : "Ctrl+B";

/** 按路由与菜单码映射到 Satin 内置图标名（vendor/satin-ui/src/icons.js）。 */
function resolveSatinNavIcon(item: SidebarNavItem): string {
  const token = `${item.menuCode} ${item.to}`.toLowerCase();
  if (token.includes("dashboard")) return "layout-dashboard";
  if (token.includes("monitor") || token.includes("usage") || token.includes("analytics") || token.includes("quota")) {
    return "chart-column";
  }
  if (token.includes("api-key") || token.includes("apikey") || token.includes("key")) return "key-round";
  if (token.includes("user") || token.includes("tenant") || token.includes("role") || token.includes("account")) {
    return "users";
  }
  if (token.includes("security") || token.includes("moderation") || token.includes("privacy") || token.includes("ip-access") || token.includes("fingerprint")) {
    return "shield";
  }
  if (token.includes("billing") || token.includes("payment") || token.includes("order") || token.includes("pricing")) {
    return "credit-card";
  }
  if (token.includes("invoice") || token.includes("request-log") || token.includes("audit")) return "receipt";
  if (token.includes("log")) return "file-text";
  if (token.includes("alert")) return "bell";
  if (token.includes("image")) return "image";
  if (token.includes("video")) return "film";
  if (token.includes("model") || token.includes("plaza")) return "sparkles";
  if (token.includes("channel") || token.includes("group")) return "layers";
  if (token.includes("proxy") || token.includes("proxies")) return "git-fork";
  if (token.includes("provider") || token.includes("upstream") || token.includes("plug")) return "plug";
  if (token.includes("system") || token.includes("server") || token.includes("cluster")) return "server";
  if (token.includes("menu")) return "list";
  if (token.includes("config") || token.includes("setting")) return "settings";
  return "file-text";
}

/**
 * 控制台全局命令面板：包装 Satin 原生 `<CommandPalette>`。
 *
 * 按需挂载设计：未打开时不向 `document.body` 注入隐藏的 listbox/option 节点，既保持首屏零 DOM
 * 开销，也避免关闭状态下的菜单副本干扰页面可访问树与测试查询；关闭后等待 240ms 退场动画结束再卸载。
 */
export function ShellCommandPalette({
  open,
  onOpenChange,
  sections,
  isMobile,
  collapsed,
  nav,
  onToggleSidebar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly NavSection[];
  isMobile: boolean;
  collapsed: boolean;
  nav: RouteNavigation;
  onToggleSidebar: () => void;
}) {
  const { t } = useTranslation();
  const {
    state: { mode },
    actions: { toggle: toggleTheme },
  } = useTheme();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(timer);
  }, [mounted, open]);

  // 全局 ⌘K / Ctrl+K 快捷键：打开或收起命令面板，避开已有模态弹窗以免抢占焦点。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || event.shiftKey || event.altKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (!open && document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) {
        return;
      }
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  const { groups, actions } = useMemo(() => {
    const actionMap = new Map<CommandItem, () => void>();
    const pageItems: CommandItem[] = [];

    for (const section of sections) {
      const sectionTitle = section.single
        ? ""
        : t(section.i18nKey, { defaultValue: section.i18nKey });
      for (const item of section.items) {
        const label = t(item.i18nKey, { defaultValue: item.i18nKey });
        const entry: CommandItem = {
          name: label,
          icon: resolveSatinNavIcon(item),
          sub: sectionTitle || undefined,
          keys: `${item.menuCode} ${item.to} ${sectionTitle}`.trim(),
        };
        actionMap.set(entry, () => {
          if (item.external) {
            window.open(item.to, "_blank", "noopener,noreferrer");
            return;
          }
          nav.startNavigation(item.to);
        });
        pageItems.push(entry);
      }
    }

    const quickItems: CommandItem[] = [];
    const themeEntry: CommandItem = {
      name: mode === "dark" ? t("theme.switch_to_light") : t("theme.switch_to_dark"),
      icon: mode === "dark" ? "sun" : "moon",
      keys: "theme dark light 外观 主题 深色 浅色",
    };
    actionMap.set(themeEntry, toggleTheme);
    quickItems.push(themeEntry);

    if (!isMobile) {
      const sidebarEntry: CommandItem = {
        name: collapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar"),
        icon: "panel-left",
        key: SIDEBAR_SHORTCUT,
        keys: "sidebar toggle collapse expand 侧边栏 折叠 展开",
      };
      actionMap.set(sidebarEntry, onToggleSidebar);
      quickItems.push(sidebarEntry);
    }

    const nextGroups: { name: string; items: CommandItem[] }[] = [];
    if (pageItems.length > 0) {
      nextGroups.push({
        name: t("shell.cmdk_group_pages", { defaultValue: "页面导航" }),
        items: pageItems,
      });
    }
    if (quickItems.length > 0) {
      nextGroups.push({
        name: t("shell.cmdk_group_actions", { defaultValue: "快捷操作" }),
        items: quickItems,
      });
    }
    return { groups: nextGroups, actions: actionMap };
  }, [collapsed, isMobile, mode, nav, onToggleSidebar, sections, t, toggleTheme]);

  const handleRun = useCallback(
    (item: CommandItem) => {
      onOpenChange(false);
      actions.get(item)?.();
    },
    [actions, onOpenChange],
  );

  const emptyText = t("shell.cmdk_empty", { defaultValue: "没有找到匹配项" });
  const renderEmpty = useCallback(() => emptyText, [emptyText]);

  if (!mounted) return null;

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      hotkey={false}
      groups={groups}
      onRun={handleRun}
      placeholder={t("shell.cmdk_placeholder", { defaultValue: "搜索页面或快捷操作…" })}
      enterLabel={t("shell.cmdk_enter", { defaultValue: "打开" })}
      empty={renderEmpty}
    />
  );
}
