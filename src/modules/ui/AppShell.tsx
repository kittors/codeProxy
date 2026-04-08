import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Bot,
  Cpu,
  LayoutDashboard,
  FileKey,
  FileText,
  Info,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PageBackground } from "@/modules/ui/PageBackground";
import { ThemeToggleButton } from "@/modules/ui/ThemeProvider";
import { LanguageSelector } from "@/modules/ui/LanguageSelector";

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

const NAV_ITEMS = [
  { to: "/dashboard", i18nKey: "shell.nav_dashboard", icon: LayoutDashboard },
  { to: "/monitor", i18nKey: "shell.nav_monitor", icon: Activity },
  { to: "/monitor/request-logs", i18nKey: "shell.nav_request_logs", icon: ScrollText },
  { to: "/ai-providers", i18nKey: "shell.nav_ai_providers", icon: Bot },
  { to: "/auth-files", i18nKey: "shell.nav_auth_files", icon: FileKey },
  { to: "/api-keys", i18nKey: "shell.nav_api_keys", icon: Sparkles },
  { to: "/models", i18nKey: "shell.nav_models", icon: Cpu },
  { to: "/config", i18nKey: "shell.nav_config", icon: Settings },
  { to: "/system", i18nKey: "shell.nav_system", icon: Info },
  { to: "/logs", i18nKey: "shell.nav_logs", icon: FileText },
] as const;

const getPageTitleKey = (pathname: string): string => {
  if (pathname.startsWith("/dashboard")) return "shell.nav_dashboard";
  if (pathname.startsWith("/monitor/request-logs")) return "shell.nav_request_logs";
  if (pathname.startsWith("/monitor")) return "shell.nav_monitor";
  if (pathname.startsWith("/ai-providers")) return "shell.nav_ai_providers";
  if (pathname.startsWith("/auth-files")) return "shell.nav_auth_files";
  if (pathname.startsWith("/api-keys")) return "shell.page_api_keys";
  if (pathname.startsWith("/models")) return "shell.nav_models";
  if (pathname.startsWith("/config")) return "shell.nav_config";
  if (pathname.startsWith("/system")) return "shell.nav_system";
  if (pathname.startsWith("/logs")) return "shell.nav_logs";
  return "shell.page_home";
};

function ShellFrame({ children }: PropsWithChildren) {
  return <PageBackground variant="app">{children}</PageBackground>;
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
  // Track the clicked nav target so the highlight updates instantly on click,
  // without waiting for lazy chunks to load & location to update.
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  // Clear pendingTo once location catches up (chunk loaded, route rendered).
  useEffect(() => {
    setPendingTo(null);
  }, [location.pathname]);

  const resolveActiveTo = useCallback((pathname: string) => {
    const sorted = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length);
    return (
      sorted.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
    );
  }, []);

  const activeTo = useMemo(() => {
    // If user just clicked a nav item, use that immediately for highlighting
    if (pendingTo) return resolveActiveTo(pendingTo);
    return resolveActiveTo(location.pathname);
  }, [pendingTo, location.pathname, resolveActiveTo]);

  const isMobile = mode === "mobile";

  const handleNavClick = useCallback(
    (to: string) => {
      // Immediately mark as pending so highlight is instant
      if (to !== location.pathname) {
        setPendingTo(to);
      }
      onNavigate?.();
    },
    [location.pathname, onNavigate],
  );

  return (
    <aside
      className={[
        "shrink-0 overflow-hidden bg-white/80 backdrop-blur-xl dark:bg-neutral-950/70",
        isMobile ? "fixed inset-y-0 left-0 z-40 w-64" : "h-[100dvh]",
        "border-r border-slate-200 dark:border-neutral-800",
        "motion-reduce:transition-none motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
        isMobile
          ? collapsed
            ? "-translate-x-full"
            : "translate-x-0"
          : collapsed
            ? "w-0 border-r-0"
            : "w-64",
      ].join(" ")}
      aria-hidden={collapsed}
    >
      <div
        className={[
          "flex h-full w-64 flex-col",
          "motion-reduce:transition-none motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
          collapsed ? "pointer-events-none opacity-0 -translate-x-6" : "opacity-100 translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-2 px-6 text-lg font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
          <LayoutDashboard size={18} className="text-slate-900 dark:text-white" />
          <span>{t("shell.console")}</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTo === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                viewTransition
                onClick={() => handleNavClick(item.to)}
                className={
                  active
                    ? "flex min-w-0 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-950 whitespace-nowrap"
                    : "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white whitespace-nowrap"
                }
              >
                <Icon size={16} className="shrink-0 opacity-90" />
                <span className="min-w-0 truncate">{t(item.i18nKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function ShellHeader({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    state: { titleKey },
    actions: { logout },
  } = useShell();

  const SidebarIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarLabel = sidebarCollapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar");

  return (
    <header className="z-20 shrink-0 border-b border-slate-200 bg-white/75 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/60">
      <h1 className="sr-only">{t(titleKey)}</h1>
      <div className="flex h-16 items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarLabel}
            title={sidebarLabel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200 dark:hover:bg-neutral-950/80"
          >
            <SidebarIcon size={16} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSelector className="inline-flex h-9 items-center justify-center gap-0.5 rounded-xl px-1.5 text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />
          <ThemeToggleButton className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />
          <button
            type="button"
            onClick={() => {
              navigate("/login", { replace: true, viewTransition: true });
              logout();
            }}
            aria-label={t("shell.logout_button")}
            title={t("shell.logout_button")}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-2.5 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 sm:min-w-[72px] sm:px-3"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">{t("shell.logout_button")}</span>
          </button>
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

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const { t } = useTranslation();
  const {
    actions: { logout },
  } = useAuth();

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

        {isMobile ? (
          <>
            {mobileSidebarOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
                aria-label={t("common.close")}
                onClick={() => setMobileSidebarOpen(false)}
              />
            ) : null}
            <ShellSidebar
              collapsed={!mobileSidebarOpen}
              mode="mobile"
              onNavigate={() => setMobileSidebarOpen(false)}
            />
            <div className="flex h-[100dvh] overflow-hidden">
              <div className="flex min-w-0 flex-1 flex-col">
                <ShellHeader sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                  <ShellMain>{children}</ShellMain>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-[100dvh] overflow-hidden">
            <ShellSidebar collapsed={sidebarCollapsed} mode="desktop" />
            <div className="flex min-w-0 flex-1 flex-col">
              <ShellHeader sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <ShellMain>{children}</ShellMain>
              </div>
            </div>
          </div>
        )}
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
