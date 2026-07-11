import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
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
  PanelLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  LanguageSelector,
  floatingPanelSurface,
  PageBackground,
  ScrollArea,
  ThemeToggleButton,
} from "@code-proxy/ui";
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
      {
        to: "/monitor/request-logs",
        i18nKey: "shell.nav_request_logs",
        icon: ScrollText,
      },
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
      {
        to: "/image-generation",
        i18nKey: "shell.nav_image_generation",
        icon: Image,
      },
      {
        to: "/channel-groups",
        i18nKey: "shell.nav_channel_groups",
        icon: Layers,
      },
      { to: "/proxies", i18nKey: "shell.nav_proxies", icon: Network },
    ],
  },
  {
    id: "system",
    i18nKey: "shell.nav_group_system",
    icon: Settings,
    items: [
      {
        to: "/account-security",
        i18nKey: "shell.nav_account_security",
        icon: ShieldCheck,
      },
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
  if (pathname.startsWith("/monitor/request-logs"))
    return "shell.nav_request_logs";
  if (pathname.startsWith("/monitor")) return "shell.nav_monitor";
  if (pathname.startsWith("/ai-providers")) return "shell.nav_ai_providers";
  if (
    pathname.startsWith("/account-security") ||
    pathname.startsWith("/auth-files")
  )
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
  if (pathname.startsWith("/image-generation"))
    return "shell.nav_image_generation";
  if (pathname.startsWith("/channel-groups"))
    return "shell.page_channel_groups";
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

function SidebarChildLink({
  item,
  active,
  label,
  onClick,
  onWarm,
  tabIndex,
  role,
  onSelect,
}: {
  item: SidebarNavItem;
  active: boolean;
  label: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  onWarm: (to: string) => void;
  tabIndex?: number;
  role?: "menuitem";
  onSelect?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      viewTransition
      tabIndex={tabIndex}
      role={role}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        onSelect?.();
        onClick(event, item.to);
      }}
      onMouseEnter={() => onWarm(item.to)}
      onFocus={() => onWarm(item.to)}
      className={
        "flex h-9 min-w-0 items-center gap-3 rounded-xl px-3 text-sm whitespace-nowrap transition-colors duration-150 " +
        (active
          ? "bg-slate-100 font-semibold text-slate-950 dark:bg-white/10 dark:text-white"
          : "font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white")
      }
    >
      <Icon size={15} className="shrink-0 opacity-80" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function SidebarPrimaryLink({
  item,
  active,
  collapsed,
  labelVisible,
  label,
  onClick,
  onWarm,
}: {
  item: SidebarNavItem;
  active: boolean;
  collapsed: boolean;
  labelVisible: boolean;
  label: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  onWarm: (to: string) => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      viewTransition
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      data-tooltip={collapsed ? label : undefined}
      data-tooltip-placement="right"
      onClick={(event) => onClick(event, item.to)}
      onMouseEnter={() => onWarm(item.to)}
      onFocus={() => onWarm(item.to)}
      className={
        "mx-2 flex h-10 w-[calc(100%-1rem)] items-center overflow-hidden rounded-xl whitespace-nowrap transition-colors duration-150 " +
        (active
          ? "bg-slate-100 font-semibold text-slate-950 dark:bg-white/10 dark:text-white"
          : "font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white")
      }
    >
      <span className="ml-1 grid h-10 w-10 shrink-0 place-items-center">
        <Icon size={16} className="opacity-80" />
      </span>
      <span
        className={
          "min-w-0 truncate pr-3 text-sm transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
          (labelVisible
            ? "translate-x-0 opacity-100 delay-100"
            : "-translate-x-1 opacity-0 delay-0")
        }
      >
        {label}
      </span>
    </Link>
  );
}

function SidebarToggle({
  label,
  onToggle,
  alwaysVisible,
}: {
  label: string;
  onToggle: () => void;
  alwaysVisible: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      data-tooltip-managed="true"
      data-sidebar-toggle="true"
      className={
        "absolute right-[15px] top-3 z-50 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-transparent text-slate-500 transition-[background-color,color,opacity] duration-120 hover:bg-slate-100 hover:text-slate-950 focus-visible:bg-slate-100 focus-visible:text-slate-950 focus-visible:outline-none dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white " +
        (alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100")
      }
    >
      <PanelLeft size={15} />
    </button>
  );
}

function SidebarGroupFlyout({
  group,
  activeTo,
  label,
  open,
  onClick,
  onWarm,
  onSelect,
}: {
  group: SidebarNavGroup;
  activeTo: string | null;
  label: string;
  open: boolean;
  onClick: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  onWarm: (to: string) => void;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="menu"
      aria-hidden={!open}
      data-sidebar-flyout={group.id}
      data-open={open ? "true" : "false"}
      className={
        floatingPanelSurface +
        " absolute left-[calc(100%+8px)] top-0 z-50 w-52 origin-top-left p-2 transition-[opacity,transform,visibility] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] before:absolute before:-left-3 before:top-0 before:h-full before:w-3 " +
        (open
          ? "visible pointer-events-auto translate-x-0 scale-100 opacity-100"
          : "invisible pointer-events-none -translate-x-1 scale-[0.98] opacity-0")
      }
    >
      <div className="px-3 pb-1.5 pt-1 text-xs font-semibold tracking-wide text-slate-400">
        {label}
      </div>
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarChildLink
            key={item.to}
            item={item}
            active={activeTo === item.to}
            label={t(item.i18nKey)}
            onClick={onClick}
            onWarm={onWarm}
            onSelect={onSelect}
            tabIndex={open ? undefined : -1}
            role="menuitem"
          />
        ))}
      </div>
    </div>
  );
}

