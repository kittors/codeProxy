import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageBackground } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { MobileSidebar } from "./shell/MobileSidebar";
import { getPageTitleKey, resolveActiveTo } from "./shell/navModel";
import { ShellTopBar } from "./shell/ShellTopBar";
import { Sidebar } from "./shell/Sidebar";
import { useRouteNavigation } from "./shell/useRouteNavigation";
import { useShellNav } from "./shell/useShellNav";

const STORAGE_KEY_SIDEBAR_COLLAPSED = "cli-proxy-sidebar-collapsed";
const SIDEBAR_MOBILE_MEDIA = "(max-width: 767px)";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia?.(SIDEBAR_MOBILE_MEDIA).matches ?? false,
  );

  useEffect(() => {
    const mq = window.matchMedia?.(SIDEBAR_MOBILE_MEDIA);
    if (!mq) return;

    const update = () => setIsMobile(mq.matches);
    update();

    window.addEventListener("resize", update);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => {
        window.removeEventListener("resize", update);
        mq.removeEventListener("change", update);
      };
    }

    const legacy = mq as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    legacy.addListener?.(update);
    return () => {
      window.removeEventListener("resize", update);
      legacy.removeListener?.(update);
    };
  }, []);

  return isMobile;
}

/**
 * 控制台外壳：一条侧边栏（分区导航）| 内容区。
 *
 * - 内容区是嵌在灰底上的圆角白卡片，侧边栏直接画在灰底上，两者之间不需要分隔线。
 * - 桌面端可以把侧边栏收成图标栏（⌘B / Ctrl+B 或点 Logo），收起状态记在 localStorage；
 *   收起后多页分区改为悬停弹出浮层。
 * - 手机端（< 768px）没有侧边栏，导航收进抽屉，路由变化时自动收起，打开时锁住页面滚动；
 *   内容区铺满屏幕，不再留边距和圆角。
 * - 导航统一走 useRouteNavigation：先预加载目标页再切路由，期间窗口顶端有进度条。
 */
export function AppShell({ children, onLogout }: PropsWithChildren<{ onLogout?: () => void }>) {
  const location = useLocation();
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const logout = useMemo(() => onLogout ?? (() => {}), [onLogout]);
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setMobileNavOpen(false);
  }, [isMobile, location.pathname]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobile, mobileNavOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, desktopCollapsed ? "1" : "0");
    } catch {
      // 忽略持久化失败
    }
  }, [desktopCollapsed]);

  const { sections, items } = useShellNav();
  const nav = useRouteNavigation();

  // 点击后立刻按目标高亮（pendingTo），不等懒加载与路由更新。
  const activeTo = useMemo(
    () => resolveActiveTo(nav.pendingTo || location.pathname, items),
    [items, location.pathname, nav.pendingTo],
  );
  const activeSection = useMemo(
    () => sections.find((section) => section.items.some((item) => item.to === activeTo)) ?? null,
    [activeTo, sections],
  );

  const toggleDesktop = useCallback(() => setDesktopCollapsed((prev) => !prev), []);
  const toggleMobile = useCallback(() => setMobileNavOpen((prev) => !prev), []);

  // ⌘B / Ctrl+B 收起或展开侧边栏。焦点在输入框、编辑器里时不拦截——那里 ⌘B 是加粗。
  useEffect(() => {
    if (isMobile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || event.shiftKey || event.altKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
      ) {
        return;
      }
      event.preventDefault();
      toggleDesktop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile, toggleDesktop]);

  const titleKey = getPageTitleKey(location.pathname, auth?.state.principal?.menus);
  const activeItem = activeSection?.items.find((item) => item.to === activeTo) ?? null;
  const pageLabel = activeItem
    ? t(activeItem.i18nKey, { defaultValue: activeItem.i18nKey })
    : t(titleKey);
  const sectionLabel =
    activeSection && !activeSection.single
      ? t(activeSection.i18nKey, { defaultValue: activeSection.i18nKey })
      : null;
  const collapsed = !isMobile && desktopCollapsed;

  return (
    <PageBackground variant="app">
      <a
        href="#main-content"
        className="sr-only z-[200] rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-pop focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        {t("shell.skip_to_content")}
      </a>
      {nav.pendingTo ? <div className={nav.progressDone ? "rp rp-done" : "rp"} /> : null}
      {isMobile ? (
        <MobileSidebar
          open={mobileNavOpen}
          sections={sections}
          activeTo={activeTo}
          nav={nav}
          onClose={() => setMobileNavOpen(false)}
          onLogout={logout}
        />
      ) : null}
      <div className="flex h-[100dvh] overflow-hidden bg-rail">
        {isMobile ? null : (
          <Sidebar
            sections={sections}
            activeTo={activeTo}
            collapsed={collapsed}
            nav={nav}
            onToggleSidebar={toggleDesktop}
            onLogout={logout}
          />
        )}
        <div
          className={[
            "flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas",
            // 内容区就是页面的面板：伪元素细边 + 堆叠投影把它从窗口底色上托起来，不画 ring/border。
            isMobile ? "" : "cp-edge my-2 mr-2 rounded-2xl shadow-card",
          ].join(" ")}
        >
          <ShellTopBar
            titleKey={titleKey}
            sectionLabel={sectionLabel}
            pageLabel={pageLabel}
            isMobile={isMobile}
            mobileNavOpen={mobileNavOpen}
            onToggleMobileNav={toggleMobile}
          />
          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            {/*
             * 默认 min-h-full：内容长了 main 跟着长高，底部内边距排在内容之后。
             * 页面根声明了 data-page-fill 时改 h-full，给「表格吃满剩余高度、内部滚动」的
             * 页面一条确定高度的 flex 链（见 DashboardLayout 的说明）。
             */}
            <main
              id="main-content"
              tabIndex={-1}
              className={[
                "flex min-h-full flex-col px-4 pt-1 pb-4 focus-visible:outline-none sm:px-6 sm:pb-6",
                "has-[[data-page-fill=always]]:h-full md:has-[[data-page-fill=md]]:h-full",
              ].join(" ")}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </PageBackground>
  );
}
