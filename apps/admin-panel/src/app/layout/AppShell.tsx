import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageBackground, ScrollFade } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { MobileSidebar } from "./shell/MobileSidebar";
import { getPageTitleKey, resolveActiveTo } from "./shell/navModel";
import { ShellCommandPalette } from "./shell/ShellCommandPalette";
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
 * Satin 三层工作台外壳（Layer 0 统一外壳底座 `--sn-shell` → Layer 1 主内容工作板 `--sn-workspace`）：
 *
 * - 侧边栏与顶部工具栏连贯落在 `--sn-shell` 上，44px 顶栏严格同高齐平；
 * - 主内容工作板（`.cp-work-board`）桌面端仅左上角 10px 柔和圆角 + 顶/左 1px 细线，右缘与底缘
 *   贴合视口，消除老版四周灰缝与悬浮白盒感；
 * - 桌面端支持 ⌘B / Ctrl+B 收起侧边栏，全端支持 ⌘K / Ctrl+K 打开 Satin 原生命令面板快速跳转；
 * - 手机端（< 768px）导航收进抽屉，工作板直铺满屏。
 */
export function AppShell({ children, onLogout }: PropsWithChildren<{ onLogout?: () => void }>) {
  const location = useLocation();
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const logout = useMemo(() => onLogout ?? (() => {}), [onLogout]);
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
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
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);

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
        className="sr-only z-[200] rounded-lg bg-sn-accent px-4 py-2 text-sm font-medium text-sn-on-primary shadow-sn-e1 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
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
      <ShellCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        sections={sections}
        isMobile={isMobile}
        collapsed={collapsed}
        nav={nav}
        onToggleSidebar={toggleDesktop}
      />
      <div className="sn-app sn-workbench flex h-[100dvh] overflow-hidden bg-sn-shell">
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
        <div className="sn-app-shell flex min-w-0 flex-1 flex-col overflow-hidden">
          <ShellTopBar
            titleKey={titleKey}
            sectionLabel={sectionLabel}
            pageLabel={pageLabel}
            isMobile={isMobile}
            mobileNavOpen={mobileNavOpen}
            onToggleMobileNav={toggleMobile}
            onOpenCommandPalette={openCommandPalette}
          />
          <div
            className={
              isMobile
                ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-sn-workspace"
                : "cp-work-board flex min-h-0 flex-1 flex-col overflow-hidden"
            }
          >
            {/*
             * 主内容区上下渐隐（ScrollFade）：还能往上 / 往下滚时那一侧淡出，到头不淡。遮罩会裁掉
             * 区内没走 portal 的 fixed 浮层，页面里的浮层（下拉、浮动保存条、全屏加载）都要走 portal；
             * sticky 页签栏、操作栏加 data-scroll-fade-pin，渐隐从它们下沿开始。
             *
             * overscroll-y-none：macOS 触控板滚到顶 / 底再往前推，Chrome 会让这个内层滚动区整块橡皮筋回弹，
             * 吸顶的页签栏、右侧吸顶栏跟着内容一起被拉走约一秒（页签栏滑出视口、顶端露出一截空白）；
             * 内容不满一屏的页面（运行日志）滚动会一路传到窗口，侧边栏连同整页一起弹（11-07 录屏）。
             * 内容区是固定外框里的面板，到头就停，也不再把滚动传给窗口。只对鼠标 / 触控板生效：手机、
             * 平板上的回弹和下拉刷新是系统行为，保持原样。
             */}
            <ScrollFade className="flex-1 overflow-x-hidden overflow-y-auto pointer-fine:overscroll-y-none">
              {/*
               * 默认 min-h-full：内容长了 main 跟着长高，底部内边距排在内容之后。
               * 页面根声明了 data-page-fill 时改 h-full，给「表格吃满剩余高度、内部滚动」的
               * 页面一条确定高度的 flex 链（见 DashboardLayout 的说明）。
               */}
              <main
                id="main-content"
                tabIndex={-1}
                className={[
                  "flex min-h-full flex-col px-4 pt-3 pb-4 focus-visible:outline-none sm:px-6 sm:pt-4 sm:pb-6",
                  "has-[[data-page-fill=always]]:h-full md:has-[[data-page-fill=md]]:h-full",
                  "lg:has-[[data-page-fill=lg]]:h-full",
                ].join(" ")}
              >
                {children}
              </main>
            </ScrollFade>
          </div>
        </div>
      </div>
    </PageBackground>
  );
}
