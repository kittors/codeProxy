import {
  createContext,
  type MouseEvent,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  ChevronDown,
  Cpu,
  Image,
  Layers,
  LayoutDashboard,
  FileText,
  Info,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LanguageSelector, PageBackground, ScrollArea, ThemeToggleButton } from "@code-proxy/ui";
import { preloadPageRoute } from "@pages/registry";

interface ShellContextState {
  state: {
    titleKey: string;
  };
  actions: {
    logout: () => void;
  };
}

const ShellContext = createContext<ShellContextState | null>(null);
const STORAGE_KEY_SIDEBAR_COLLAPSED = "cli-proxy-sidebar-collapsed";
const SIDEBAR_MOBILE_MEDIA = "(max-width: 767px)";
const ROUTE_PROGRESS_MIN_MS = 680;
const ROUTE_PROGRESS_HIDE_MS = 360;

interface SidebarNavItem {
  to: string;
  i18nKey: string;
  icon: LucideIcon;
}

interface SidebarNavGroup {
  id: string;
  i18nKey: string;
  icon: LucideIcon;
  items: readonly SidebarNavItem[];
}

const DASHBOARD_NAV_ITEM = {
  to: "/dashboard",
  i18nKey: "shell.nav_dashboard",
  icon: LayoutDashboard,
} satisfies SidebarNavItem;

const NAV_GROUPS = [
  {
    id: "runtime",
    i18nKey: "shell.nav_group_runtime",
    icon: Activity,
    items: [
      { to: "/monitor", i18nKey: "shell.nav_monitor", icon: Activity },
      { to: "/monitor/request-logs", i18nKey: "shell.nav_request_logs", icon: ScrollText },
      { to: "/logs", i18nKey: "shell.nav_logs", icon: FileText },
      { to: "/system", i18nKey: "shell.nav_system", icon: Info },
    ],
  },
  {
    id: "access",
    i18nKey: "shell.nav_group_access",
    icon: Bot,
    items: [
      { to: "/ai-providers", i18nKey: "shell.nav_ai_providers", icon: Bot },
      { to: "/api-keys", i18nKey: "shell.nav_api_keys", icon: Sparkles },
      {
        to: "/ccswitch-import-settings",
        i18nKey: "shell.nav_ccswitch_import_settings",
        icon: ArrowDownToLine,
      },
    ],
  },
  {
    id: "models",
    i18nKey: "shell.nav_group_models",
    icon: Layers,
    items: [
      { to: "/models", i18nKey: "shell.nav_models", icon: Cpu },
      { to: "/image-generation", i18nKey: "shell.nav_image_generation", icon: Image },
      { to: "/channel-groups", i18nKey: "shell.nav_channel_groups", icon: Layers },
      { to: "/proxies", i18nKey: "shell.nav_proxies", icon: Network },
    ],
  },
  {
    id: "system",
    i18nKey: "shell.nav_group_system",
    icon: Settings,
    items: [
      { to: "/account-security", i18nKey: "shell.nav_account_security", icon: ShieldCheck },
      {
        to: "/api-key-permissions",
        i18nKey: "shell.nav_api_key_permissions",
        icon: ShieldCheck,
      },
      { to: "/config", i18nKey: "shell.nav_config", icon: Settings },
    ],
  },
] satisfies readonly SidebarNavGroup[];

const NAV_ITEMS: readonly SidebarNavItem[] = [
  DASHBOARD_NAV_ITEM,
  ...NAV_GROUPS.flatMap((group) => group.items),
];

