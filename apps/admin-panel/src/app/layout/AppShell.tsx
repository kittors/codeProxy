import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageBackground } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { MobileSidebar } from "./shell/MobileSidebar";
import { getPageTitleKey, resolveActiveTo, type NavSection } from "./shell/navModel";
import { ShellTopBar } from "./shell/ShellTopBar";
import { SidebarPanel } from "./shell/SidebarPanel";
import { SidebarRail } from "./shell/SidebarRail";
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
 * 控制台外壳：图标栏（一级分区）| 分区面板（分区下的页面）| 内容区。
 *
 * - 桌面端可以收起分区面板，只留图标栏；收起状态记在 localStorage。收起后内容区左侧两角
 *   变成大圆角，嵌在图标栏的灰底上，多页分区改为悬停弹出浮层。
 * - 手机端（< 768px）没有图标栏，导航收进抽屉，路由变化时自动收起，打开时锁住页面滚动。
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

  // 每个分区记住上次停留的页面：从图标栏切回来时回到那一页，而不是总落在第一页。
  const lastVisitedRef = useRef(new Map<string, string>());
  useEffect(() => {
    const settledTo = resolveActiveTo(location.pathname, items);
    const section = sections.find((entry) => entry.items.some((item) => item.to === settledTo));
    if (section && settledTo) lastVisitedRef.current.set(section.id, settledTo);
  }, [items, location.pathname, sections]);

  // 当前路由不在导航里（修改密码等）时，面板继续显示上一次的分区，而不是突然变空。
  const [panelSectionId, setPanelSectionId] = useState<string | null>(null);
  useEffect(() => {
    if (activeSection) setPanelSectionId(activeSection.id);
  }, [activeSection]);
  const panelSection =
    activeSection ?? sections.find((section) => section.id === panelSectionId) ?? sections[0] ?? null;

  const openSection = useCallback(
    (section: NavSection) => {
      const remembered = lastVisitedRef.current.get(section.id);
      const target =
        section.items.find((item) => item.to === remembered && !item.external) ??
        section.items.find((item) => !item.external);
      if (target) nav.startNavigation(target.to);
    },
    [nav],
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
  const activeItem = panelSection?.items.find((item) => item.to === activeTo) ?? null;
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
          <aside data-collapsed={collapsed ? "true" : "false"} className="flex h-full shrink-0">
            <SidebarRail
              sections={sections}
              activeSectionId={activeSection?.id ?? null}
              activeTo={activeTo}
              collapsed={collapsed}
              nav={nav}
              onToggleSidebar={toggleDesktop}
              onOpenSection={openSection}
              onLogout={logout}
            />
            <SidebarPanel section={panelSection} activeTo={activeTo} collapsed={collapsed} nav={nav} />
          </aside>
        )}
        <div
          className={[
            "flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas",
            "transition-[border-radius] duration-[360ms] ease-soft motion-reduce:transition-none",
            collapsed ? "rounded-l-2xl" : "",
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
            <main
              id="main-content"
              tabIndex={-1}
              className="flex h-full flex-col px-4 pt-1 pb-4 focus-visible:outline-none sm:px-6 sm:pb-6"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </PageBackground>
  );
}
