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
import {
  Activity,
  Bot,
  Coins,
  Cpu,
  LayoutDashboard,
  FileKey,
  FileText,
  Info,
  KeyRound,
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

interface ShellContextState {
  state: {
    title: string;
  };
  actions: {
    logout: () => void;
  };
}

const ShellContext = createContext<ShellContextState | null>(null);
const STORAGE_KEY_SIDEBAR_COLLAPSED = "cli-proxy-sidebar-collapsed";

const NAV_ITEMS = [
  { to: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { to: "/monitor", label: "监控中心", icon: Activity },
  { to: "/monitor/request-logs", label: "请求日志", icon: ScrollText },
  { to: "/ai-providers", label: "AI供应商", icon: Bot },
  { to: "/auth-files", label: "认证文件", icon: FileKey },
  { to: "/oauth", label: "OAuth登录", icon: KeyRound },
  { to: "/api-keys", label: "API Keys", icon: Sparkles },
  { to: "/models", label: "模型管理", icon: Cpu },
  { to: "/quota", label: "配额管理", icon: Coins },
  { to: "/config", label: "配置面板", icon: Settings },
  { to: "/system", label: "系统信息", icon: Info },
  { to: "/logs", label: "日志查询", icon: FileText },
] as const;

const getPageTitle = (pathname: string): string => {
  if (pathname.startsWith("/dashboard")) {
    return "仪表盘";
  }
  if (pathname.startsWith("/monitor/request-logs")) {
    return "请求日志";
  }
  if (pathname.startsWith("/monitor")) {
    return "监控中心";
  }
  if (pathname.startsWith("/ai-providers")) {
    return "AI供应商";
  }
  if (pathname.startsWith("/auth-files")) {
    return "认证文件";
  }
  if (pathname.startsWith("/oauth")) {
    return "OAuth登录";
  }
  if (pathname.startsWith("/quota")) {
    return "配额管理";
  }
  if (pathname.startsWith("/api-keys")) {
    return "API Keys 管理";
  }
  if (pathname.startsWith("/models")) {
    return "模型管理";
  }
  if (pathname.startsWith("/config")) {
    return "配置面板";
  }
  if (pathname.startsWith("/system")) {
    return "系统信息";
  }
  if (pathname.startsWith("/logs")) {
    return "日志查询";
  }
  return "后台首页";
};

function ShellFrame({ children }: PropsWithChildren) {
  return <PageBackground variant="app">{children}</PageBackground>;
}

function ShellSidebar({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const activeTo = useMemo(() => {
    const pathname = location.pathname;
    const sorted = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length);
    return (
      sorted.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.to ?? null
    );
  }, [location.pathname]);

  return (
    <aside
      className={[
        "h-screen shrink-0 overflow-hidden bg-white/80 backdrop-blur-xl dark:bg-neutral-950/70",
        "motion-reduce:transition-none motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out",
        collapsed ? "w-0 border-r-0" : "w-64 border-r border-slate-200 dark:border-neutral-800",
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
          <span>控制台</span>
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
                className={
                  active
                    ? "flex min-w-0 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-950 whitespace-nowrap"
                    : "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white whitespace-nowrap"
                }
              >
                <Icon size={16} className="shrink-0 opacity-90" />
                <span className="min-w-0 truncate">{item.label}</span>
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
  const {
    state: { title },
    actions: { logout },
  } = useShell();

  const SidebarIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarLabel = sidebarCollapsed ? "展开侧边栏" : "收起侧边栏";

  return (
    <header className="z-20 shrink-0 border-b border-slate-200 bg-white/75 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarLabel}
            title={sidebarLabel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200 dark:hover:bg-neutral-950/80"
          >
            <SidebarIcon size={16} />
          </button>
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 dark:text-white">
            <Sparkles size={16} className="text-slate-900 dark:text-white" />
            <span>{title}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggleButton className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200 dark:hover:bg-neutral-950/80" />
          <button
            type="button"
            onClick={() => {
              navigate("/login", { replace: true, viewTransition: true });
              logout();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </div>
    </header>
  );
}

function ShellMain({ children }: PropsWithChildren) {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-full flex-col p-6 focus-visible:outline-none">
      {children}
    </main>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const {
    actions: { logout },
  } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, sidebarCollapsed ? "1" : "0");
    } catch {
      // 忽略持久化失败
    }
  }, [sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const value = useMemo<ShellContextState>(
    () => ({
      state: {
        title: getPageTitle(location.pathname),
      },
      actions: {
        logout,
      },
    }),
    [location.pathname, logout],
  );

  return (
    <ShellContext value={value}>
      <ShellFrame>
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:not-sr-only focus:fixed focus:left-4 focus:top-4 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
        >
          跳到主要内容
        </a>
        <div className="flex h-screen overflow-hidden">
          <ShellSidebar collapsed={sidebarCollapsed} />
          <div className="flex min-w-0 flex-1 flex-col">
            <ShellHeader sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
            <div className="flex-1 overflow-y-auto">
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
    throw new Error("useShell 必须在 AppShell 内使用");
  }
  return context;
};