function SidebarMenuGroup({
  group,
  activeTo,
  active,
  inlineOpen,
  railCollapsed,
  visualRailCollapsed,
  labelsVisible,
  mode,
  onToggle,
  onClick,
  onWarm,
}: {
  group: SidebarNavGroup;
  activeTo: string | null;
  active: boolean;
  inlineOpen: boolean;
  railCollapsed: boolean;
  visualRailCollapsed: boolean;
  labelsVisible: boolean;
  mode: "desktop" | "mobile";
  onToggle: () => void;
  onClick: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  onWarm: (to: string) => void;
}) {
  const { t } = useTranslation();
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const suppressUntilPointerLeave = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const GroupIcon = group.icon;
  const groupLabel = t(group.i18nKey);
  const contentId = `sidebar-${mode}-${group.id}`;
  const showInlineItems = inlineOpen && labelsVisible && !visualRailCollapsed;

  useEffect(() => {
    if (visualRailCollapsed) return;
    setFlyoutOpen(false);
    suppressUntilPointerLeave.current = false;
  }, [visualRailCollapsed]);

  const closeAndSuppress = useCallback(() => {
    suppressUntilPointerLeave.current = true;
    setFlyoutOpen(false);
  }, []);

  const handlePointerEnter = useCallback(() => {
    if (visualRailCollapsed && !suppressUntilPointerLeave.current)
      setFlyoutOpen(true);
  }, [visualRailCollapsed]);

  const handlePointerLeave = useCallback(() => {
    setFlyoutOpen(false);
    suppressUntilPointerLeave.current = false;
  }, []);

  const handleFocus = useCallback(() => {
    if (visualRailCollapsed && !suppressUntilPointerLeave.current)
      setFlyoutOpen(true);
  }, [visualRailCollapsed]);

  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget))
      return;
    setFlyoutOpen(false);
    suppressUntilPointerLeave.current = false;
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape" || !flyoutOpen) return;
      event.preventDefault();
      suppressUntilPointerLeave.current = true;
      setFlyoutOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      queueMicrotask(() => {
        suppressUntilPointerLeave.current = false;
      });
    },
    [flyoutOpen],
  );

  const handleTriggerClick = useCallback(() => {
    if (!visualRailCollapsed) {
      onToggle();
      return;
    }
    if (flyoutOpen) closeAndSuppress();
    else {
      suppressUntilPointerLeave.current = false;
      setFlyoutOpen(true);
    }
  }, [closeAndSuppress, flyoutOpen, onToggle, visualRailCollapsed]);

  return (
    <div
      className="relative"
      data-tooltip-managed="true"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={railCollapsed ? groupLabel : undefined}
        aria-expanded={visualRailCollapsed ? flyoutOpen : inlineOpen}
        aria-controls={visualRailCollapsed ? undefined : contentId}
        aria-haspopup={visualRailCollapsed ? "menu" : undefined}
        onClick={handleTriggerClick}
        className={
          "mx-2 flex h-10 w-[calc(100%-1rem)] items-center overflow-hidden rounded-xl text-left whitespace-nowrap transition-colors duration-150 " +
          (active
            ? "text-slate-950 dark:text-white"
            : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-200")
        }
      >
        <span className="ml-1 grid h-10 w-10 shrink-0 place-items-center">
          <GroupIcon size={16} className="opacity-80" />
        </span>
        <span
          className={
            "min-w-0 flex-1 truncate text-sm font-semibold transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
            (labelsVisible
              ? "translate-x-0 opacity-100 delay-100"
              : "-translate-x-1 opacity-0 delay-0")
          }
        >
          {groupLabel}
        </span>
        <ChevronDown
          size={14}
          className={
            "mr-3 shrink-0 transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
            (labelsVisible ? "opacity-55 delay-100" : "opacity-0 delay-0") +
            (inlineOpen ? " rotate-0" : " -rotate-90")
          }
        />
      </button>
      <div
        id={contentId}
        aria-hidden={!showInlineItems}
        className={
          "grid transition-[grid-template-rows] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
          (showInlineItems ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={
              "space-y-0.5 pb-1 pl-8 pr-3 pt-0.5 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
              (showInlineItems
                ? "translate-y-0 opacity-100 delay-75"
                : "-translate-y-1 opacity-0 delay-0")
            }
          >
            {group.items.map((item) => (
              <SidebarChildLink
                key={item.to}
                item={item}
                active={activeTo === item.to}
                label={t(item.i18nKey)}
                onClick={onClick}
                onWarm={onWarm}
                tabIndex={showInlineItems ? undefined : -1}
              />
            ))}
          </div>
        </div>
      </div>
      <SidebarGroupFlyout
        group={group}
        activeTo={activeTo}
        label={groupLabel}
        open={visualRailCollapsed && flyoutOpen}
        onClick={onClick}
        onWarm={onWarm}
        onSelect={closeAndSuppress}
      />
    </div>
  );
}

function ShellSidebar({
  collapsed,
  mode,
  onToggleSidebar,
  onNavigate,
}: {
  collapsed: boolean;
  mode: "desktop" | "mobile";
  onToggleSidebar: () => void;
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
      sorted.find(
        (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
      )?.to ?? null
    );
  }, []);

  const activeTo = useMemo(
    () => resolveActiveTo(pendingTo || location.pathname),
    [pendingTo, location.pathname, resolveActiveTo],
  );
  const activeGroupId = useMemo(
    () =>
      NAV_GROUPS.find((group) =>
        group.items.some((item) => item.to === activeTo),
      )?.id,
    [activeTo],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(["runtime"]),
  );

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
  const railCollapsed = !isMobile && collapsed;
  const [visualRailCollapsed, setVisualRailCollapsed] = useState(railCollapsed);
  const [sidebarLabelsVisible, setSidebarLabelsVisible] =
    useState(!railCollapsed);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const sidebarTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const accountLogoutLabel = t("shell.logout_button");
  const sidebarLabel = collapsed
    ? t("shell.expand_sidebar")
    : t("shell.collapse_sidebar");

  useEffect(() => {
    if (sidebarTransitionTimer.current)
      clearTimeout(sidebarTransitionTimer.current);

    if (railCollapsed) {
      setSidebarLabelsVisible(false);
      sidebarTransitionTimer.current = setTimeout(() => {
        setVisualRailCollapsed(true);
        sidebarTransitionTimer.current = null;
      }, 90);
    } else {
      setVisualRailCollapsed(false);
      sidebarTransitionTimer.current = setTimeout(() => {
        setSidebarLabelsVisible(true);
        sidebarTransitionTimer.current = null;
      }, 170);
    }

    return () => {
      if (sidebarTransitionTimer.current)
        clearTimeout(sidebarTransitionTimer.current);
    };
  }, [railCollapsed]);

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
        const delay = Math.max(
          0,
          ROUTE_PROGRESS_MIN_MS - (Date.now() - progressStartedAt.current),
        );
        const timer = setTimeout(resolve, delay);
        progressTimers.current.push(timer);
      });

      void Promise.all([
        preloadPageRoute(to).catch(() => undefined),
        minimumProgress,
      ]).then(() => {
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

  const handleLogout = useCallback(() => {
    navigate("/login", { replace: true, viewTransition: true });
    logout();
  }, [logout, navigate]);

  return (
    <>
      {pendingTo && <div className={progressDone ? "rp rp-done" : "rp"} />}
      <aside
        data-collapsed={railCollapsed ? "true" : "false"}
        className={[
          "group/sidebar relative shrink-0 overflow-visible bg-white/94 dark:bg-neutral-950/88",
          isMobile ? "fixed inset-y-0 left-0 z-40 w-60" : "z-30 h-[100dvh]",
          "border-r border-slate-200 shadow-[12px_0_28px_rgba(15,23,42,0.04)] dark:border-neutral-800",
          "motion-reduce:transition-none motion-safe:transition-[width,transform,background-color,border-color] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
          isMobile
            ? collapsed
              ? "-translate-x-full"
              : "translate-x-0"
            : visualRailCollapsed
              ? "w-16"
              : "w-60",
        ].join(" ")}
        aria-hidden={isMobile && collapsed}
      >
        <SidebarToggle
          label={sidebarLabel}
          onToggle={onToggleSidebar}
          alwaysVisible={isMobile}
        />
        <div className="flex h-full w-full flex-col">
          <div className="flex h-14 shrink-0 items-center overflow-hidden text-slate-900 whitespace-nowrap dark:text-white">
            <span
              className={
                "grid h-14 w-16 shrink-0 place-items-center transition-opacity duration-120 " +
                (visualRailCollapsed
                  ? "opacity-100 group-hover/sidebar:opacity-0"
                  : "opacity-100")
              }
            >
              <span
                data-sidebar-logo="true"
                className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-white"
              >
                <LayoutDashboard size={17} />
              </span>
            </span>
            <span
              className={
                "min-w-0 flex-1 overflow-hidden leading-tight transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
                (sidebarLabelsVisible
                  ? "translate-x-0 opacity-100 delay-100"
                  : "-translate-x-1 opacity-0 delay-0")
              }
            >
              <span className="block truncate text-base font-semibold tracking-tight">
                {t("shell.console")}
              </span>
              <span className="block text-2xs font-medium text-slate-400">
                CLI Proxy
              </span>
            </span>
          </div>
          <ScrollArea
            className="min-h-0 flex-1 [&_[data-scroll-area-scrollbar='y']]:right-1 [&_[data-scroll-area-scrollbar='y']]:w-5"
            viewportClassName={
              visualRailCollapsed ? "overflow-visible" : undefined
            }
            scrollbarVisibility="track-hover"
            scrollbarTrackInset={16}
          >
            <nav className="space-y-1 pb-4 pt-3">
              <SidebarPrimaryLink
                item={DASHBOARD_NAV_ITEM}
                active={activeTo === DASHBOARD_NAV_ITEM.to}
                collapsed={visualRailCollapsed}
                labelVisible={sidebarLabelsVisible}
                label={t(DASHBOARD_NAV_ITEM.i18nKey)}
                onClick={handleNavClick}
                onWarm={warmPageRoute}
              />
              <div className="space-y-1 pt-1">
                {NAV_GROUPS.map((group) => (
                  <SidebarMenuGroup
                      key={group.id}
                          group={group}
                          activeTo={activeTo}
                    active={group.id === activeGroupId}
                    inlineOpen={openGroups.has(group.id)}
                    railCollapsed={railCollapsed}
                    visualRailCollapsed={visualRailCollapsed}
                    labelsVisible={sidebarLabelsVisible}
                    mode={mode}
                    onToggle={() => toggleGroup(group.id)}
                          onClick={handleNavClick}
                          onWarm={warmPageRoute}
                        />
                ))}
              </div>
            </nav>
          </ScrollArea>
          <div className="shrink-0 overflow-visible px-0 pb-2 pt-1">
            <div
              className="group/account relative h-[60px] overflow-visible"
              data-tooltip-managed="true"
            >
              <DropdownMenu.Root
                open={!visualRailCollapsed && accountMenuOpen}
                onOpenChange={(open) =>
                  setAccountMenuOpen(visualRailCollapsed ? false : open)
                }
              >
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Admin"
                    className={
                      "mx-2 flex h-14 w-[calc(100%-1rem)] items-center overflow-hidden rounded-2xl text-left transition-[background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none " +
                      (visualRailCollapsed
                        ? "hover:bg-slate-100/80 dark:hover:bg-white/[0.06]"
                        : "hover:bg-slate-100/85 hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)] data-[state=open]:bg-slate-100/85 data-[state=open]:shadow-[0_8px_24px_rgba(15,23,42,0.10)] dark:hover:bg-white/[0.08] dark:hover:shadow-black/30 dark:data-[state=open]:bg-white/[0.08] dark:data-[state=open]:shadow-black/30")
                    }
                  >
                    <span className="grid h-14 w-12 shrink-0 place-items-center">
                      <span
                        data-sidebar-account-avatar="true"
                        className="relative grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white"
                      >
                        AD
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-neutral-950" />
                      </span>
                    </span>
                    <span
                      className={
                        "min-w-0 flex-1 overflow-hidden pl-2 pr-3 leading-tight transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] " +
                        (sidebarLabelsVisible
                          ? "translate-x-0 opacity-100 delay-100"
                          : "-translate-x-1 opacity-0 delay-0")
                      }
                    >
                      <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">
                        Admin
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-slate-400">
                        {t("shell.sidebar_account_role")}
                      </span>
                    </span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    data-sidebar-account-menu="true"
                    side="top"
                    align="start"
                    sideOffset={8}
                    collisionPadding={8}
                    className="w-[var(--radix-dropdown-menu-trigger-width)] p-2"
                  >
                    <div className="flex items-center gap-3 px-2 py-2">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                        AD
                      </div>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                          Admin
                        </div>
                        <div className="mt-0.5 truncate text-2xs text-slate-400">
                          {t("shell.sidebar_account_role")}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      onSelect={() =>
                        navigate("/account-security", { viewTransition: true })
                      }
                      className="py-2.5"
                    >
                      <ShieldCheck size={16} />
                      {t("shell.nav_account_security")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => navigate("/config", { viewTransition: true })}
                      className="py-2.5"
                    >
                      <Settings size={16} />
                      {t("shell.nav_config")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      onSelect={handleLogout}
                      className="py-2.5 text-rose-600 focus:text-rose-700 dark:text-rose-300"
                    >
                      <LogOut size={16} />
                      {accountLogoutLabel}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {visualRailCollapsed ? (
                <div
                  className={
                    floatingPanelSurface +
                    " invisible absolute bottom-1 left-[calc(100%+8px)] z-50 w-52 translate-x-1 p-2 opacity-0 transition-[opacity,transform,visibility] duration-180 ease-out before:absolute before:-left-3 before:top-0 before:h-full before:w-3 group-hover/account:visible group-hover/account:translate-x-0 group-hover/account:opacity-100 group-focus-within/account:visible group-focus-within/account:translate-x-0 group-focus-within/account:opacity-100"
                  }
                >
                  <div className="flex items-center gap-3 px-2 py-2">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                      AD
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                        Admin
                      </div>
                      <div className="mt-0.5 truncate text-2xs text-slate-400">
                        {t("shell.sidebar_account_role")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      aria-label={accountLogoutLabel}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus-visible:bg-rose-50 focus-visible:text-rose-600 focus-visible:outline-none dark:text-slate-500 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                    >
                      <LogOut size={15} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function ShellHeader({
  isMobile,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  isMobile: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const { t } = useTranslation();
  const {
    state: { titleKey },
  } = useShell();
  const sidebarLabel = sidebarCollapsed
    ? t("shell.expand_sidebar")
    : t("shell.collapse_sidebar");

  return (
    <header className="z-20 shrink-0 border-b border-slate-200 bg-white/75 backdrop-blur-xl motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out dark:border-neutral-800 dark:bg-neutral-950/60">
      <h1 className="sr-only">{t(titleKey)}</h1>
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex h-9 w-9 items-center">
          {isMobile ? (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={sidebarLabel}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <PanelLeft size={18} />
            </button>
          ) : null}
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

export function AppShell({
  children,
  onLogout,
}: PropsWithChildren<{ onLogout?: () => void }>) {
  const location = useLocation();
  const { t } = useTranslation();
  const logout = onLogout ?? (() => {});

  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] =
    useState<boolean>(() => {
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
      localStorage.setItem(
        STORAGE_KEY_SIDEBAR_COLLAPSED,
        desktopSidebarCollapsed ? "1" : "0",
      );
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

  const sidebarCollapsed = isMobile
    ? !mobileSidebarOpen
    : desktopSidebarCollapsed;

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
            onToggleSidebar={toggleSidebar}
            onNavigate={
              isMobile ? () => setMobileSidebarOpen(false) : undefined
            }
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <ShellHeader
              isMobile={isMobile}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={toggleSidebar}
            />
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
