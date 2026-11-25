import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import { ScrollArea } from "@code-proxy/ui";
import { BRAND_NAME, LogoMark } from "@code-proxy/assets";
import { AccountMenu } from "./AccountMenu";
import type { NavSection } from "./navModel";
import { SidebarNav } from "./SidebarNav";
import { sidebarFadeClass } from "./sidebarRow";
import type { RouteNavigation } from "./useRouteNavigation";

/** 收起快捷键的提示文字：苹果设备显示 ⌘B，其余显示 Ctrl+B。 */
const SHORTCUT_HINT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘B" : "Ctrl+B";

/**
 * 桌面端侧边栏：一整条，顶部 Logo 与产品名，中间是分区导航，底部是账号。
 *
 * 收起时宽度从 16rem 过渡到 3.75rem（面板根字号 14.4px 下约 230px → 54px），所有行同步收窄到只剩图标格：
 * 图标位置不变，文字淡出，展开的分区把子项折叠起来，分区改为悬停弹出浮层。
 * 展开态右上角同时提供显性折叠图标按钮，用户无需猜测悬停 Logo 即可直观收起侧边栏。
 */
export function Sidebar({
  sections,
  activeTo,
  collapsed,
  nav,
  onToggleSidebar,
  onLogout,
}: {
  sections: readonly NavSection[];
  activeTo: string | null;
  collapsed: boolean;
  nav: RouteNavigation;
  onToggleSidebar: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = collapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar");

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={[
        "relative z-30 flex h-full shrink-0 flex-col overflow-hidden bg-[var(--sn-side-bg)] pb-2.5",
        "transition-[width] duration-300 ease-[var(--sn-ease-open)] motion-reduce:transition-none",
        collapsed ? "w-14" : "w-64",
      ].join(" ")}
    >
      {/* 顶栏高 44px（h-11），与右侧 ShellTopBar 严格同高同中轴；w-14(56px) 收起态下 px-3(24px) + size-8(32px) 与下方导航图标同竖轴。 */}
      <div className="flex h-11 shrink-0 items-center px-3">
        {/*
          Logo 与收起按钮叠在同一个位置：平时显示 Logo，悬停或键盘聚焦时换成侧栏图标，
          点击切换收起/展开。两种状态共用一个按钮，所以收起前后它的位置和大小都不会变。
        */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={toggleLabel}
          aria-keyshortcuts="Meta+B Control+B"
          data-sidebar-toggle="true"
          data-tooltip={`${toggleLabel}  ${SHORTCUT_HINT}`}
          data-tooltip-placement="right"
          className="group/logo grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-colors duration-150 ease-[var(--sn-ease-out)] hover:bg-[var(--sn-fill-hover)] focus-visible:bg-[var(--sn-fill-hover)]"
        >
          <span
            data-sidebar-logo="true"
            className="col-start-1 row-start-1 grid place-items-center transition-[opacity,scale] duration-150 ease-[var(--sn-ease-out)] group-hover/logo:scale-90 group-hover/logo:opacity-0 group-focus-visible/logo:scale-90 group-focus-visible/logo:opacity-0"
          >
            <LogoMark size={22} />
          </span>
          <Icon
            name="panel-left"
            size={17}
            className="col-start-1 row-start-1 scale-90 text-[var(--sn-label2)] opacity-0 transition-[opacity,scale] duration-200 ease-[var(--sn-ease-out-strong)] group-hover/logo:scale-100 group-hover/logo:opacity-100 group-focus-visible/logo:scale-100 group-focus-visible/logo:opacity-100"
          />
        </button>
        <span
          aria-hidden={collapsed}
          className={`ml-2 min-w-0 flex-1 overflow-hidden leading-tight whitespace-nowrap ${sidebarFadeClass(collapsed)}`}
        >
          <span className="block truncate text-sm font-semibold tracking-tight text-[var(--sn-label)]">
            {t("shell.console")}
          </span>
          <span className="block truncate font-display text-2xs text-[var(--sn-label3)]">
            {BRAND_NAME}
          </span>
        </span>
        {/* 展开态右上角显性收起入口：方便视觉用户一眼发现折叠能力，aria-hidden 避免与主切换钮重复读屏。 */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onToggleSidebar}
          data-tooltip={collapsed ? undefined : `${toggleLabel}  ${SHORTCUT_HINT}`}
          data-tooltip-placement="bottom"
          className={[
            "sn-btn sn-ghost sn-sm sn-ibtn ml-1 shrink-0 text-[var(--sn-label3)] hover:text-[var(--sn-label)]",
            sidebarFadeClass(collapsed),
            collapsed ? "pointer-events-none" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Icon name="panel-left" size={15} />
        </button>
      </div>
      {/* 展开时上下渐隐；收起时关掉——渐隐用的 mask 会把伸出侧边栏的分区浮层一起裁掉。 */}
      <ScrollArea
        className="min-h-0 flex-1 [&_[data-scroll-area-scrollbar='y']]:right-0.5"
        scrollbarVisibility="track-hover"
        scrollbarTrackInset={8}
        edgeFade={!collapsed}
      >
        <SidebarNav sections={sections} activeTo={activeTo} collapsed={collapsed} nav={nav} />
      </ScrollArea>
      <div className="shrink-0 px-3 pt-1.5">
        <AccountMenu onLogout={onLogout} collapsed={collapsed} />
      </div>
    </aside>
  );
}
