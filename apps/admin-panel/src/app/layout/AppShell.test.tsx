import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@code-proxy/ui";
import { IDENTITY_TENANTS_UPDATED_EVENT, type MenuIdentity, type TenantIdentity } from "@code-proxy/api-client";
import { preloadPageRoute } from "@pages/registry";
import { recoverFromChunkLoadError } from "@pages/chunkLoadRecovery";
import { AppShell } from "./AppShell";

vi.mock("@pages/registry", () => ({
  preloadPageRoute: vi.fn(() => Promise.resolve()),
}));

vi.mock("@pages/chunkLoadRecovery", () => ({
  recoverFromChunkLoadError: vi.fn(() => false),
}));

const tenantsMock = vi.fn<() => Promise<{ items: TenantIdentity[] }>>();

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    identityApi: {
      ...actual.identityApi,
      tenants: (...args: unknown[]) => tenantsMock(...(args as [])),
    },
  };
});

type AuthPrincipal = {
  kind?: string;
  platform_admin?: boolean;
  menus: MenuIdentity[];
  user: { display_name: string; username: string; role_codes: string[] };
  effective_tenant: TenantIdentity;
};

let authPrincipal: AuthPrincipal;

const menu = (partial: Partial<MenuIdentity> & Pick<MenuIdentity, "code" | "type">): MenuIdentity => ({
  parent_code: "",
  path: "",
  component: "",
  link_url: "",
  label_key: partial.label_key ?? partial.code,
  title: "",
  icon: "",
  permission_code: "",
  sort_order: 10,
  visible: true,
  enabled: true,
  badge_type: "",
  badge_content: "",
  hide_menu: false,
  system_protected: true,
  version: 1,
  ...partial,
});

const testMenus: MenuIdentity[] = [
  menu({
    code: "dashboard",
    type: "menu",
    path: "/dashboard",
    component: "dashboard",
    label_key: "shell.nav_dashboard",
    icon: "layout-dashboard",
    permission_code: "dashboard.read",
    sort_order: 10,
  }),
  menu({
    code: "group.runtime",
    type: "directory",
    path: "/runtime",
    component: "Layout",
    label_key: "shell.nav_group_runtime",
    icon: "activity",
    sort_order: 20,
  }),
  menu({
    code: "runtime.monitor",
    parent_code: "group.runtime",
    type: "menu",
    path: "/runtime/monitor",
    component: "monitor",
    label_key: "shell.nav_monitor",
    icon: "activity",
    permission_code: "monitor.read",
    sort_order: 10,
  }),
  menu({
    code: "runtime.request-logs",
    parent_code: "group.runtime",
    type: "menu",
    path: "/runtime/request-logs",
    component: "request-logs",
    label_key: "shell.nav_request_logs",
    icon: "scroll-text",
    permission_code: "request_logs.read",
    sort_order: 20,
  }),
  menu({
    code: "group.access",
    type: "directory",
    path: "/access",
    component: "Layout",
    label_key: "shell.nav_group_access",
    icon: "bot",
    sort_order: 30,
  }),
  menu({
    code: "access.providers",
    parent_code: "group.access",
    type: "menu",
    path: "/access/ai-providers",
    component: "providers",
    label_key: "shell.nav_ai_providers",
    icon: "bot",
    permission_code: "providers.read",
    sort_order: 10,
  }),
  menu({
    code: "runtime.content-moderation",
    parent_code: "group.access",
    type: "menu",
    path: "/access/content-moderation",
    component: "content-moderation",
    label_key: "shell.nav_content_moderation",
    icon: "shield-alert",
    permission_code: "content_moderation.read",
    sort_order: 45,
  }),
  menu({
    code: "group.models",
    type: "directory",
    path: "/models",
    component: "Layout",
    label_key: "shell.nav_group_models",
    icon: "layers",
    sort_order: 40,
  }),
  menu({
    code: "models.catalog",
    parent_code: "group.models",
    type: "menu",
    path: "/models/catalog",
    component: "models",
    label_key: "shell.nav_models",
    icon: "cpu",
    permission_code: "models.read",
    sort_order: 10,
  }),
  menu({
    code: "group.system",
    type: "directory",
    path: "/system",
    component: "Layout",
    label_key: "shell.nav_group_system",
    icon: "settings",
    sort_order: 60,
  }),
  menu({
    code: "system.config",
    parent_code: "group.system",
    type: "menu",
    path: "/system/config",
    component: "config",
    label_key: "shell.nav_config",
    icon: "settings",
    permission_code: "system.config.read",
    sort_order: 30,
  }),
  // Top-level leaf after all groups (not nested under 运行观测).
  menu({
    code: "runtime.system",
    type: "menu",
    path: "/runtime/system",
    component: "system",
    label_key: "shell.nav_system",
    icon: "info",
    permission_code: "system.status.read",
    sort_order: 70,
  }),
];

