import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BRAND_NAME, LogoMark } from "@code-proxy/assets";
import { ScrollArea } from "@code-proxy/ui";
import { AccountMenu } from "./AccountMenu";
import type { NavSection } from "./navModel";
import { SidebarNav } from "./SidebarNav";
import type { RouteNavigation } from "./useRouteNavigation";

/**
 * 手机上的导航抽屉：内容和桌面侧边栏展开时完全一样（同一个 SidebarNav，分区可展开），
 * 只是从左侧滑出。抽屉和遮罩常驻在 body 下（只切换位移与透明度），开合都有过渡，
 * 关闭后不可聚焦。点了页面立刻收起，不等路由切换完成。
 */
export function MobileSidebar({
  open,
  sections,
  activeTo,
  nav,
  onClose,
  onLogout,
}: {
  open: boolean;
  sections: readonly NavSection[];
  activeTo: string | null;
  nav: RouteNavigation;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();

  return createPortal(
    <>
      <button
        type="button"
        data-testid="app-shell-mobile-sidebar-backdrop"
        className={[
          // 对齐 Satin .sn-drawer-scrim 轻压暗遮罩与 200ms / 220ms 淡入淡出节奏
          "fixed inset-0 z-30 bg-black/15 dark:bg-black/45",
          "motion-reduce:transition-none motion-safe:transition-opacity",
          open
            ? "opacity-100 motion-safe:duration-200 motion-safe:ease-[var(--sn-ease-out)]"
            : "pointer-events-none opacity-0 motion-safe:duration-[220ms] motion-safe:ease-[var(--sn-ease-in)]",
        ].join(" ")}
        aria-label={t("common.close")}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        data-mobile-open={open ? "true" : "false"}
        aria-hidden={!open}
        inert={!open}
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-sn-shell py-2 shadow-[var(--sn-e2)]",
          "will-change-transform motion-reduce:transition-none motion-safe:transition-transform",
          // 对齐 Satin .sn-drawer：打开 320ms --sn-ease-open，关闭 220ms --sn-ease-in
          open
            ? "translate-x-0 motion-safe:duration-[320ms] motion-safe:ease-[var(--sn-ease-open)]"
            : "pointer-events-none -translate-x-full motion-safe:duration-[220ms] motion-safe:ease-[var(--sn-ease-in)]",
        ].join(" ")}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <span className="grid size-8 shrink-0 place-items-center">
            <LogoMark size={22} />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-tight text-sn-label">
              {t("shell.console")}
            </span>
            <span className="block font-display text-2xs text-sn-label3">{BRAND_NAME}</span>
          </span>
        </div>
        <ScrollArea className="min-h-0 flex-1" scrollbarVisibility="track-hover" edgeFade>
          <SidebarNav
            sections={sections}
            activeTo={activeTo}
            collapsed={false}
            nav={nav}
            onSelect={onClose}
          />
        </ScrollArea>
        <div className="shrink-0 px-3 pt-1">
          <AccountMenu onLogout={onLogout} />
        </div>
      </aside>
    </>,
    document.body,
  );
}