const getPageTitleKey = (pathname: string): string => {
  if (pathname.startsWith("/dashboard")) return "shell.nav_dashboard";
  if (pathname.startsWith("/monitor/request-logs")) return "shell.nav_request_logs";
  if (pathname.startsWith("/monitor")) return "shell.nav_monitor";
  if (pathname.startsWith("/ai-providers")) return "shell.nav_ai_providers";
  if (pathname.startsWith("/account-security") || pathname.startsWith("/auth-files"))
    return "shell.nav_account_security";
  if (pathname.startsWith("/api-keys")) return "shell.page_api_keys";
  if (
    pathname.startsWith("/api-key-permissions") ||
    pathname.startsWith("/manage/api-key-permissions")
  )
    return "shell.page_api_key_permissions";
  if (
    pathname.startsWith("/ccswitch-import-settings") ||
    pathname.startsWith("/manage/ccswitch-import-settings")
  )
    return "shell.nav_ccswitch_import_settings";
  if (pathname.startsWith("/image-generation")) return "shell.nav_image_generation";
  if (pathname.startsWith("/channel-groups")) return "shell.page_channel_groups";
  if (
    pathname.startsWith("/identity-fingerprint") ||
    pathname.startsWith("/manage/identity-fingerprint")
  )
    return "shell.nav_account_security";
  if (pathname.startsWith("/models") || pathname.startsWith("/manage/models"))
    return "shell.nav_models";
  if (pathname.startsWith("/proxies") || pathname.startsWith("/manage/proxies"))
    return "shell.nav_proxies";
  if (pathname.startsWith("/config")) return "shell.nav_config";
  if (pathname.startsWith("/system")) return "shell.nav_system";
  if (pathname.startsWith("/logs")) return "shell.nav_logs";
  return "shell.page_home";
};

const shouldUseNativeNavigation = (event: MouseEvent<HTMLAnchorElement>) =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.altKey ||
  event.ctrlKey ||
  event.shiftKey ||
  Boolean(event.currentTarget.target && event.currentTarget.target !== "_self");

function ShellFrame({ children }: PropsWithChildren) {
  return <PageBackground variant="app">{children}</PageBackground>;
}