const systemTenant: TenantIdentity = {
  id: "t-system",
  type: "system",
  name: "System Administration",
  slug: "system",
  effective_status: "active",
} as TenantIdentity;

const acmeTenant: TenantIdentity = {
  id: "t-acme",
  type: "standard",
  name: "Acme Team",
  slug: "acme",
  effective_status: "active",
} as TenantIdentity;

let grantedPermissions: ((permission: string) => boolean) | null = null;

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: (permission: string) => (grantedPermissions ? grantedPermissions(permission) : true),
    state: {
      principal: authPrincipal,
    },
    actions: {
      switchTenant: vi.fn(),
    },
  }),
}));

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell(initialPath = "/dashboard", onLogout?: () => void) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell onLogout={onLogout}>
          <div>Dashboard route</div>
          <LocationEcho />
        </AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

/** 分区面板（图标栏右侧那一列）的导航，按分区名定位。 */
const panelNav = (name: RegExp) => screen.getByRole("navigation", { name });
const railButton = (name: RegExp) => screen.getByRole("button", { name });

function defaultPrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    menus: testMenus,
    user: { display_name: "Admin", username: "admin", role_codes: [] },
    effective_tenant: systemTenant,
    ...overrides,
  };
}

const OBSERVABILITY = /Operations|Observability|运行监控|运行观测/i;
const ACCESS = /Access(?: & Credentials)?|接入(?:管理|与凭证)/i;
const MODELS = /Models & Routing|模型与(?:路由|调度)/i;

