import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { BRAND_NAME, LogoMark } from "@code-proxy/assets";
import { ScrollArea } from "@code-proxy/ui";
import { AccountMenu } from "./AccountMenu";
import type { NavSection } from "./navModel";
import { SidebarItemLink } from "./SidebarItemLink";
import { useAccountIdentity } from "./useShellNav";
import type { RouteNavigation } from "./useRouteNavigation";

/**
 * 手机上的导航抽屉：屏幕窄到放不下图标栏 + 面板，改成一整列——分区名做小标题，
 * 下面直接列出页面。抽屉和遮罩常驻在 body 下（只切换位移与透明度），开合都有过渡，
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
  const account = useAccountIdentity();

  return createPortal(
    <>
      <button
        type="button"
        data-testid="app-shell-mobile-sidebar-backdrop"
        className={[
          "fixed inset-0 z-30 bg-black/25 dark:bg-black/55",
          "motion-reduce:transition-none motion-safe:transition-opacity motion-safe:duration-[320ms] motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          open ? "opacity-100" : "pointer-events-none opacity-0",
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
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-panel shadow-dialog",
          "will-change-transform motion-reduce:transition-none motion-safe:transition-transform motion-safe:duration-[320ms] motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-15 shrink-0 items-center gap-3 px-5">
          <LogoMark size={26} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-base font-semibold tracking-tight text-ink">
              {t("shell.console")}
            </span>
            <span className="block font-display text-2xs text-ink-3">{BRAND_NAME}</span>
          </span>
        </div>
        <ScrollArea className="min-h-0 flex-1" scrollbarVisibility="track-hover">
          <nav aria-label={t("shell.nav_sections", { defaultValue: "Sections" })} className="px-2.5 pb-4">
            {sections.map((section) => (
              <div key={section.id} className="pt-3 first:pt-0">
                {section.single ? null : (
                  <div className="px-2.5 pb-1 text-xs font-medium text-ink-3">
                    {t(section.i18nKey, { defaultValue: section.i18nKey })}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <SidebarItemLink
                      key={item.to}
                      item={item}
                      label={t(item.i18nKey, { defaultValue: item.i18nKey })}
                      active={activeTo === item.to}
                      onNavigate={nav.handleNavClick}
                      onWarm={nav.warmPageRoute}
                      onSelect={onClose}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>
        <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-3">
          <AccountMenu onLogout={onLogout} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-ink">{account.name}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-3">{account.tenant}</span>
          </span>
        </div>
      </aside>
    </>,
    document.body,
  );
}