function SidebarNavLink({
  item,
  active,
  label,
  onClick,
  onWarm,
}: {
  item: SidebarNavItem;
  active: boolean;
  label: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  onWarm: (to: string) => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      viewTransition
      aria-current={active ? "page" : undefined}
      onClick={(event) => onClick(event, item.to)}
      onMouseEnter={() => onWarm(item.to)}
      onFocus={() => onWarm(item.to)}
      className={
        "flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] whitespace-nowrap transition-colors duration-150 " +
        (active
          ? "bg-slate-100 font-semibold text-slate-950 dark:bg-white/10 dark:text-white"
          : "font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white")
      }
    >
      <Icon size={14} className="shrink-0 opacity-80" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function ShellSidebar({
  collapsed,
  mode,
  onNavigate,
}: {
  collapsed: boolean;
  mode: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    actions: { logout },
  } = useShell();
  // Track the clicked nav target so the highlight updates instantly on click,
  // without waiting for lazy chunks to load & location to update.
  const [pendingTo, setPendingTo] = useState("");
  const [progressDone, setProgressDone] = useState(false);
  const progressStartedAt = useRef(0);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const navigationRequestId = useRef(0);

  const clearProgressTimers = useCallback(() => {
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];
  }, []);

  const resolveActiveTo = useCallback((pathname: string) => {
    const sorted = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length);
    return (
      sorted.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
    );
  }, []);

  const activeTo = useMemo(
    () => resolveActiveTo(pendingTo || location.pathname),
    [pendingTo, location.pathname, resolveActiveTo],
  );
  const activeGroupId = useMemo(
    () => NAV_GROUPS.find((group) => group.items.some((item) => item.to === activeTo))?.id,
    [activeTo],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["runtime"]));

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((current) => {
      if (current.has(activeGroupId)) return current;
      return new Set([...current, activeGroupId]);
    });
  }, [activeGroupId]);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const isMobile = mode === "mobile";
  const accountLogoutLabel = t("shell.logout_button");

  const warmPageRoute = useCallback((to: string) => {
    void preloadPageRoute(to).catch(() => undefined);
  }, []);

  const handleNavClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, to: string) => {
      if (shouldUseNativeNavigation(event)) return;

      if (to === location.pathname) {
        onNavigate?.();
        return;
      }

      event.preventDefault();
      onNavigate?.();

      const requestId = navigationRequestId.current + 1;
      navigationRequestId.current = requestId;
      clearProgressTimers();
      progressStartedAt.current = Date.now();
      setProgressDone(false);
      setPendingTo(to);

      const minimumProgress = new Promise<void>((resolve) => {
        const delay = Math.max(0, ROUTE_PROGRESS_MIN_MS - (Date.now() - progressStartedAt.current));
        const timer = setTimeout(resolve, delay);
        progressTimers.current.push(timer);
      });

      void Promise.all([preloadPageRoute(to).catch(() => undefined), minimumProgress]).then(() => {
        if (navigationRequestId.current !== requestId) return;
        setProgressDone(true);

        const navigateTimer = setTimeout(() => {
          if (navigationRequestId.current !== requestId) return;
          navigate(to, { viewTransition: true });
          setPendingTo("");
          setProgressDone(false);
          progressTimers.current = [];
        }, ROUTE_PROGRESS_HIDE_MS);
        progressTimers.current.push(navigateTimer);
      });
    },
    [clearProgressTimers, location.pathname, navigate, onNavigate],
  );

  useEffect(
    () => () => {
      navigationRequestId.current += 1;
      clearProgressTimers();
    },
    [clearProgressTimers],
  );

  return (
    <>
      {pendingTo && <div className={progressDone ? "rp rp-done" : "rp"} />}
      <aside
        className={[
          "shrink-0 overflow-hidden bg-white/94 dark:bg-neutral-950/88",
          isMobile ? "fixed inset-y-0 left-0 z-40 w-56" : "h-[100dvh]",
          "border-r border-slate-200 shadow-[12px_0_28px_rgba(15,23,42,0.04)] dark:border-neutral-800",
          "motion-reduce:transition-none motion-safe:transition-[width,transform,background-color,border-color] motion-safe:duration-300 motion-safe:ease-out",
          isMobile
            ? collapsed
              ? "-translate-x-full"
              : "translate-x-0"
            : collapsed
              ? "w-0 border-r-0"
              : "w-56",
        ].join(" ")}
        aria-hidden={collapsed}
      >
        <div
          className={[
            "flex h-full w-56 flex-col",
            "motion-reduce:transition-none motion-safe:transition-[transform,opacity] motion-safe:duration-300 motion-safe:ease-out",
            collapsed
              ? "pointer-events-none opacity-0 -translate-x-6"
              : "opacity-100 translate-x-0",
          ].join(" ")}
        >
          <div className="flex h-[72px] items-center gap-3 px-5 pt-5 text-slate-900 transition-colors duration-200 ease-out dark:text-white whitespace-nowrap">
            <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.22)]">
              <LayoutDashboard size={18} />
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-semibold tracking-tight">
                {t("shell.console")}
              </span>
              <span className="block text-[10px] font-medium tracking-normal text-slate-400">
                CLI Proxy
              </span>
            </span>
          </div>
          <ScrollArea
            className="flex-1 [&_[data-scroll-area-scrollbar='y']]:right-1 [&_[data-scroll-area-scrollbar='y']]:w-5"
            scrollbarVisibility="track-hover"
            scrollbarTrackInset={16}
          >
            <nav className="space-y-1 px-3 pb-4 pt-4">
              <SidebarNavLink
                item={DASHBOARD_NAV_ITEM}
                active={activeTo === DASHBOARD_NAV_ITEM.to}
                label={t(DASHBOARD_NAV_ITEM.i18nKey)}
                onClick={handleNavClick}
                onWarm={warmPageRoute}
              />
              <div className="space-y-1 pt-1">
                {NAV_GROUPS.map((group) => {
                  const GroupIcon = group.icon;
                  const open = openGroups.has(group.id);
                  const groupActive = group.id === activeGroupId;
                  const contentId = `sidebar-${mode}-${group.id}`;
                  return (
                    <div key={group.id}>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={contentId}
                        onClick={() => toggleGroup(group.id)}
                        className={
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-semibold whitespace-nowrap transition-colors duration-150 " +
                          (groupActive
                            ? "text-slate-950 dark:text-white"
                            : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200")
                        }
                      >
                        <GroupIcon size={14} className="shrink-0 opacity-80" />
                        <span className="min-w-0 flex-1 truncate">{t(group.i18nKey)}</span>
                        <ChevronDown
                          size={13}
                          className={
                            "shrink-0 opacity-60 transition-transform duration-200 " +
                            (open ? "rotate-0" : "-rotate-90")
                          }
                        />
                      </button>
                      {open ? (
                        <div id={contentId} className="mt-0.5 space-y-0.5 pl-3">
                          {group.items.map((item) => (
                            <SidebarNavLink
                              key={item.to}
                              item={item}
                              active={activeTo === item.to}
                              label={t(item.i18nKey)}
                              onClick={handleNavClick}
                              onWarm={warmPageRoute}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </nav>
          </ScrollArea>
          <div className="space-y-3 px-3 pb-4">
            <div className="flex items-center gap-3 rounded-[18px] bg-slate-50/80 p-3 dark:bg-white/[0.04]">
              <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_10px_22px_rgba(37,99,235,0.2)]">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                  Admin
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {t("shell.sidebar_account_role")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate("/login", { replace: true, viewTransition: true });
                  logout();
                }}
                aria-label={accountLogoutLabel}
                title={accountLogoutLabel}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-transparent text-slate-400 transition-colors duration-200 ease-out hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 dark:text-slate-500 dark:hover:text-rose-300 dark:focus-visible:ring-rose-300/20"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function ShellHeader({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const { t } = useTranslation();
  const {
    state: { titleKey },
  } = useShell();

  const SidebarIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarLabel = sidebarCollapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar");

  return (
    <header className="z-20 shrink-0 border-b border-slate-200 bg-white/75 backdrop-blur-xl motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out dark:border-neutral-800 dark:bg-neutral-950/60">
      <h1 className="sr-only">{t(titleKey)}</h1>
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarLabel}
            title={sidebarLabel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-slate-500 shadow-none transition-[color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:text-slate-900 active:translate-y-0 active:scale-95 dark:text-slate-400 dark:hover:text-white"
          >
            <SidebarIcon size={16} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSelector className="inline-flex h-9 items-center justify-center gap-0.5 rounded-xl px-1.5 text-slate-500 transition-colors duration-200 ease-out hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />
          <ThemeToggleButton className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors duration-200 ease-out hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />
        </div>
      </div>
    </header>
  );
}

function ShellMain({ children }: PropsWithChildren) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-full flex-col p-4 focus-visible:outline-none sm:p-6"
    >
      {children}
    </main>
  );
}

export function AppShell({ children, onLogout }: PropsWithChildren<{ onLogout?: () => void }>) {
  const location = useLocation();
  const { t } = useTranslation();
  const logout = onLogout ?? (() => {});

  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mq = window.matchMedia?.(SIDEBAR_MOBILE_MEDIA);
    if (!mq) return;

    const update = () => setIsMobile(mq.matches);
    update();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    const legacy = mq as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };

    legacy.addListener?.(update);
    return () => legacy.removeListener?.(update);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    setMobileSidebarOpen(false);
  }, [isMobile, location.pathname]);

  useEffect(() => {
    if (!isMobile) return;
    if (!mobileSidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobile, mobileSidebarOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, desktopSidebarCollapsed ? "1" : "0");
    } catch {
      // 忽略持久化失败
    }
  }, [desktopSidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setDesktopSidebarCollapsed((prev) => !prev);
  }, [isMobile]);

  const value = useMemo<ShellContextState>(
    () => ({
      state: {
        titleKey: getPageTitleKey(location.pathname),
      },
      actions: {
        logout,
      },
    }),
    [location.pathname, logout],
  );

  const sidebarCollapsed = isMobile ? !mobileSidebarOpen : desktopSidebarCollapsed;

  return (
    <ShellContext value={value}>
      <ShellFrame>
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:not-sr-only focus:fixed focus:left-4 focus:top-4 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
        >
          {t("shell.skip_to_content")}
        </a>
        {isMobile && mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
            aria-label={t("common.close")}
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
        <div className="flex h-[100dvh] overflow-hidden">
          <ShellSidebar
            collapsed={sidebarCollapsed}
            mode={isMobile ? "mobile" : "desktop"}
            onNavigate={isMobile ? () => setMobileSidebarOpen(false) : undefined}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <ShellHeader sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <ShellMain>{children}</ShellMain>
            </div>
          </div>
        </div>
      </ShellFrame>
    </ShellContext>
  );
}

const useShell = (): ShellContextState => {
  const context = use(ShellContext);
  if (!context) {
    throw new Error("useShell must be used within AppShell");
  }
  return context;
};