describe("AppShell route progress", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal();
    grantedPermissions = null;
    tenantsMock.mockReset();
    tenantsMock.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(preloadPageRoute).mockClear();
    vi.mocked(recoverFromChunkLoadError).mockReset();
    vi.mocked(recoverFromChunkLoadError).mockReturnValue(false);
  });

  test("preloads the target route before navigating from the current page", async () => {
    vi.useFakeTimers();
    let resolvePreload: (() => void) | undefined;
    vi.mocked(preloadPageRoute).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePreload = resolve;
      }),
    );
    renderShell("/runtime/request-logs");

    const link = document.querySelector<HTMLAnchorElement>('a[href="/runtime/monitor"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    fireEvent.click(link as HTMLAnchorElement);

    expect(preloadPageRoute).toHaveBeenCalledWith("/runtime/monitor");
    expect(screen.getByTestId("location")).toHaveTextContent("/runtime/request-logs");

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");
    // 点击后立刻按目标高亮，不等路由切换。
    expect(link).toHaveAttribute("aria-current", "page");

    act(() => {
      vi.advanceTimersByTime(680);
    });
    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");

    await act(async () => {
      resolvePreload?.();
      await Promise.resolve();
    });
    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/runtime/request-logs");

    act(() => {
      vi.advanceTimersByTime(360);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/runtime/monitor");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("navigates to a section's first page from the icon rail, with the progress bar", async () => {
    vi.useFakeTimers();
    renderShell();

    fireEvent.click(railButton(ACCESS));
    expect(preloadPageRoute).toHaveBeenCalledWith("/access/ai-providers");
    expect(document.querySelector(".rp")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(680);
      await Promise.resolve();
    });
    expect(document.querySelector(".rp")).toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(360);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/access/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("restarts the progress animation on rapid navigation", async () => {
    vi.useFakeTimers();
    renderShell("/runtime/request-logs");

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/runtime/monitor"]')!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(railButton(MODELS));

    await act(async () => {
      vi.advanceTimersByTime(679);
      await Promise.resolve();
    });
    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(document.querySelector(".rp")).toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(360);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/models/catalog");
  });

  test("lets modified clicks keep the browser's native link behavior", () => {
    vi.useFakeTimers();
    renderShell("/runtime/request-logs");

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/runtime/monitor"]')!, {
      ctrlKey: true,
    });

    expect(preloadPageRoute).not.toHaveBeenCalled();
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/runtime/request-logs");
  });

  test("recovers from chunk load failures instead of navigating into a blank route", async () => {
    vi.useFakeTimers();
    const chunkError = new TypeError("Failed to fetch dynamically imported module");
    vi.mocked(preloadPageRoute).mockRejectedValueOnce(chunkError);
    vi.mocked(recoverFromChunkLoadError).mockReturnValueOnce(true);

    renderShell("/runtime/request-logs");
    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/runtime/monitor"]')!);

    await act(async () => {
      vi.advanceTimersByTime(680);
      await Promise.resolve();
    });

    expect(recoverFromChunkLoadError).toHaveBeenCalledWith(chunkError);
    expect(screen.getByTestId("location")).toHaveTextContent("/runtime/request-logs");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("returns to the page last visited in a section when switching back from the rail", async () => {
    vi.useFakeTimers();
    renderShell("/runtime/request-logs");

    fireEvent.click(railButton(ACCESS));
    await act(async () => {
      vi.advanceTimersByTime(1040);
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(360);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/access/ai-providers");

    fireEvent.click(railButton(OBSERVABILITY));
    expect(preloadPageRoute).toHaveBeenLastCalledWith("/runtime/request-logs");
  });
});

describe("AppShell navigation layout", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal();
    grantedPermissions = null;
    tenantsMock.mockReset();
    tenantsMock.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows the active section's pages in the panel with a neutral active state", () => {
    renderShell("/runtime/request-logs");

    const runtimeRail = railButton(OBSERVABILITY);
    expect(runtimeRail).toHaveAttribute("data-active", "true");
    expect(railButton(ACCESS)).not.toHaveAttribute("data-active");

    const panel = panelNav(OBSERVABILITY);
    const requestLogs = within(panel).getByRole("link", { name: /Request Logs|请求日志/i });
    expect(requestLogs).toHaveAttribute("aria-current", "page");
    expect(requestLogs).toHaveClass("bg-selected", "text-sm", "h-9");
    expect(requestLogs.className).not.toContain("from-blue-600");
    expect(within(panel).getByRole("link", { name: /Monitor|监控中心/i })).not.toHaveAttribute(
      "aria-current",
    );
    // 其它分区的页面不在面板里。
    expect(within(panel).queryByRole("link", { name: /AI Providers|AI 供应商/i })).toBeNull();
  });

  test("places content moderation under access and uses the shield-alert icon", () => {
    renderShell("/access/content-moderation");

    expect(railButton(ACCESS)).toHaveAttribute("data-active", "true");
    const moderation = within(panelNav(ACCESS)).getByRole("link", {
      name: /Content Moderation|内容审核|Модерация контента/i,
    });
    expect(moderation).toHaveAttribute("href", "/access/content-moderation");
    expect(moderation).toHaveAttribute("aria-current", "page");
    expect(moderation.querySelector("svg")).toHaveClass("lucide-shield-alert");
    expect(
      screen.getByRole("heading", { name: /Content Moderation|内容审核|Модерация контента/i }),
    ).toBeInTheDocument();
  });

  test("keeps the legacy moderation path title as a stale-shell safety fallback", () => {
    authPrincipal = defaultPrincipal({ menus: [] });
    renderShell("/runtime/content-moderation");

    expect(
      screen.getByRole("heading", { name: /Content Moderation|内容审核|Модерация контента/i }),
    ).toBeInTheDocument();
  });

  test("renders system info as a top-level rail link after all sections", () => {
    renderShell("/dashboard");

    const rail = screen.getByRole("navigation", { name: /Sections|分区/i });
    const railEntries = Array.from(
      rail.querySelectorAll<HTMLElement>("a[aria-label], [data-sidebar-section]"),
    );
    const last = railEntries.at(-1);
    expect(last).toHaveAttribute("href", "/runtime/system");
    expect(last).toHaveAttribute("aria-label", expect.stringMatching(/System Info|系统信息/i));
    expect(railEntries[0]).toHaveAttribute("href", "/dashboard");
    expect(railEntries[0]).toHaveAttribute("aria-current", "page");
  });

  test("hides entries without permission and disabled menus", () => {
    grantedPermissions = (permission) => permission !== "monitor.read";
    authPrincipal = defaultPrincipal({
      menus: testMenus.map((entry) =>
        entry.code === "group.models" ? { ...entry, enabled: false } : entry,
      ),
    });
    renderShell("/runtime/request-logs");

    const panel = panelNav(OBSERVABILITY);
    expect(within(panel).queryByRole("link", { name: /Monitor|监控中心/i })).toBeNull();
    expect(within(panel).getByRole("link", { name: /Request Logs|请求日志/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MODELS })).toBeNull();
  });

  test("shows the section and page in the top bar", () => {
    renderShell("/runtime/request-logs");
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent(/Observability|运行观测/);
    expect(header).toHaveTextContent(/Request Logs|请求日志/);
  });
});

describe("AppShell collapsed rail", () => {
  beforeEach(() => {
    localStorage.removeItem("cli-proxy-sidebar-collapsed");
    authPrincipal = defaultPrincipal();
    grantedPermissions = null;
    tenantsMock.mockReset();
    tenantsMock.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    localStorage.removeItem("cli-proxy-sidebar-collapsed");
  });

  test("collapses to the icon rail with the same toggle and remembers the choice", () => {
    renderShell("/system/config");

    const toggle = screen.getByRole("button", { name: /Collapse Sidebar|收起侧边栏/i });
    const iconClass = toggle.querySelector("svg")?.getAttribute("class");
    expect(toggle).toHaveAttribute("data-sidebar-toggle", "true");
    expect(toggle.querySelector("[data-sidebar-logo='true']")).toBeInTheDocument();

    fireEvent.click(toggle);

    const aside = document.querySelector("aside");
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(document.querySelector("[data-sidebar-panel='true']")).toHaveAttribute("inert");
    expect(localStorage.getItem("cli-proxy-sidebar-collapsed")).toBe("1");

    const expand = screen.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i });
    expect(expand).toBe(toggle);
    expect(expand.querySelector("svg")?.getAttribute("class")).toBe(iconClass);
    expect(screen.getByRole("link", { name: /Dashboard|仪表盘/i })).toBeInTheDocument();
    expect(railButton(MODELS)).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });

  test("toggles with ⌘B / Ctrl+B, except while typing in a field", () => {
    renderShell("/dashboard");
    const aside = document.querySelector("aside");

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(aside).toHaveAttribute("data-collapsed", "true");
    fireEvent.keyDown(window, { key: "B", ctrlKey: true });
    expect(aside).toHaveAttribute("data-collapsed", "false");

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "b", metaKey: true });
    expect(aside).toHaveAttribute("data-collapsed", "false");
    input.remove();
  });

  test("opens a section flyout on hover, closes it with Escape and after a pick", async () => {
    vi.useFakeTimers();
    localStorage.setItem("cli-proxy-sidebar-collapsed", "1");
    renderShell("/system/config");

    const models = railButton(MODELS);
    fireEvent.pointerEnter(models.parentElement!);
    const flyout = screen.getByRole("menu", { name: MODELS });
    expect(flyout).toHaveAttribute("data-sidebar-flyout", "group.models");
    expect(models).toHaveAttribute("aria-expanded", "true");
    expect(within(flyout).getByRole("menuitem", { name: /Model Catalog|模型目录/i })).toHaveAttribute(
      "href",
      "/models/catalog",
    );

    fireEvent.keyDown(models, { key: "Escape" });
    expect(models).toHaveAttribute("aria-expanded", "false");
    expect(models).toHaveFocus();

    fireEvent.pointerLeave(models.parentElement!);
    fireEvent.pointerEnter(models.parentElement!);
    fireEvent.click(screen.getByRole("menuitem", { name: /Model Catalog|模型目录/i }));
    expect(models).toHaveAttribute("aria-expanded", "false");
    expect(preloadPageRoute).toHaveBeenCalledWith("/models/catalog");
    vi.useRealTimers();
  });
});

describe("AppShell account menu", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal();
    grantedPermissions = null;
    tenantsMock.mockReset();
    tenantsMock.mockResolvedValue({ items: [] });
  });

  test("offers password, config and theme entries, and logs out through the login page", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderShell("/dashboard", onLogout);

    await user.click(screen.getByRole("button", { name: "Admin" }));
    const menu = document.querySelector("[data-sidebar-account-menu='true']");
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Change password|修改密码/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Config|配置面板$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Switch to dark mode|切换到暗色模式|Switch to light mode|切换到亮色模式/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Logout|退出登录/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  test("hides the config entry without system.config.read", async () => {
    const user = userEvent.setup();
    grantedPermissions = (permission) => permission !== "system.config.read";
    renderShell("/dashboard");

    await user.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.queryByRole("menuitem", { name: /^Config|配置面板$/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Logout|退出登录/i })).toBeInTheDocument();
  });
});

describe("AppShell mobile sidebar", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal();
    grantedPermissions = null;
    tenantsMock.mockReset();
    tenantsMock.mockResolvedValue({ items: [] });
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query === "(max-width: 767px)",
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("keeps the mobile drawer mounted in a body portal while opening and closing", () => {
    renderShell();

    const aside = document.querySelector("aside");
    const backdrop = screen.getByTestId("app-shell-mobile-sidebar-backdrop");
    expect(aside?.parentElement).toBe(document.body);
    expect(backdrop.parentElement).toBe(document.body);
    expect(aside).toHaveAttribute("data-mobile-open", "false");
    expect(aside).toHaveClass("-translate-x-full", "will-change-transform", "motion-safe:duration-[320ms]");

    fireEvent.click(screen.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i }));

    expect(aside).toHaveAttribute("data-mobile-open", "true");
    expect(aside).toHaveClass("translate-x-0");
    expect(backdrop).toHaveClass("opacity-100", "motion-safe:duration-[320ms]");
    // 抽屉里一次列出所有分区的页面。
    expect(within(aside as HTMLElement).getByRole("link", { name: /Request Logs|请求日志/i })).toBeInTheDocument();
    expect(within(aside as HTMLElement).getByRole("link", { name: /AI Providers|AI 供应商/i })).toBeInTheDocument();

    fireEvent.click(backdrop);

    expect(aside).toHaveAttribute("data-mobile-open", "false");
    expect(aside).toHaveClass("-translate-x-full");
    expect(backdrop).toHaveClass("pointer-events-none", "opacity-0");
    expect(document.body.contains(aside)).toBe(true);
  });

  test("closes the drawer as soon as a page is picked", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i }));
    const aside = document.querySelector("aside") as HTMLElement;
    fireEvent.click(within(aside).getByRole("link", { name: /Request Logs|请求日志/i }));
    expect(aside).toHaveAttribute("data-mobile-open", "false");
  });
});

describe("AppShell tenant switcher", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal({ platform_admin: true });
    grantedPermissions = null;
    tenantsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("hides the tenant switcher when only one tenant is available", async () => {
    tenantsMock.mockResolvedValue({ items: [systemTenant] });
    renderShell();

    await waitFor(() => {
      expect(tenantsMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole("combobox", { name: /Switch Tenant|切换租户/i })).not.toBeInTheDocument();
  });

  test("shows the tenant switcher when multiple tenants are available", async () => {
    tenantsMock.mockResolvedValue({ items: [systemTenant, acmeTenant] });
    renderShell();

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: /Switch Tenant|切换租户/i }),
      ).toBeInTheDocument();
    });
  });

  test("refreshes the tenant switcher after tenants are created", async () => {
    tenantsMock.mockResolvedValueOnce({ items: [systemTenant] });
    renderShell();

    await waitFor(() => {
      expect(tenantsMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("combobox", { name: /Switch Tenant|切换租户/i })).not.toBeInTheDocument();

    tenantsMock.mockResolvedValueOnce({ items: [systemTenant, acmeTenant] });
    act(() => {
      window.dispatchEvent(new Event(IDENTITY_TENANTS_UPDATED_EVENT));
    });

    await waitFor(() => {
      expect(tenantsMock).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("combobox", { name: /Switch Tenant|切换租户/i }),
      ).toBeInTheDocument();
    });
  });

  test("hides the tenant switcher for non platform admins", async () => {
    authPrincipal = defaultPrincipal({ platform_admin: false });
    tenantsMock.mockResolvedValue({ items: [systemTenant, acmeTenant] });
    renderShell();

    expect(tenantsMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: /Switch Tenant|切换租户/i })).not.toBeInTheDocument();
  });
});
