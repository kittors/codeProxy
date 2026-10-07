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

/** 多页分区展开后的页面列表，按分区名定位。 */
const sectionList = (name: RegExp) => screen.getByRole("group", { name });
/** 多页分区的标题行（展开态点它展开 / 收起，收起态点它弹出浮层）。 */
const sectionButton = (name: RegExp) => screen.getByRole("button", { name });

function defaultPrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    menus: testMenus,
    user: { display_name: "Admin", username: "admin", role_codes: [] },
    effective_tenant: systemTenant,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.removeItem("cli-proxy-sidebar-open-groups");
});

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

  test("opens a folded section and navigates to one of its pages, with the progress bar", async () => {
    vi.useFakeTimers();
    renderShell();

    // 点分区标题只展开列表，不跳页。
    fireEvent.click(sectionButton(ACCESS));
    expect(sectionButton(ACCESS)).toHaveAttribute("aria-expanded", "true");
    expect(preloadPageRoute).not.toHaveBeenCalled();

    fireEvent.click(within(sectionList(ACCESS)).getByRole("link", { name: /AI Providers|AI 供应商/i }));
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
    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/runtime/system"]')!);

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
    expect(screen.getByTestId("location")).toHaveTextContent("/runtime/system");
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

  test("unfolds the active section and marks the current page with a neutral card", () => {
    renderShell("/runtime/request-logs");

    const runtimeHeader = sectionButton(OBSERVABILITY);
    expect(runtimeHeader).toHaveAttribute("data-active", "true");
    expect(runtimeHeader).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton(ACCESS)).not.toHaveAttribute("data-active");
    expect(sectionButton(ACCESS)).toHaveAttribute("aria-expanded", "false");
    expect(sectionList(ACCESS)).toHaveAttribute("inert");

    const list = sectionList(OBSERVABILITY);
    expect(list).not.toHaveAttribute("inert");
    const requestLogs = within(list).getByRole("link", { name: /Request Logs|请求日志/i });
    expect(requestLogs).toHaveAttribute("aria-current", "page");
    expect(requestLogs).toHaveClass("bg-surface", "text-sm", "h-8");
    expect(requestLogs.className).not.toContain("from-blue-600");
    // 列表展开时选中外观在页面上，分区标题不再重复一份。
    expect(runtimeHeader).not.toHaveClass("bg-surface");
    expect(within(list).getByRole("link", { name: /Monitor|监控中心/i })).not.toHaveAttribute(
      "aria-current",
    );
    // 其它分区的页面不在这个分区的列表里。
    expect(within(list).queryByRole("link", { name: /AI Providers|AI 供应商/i })).toBeNull();
  });

  test("folds sections on click, remembers the choice, and keeps the active section findable", () => {
    const view = renderShell("/runtime/request-logs");

    fireEvent.click(sectionButton(ACCESS));
    expect(sectionButton(ACCESS)).toHaveAttribute("aria-expanded", "true");
    expect(sectionList(ACCESS)).not.toHaveAttribute("inert");

    // 收起当前分区：选中外观转到分区标题上，用户仍看得出自己在哪。
    const runtimeHeader = sectionButton(OBSERVABILITY);
    fireEvent.click(runtimeHeader);
    expect(runtimeHeader).toHaveAttribute("aria-expanded", "false");
    expect(sectionList(OBSERVABILITY)).toHaveAttribute("inert");
    expect(runtimeHeader).toHaveClass("bg-surface");

    expect(JSON.parse(localStorage.getItem("cli-proxy-sidebar-open-groups") ?? "[]")).toEqual([
      "group.access",
    ]);
    view.unmount();

    // 重新打开：手动展开的分区保持展开，当前页所在的分区重新自动展开。
    renderShell("/runtime/request-logs");
    expect(sectionButton(ACCESS)).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton(OBSERVABILITY)).toHaveAttribute("aria-expanded", "true");
    expect(sectionButton(MODELS)).toHaveAttribute("aria-expanded", "false");
  });

  test("places content moderation under access and uses the shield-alert icon", () => {
    renderShell("/access/content-moderation");

    expect(sectionButton(ACCESS)).toHaveAttribute("data-active", "true");
    const moderation = within(sectionList(ACCESS)).getByRole("link", {
      name: /Content Moderation|内容审核|Модерация контента/i,
    });
    expect(moderation).toHaveAttribute("href", "/access/content-moderation");
    expect(moderation).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("heading", { name: /Content Moderation|内容审核|Модерация контента/i }),
    ).toBeInTheDocument();

    // 展开的列表里子项只有文字；菜单配的图标出现在收起后的分区浮层里。
    expect(moderation.querySelector("svg")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Collapse Sidebar|收起侧边栏/i }));
    fireEvent.pointerEnter(sectionButton(ACCESS).parentElement!);
    const flyoutItem = within(screen.getByRole("menu", { name: ACCESS })).getByRole("menuitem", {
      name: /Content Moderation|内容审核|Модерация контента/i,
    });
    expect(flyoutItem.querySelector("svg")).toHaveClass("lucide-shield-alert");
    localStorage.removeItem("cli-proxy-sidebar-collapsed");
  });

  test("keeps the legacy moderation path title as a stale-shell safety fallback", () => {
    authPrincipal = defaultPrincipal({ menus: [] });
    renderShell("/runtime/content-moderation");

    expect(
      screen.getByRole("heading", { name: /Content Moderation|内容审核|Модерация контента/i }),
    ).toBeInTheDocument();
  });

  test("renders system info as a top-level row after all sections", () => {
    renderShell("/dashboard");

    const nav = screen.getByRole("navigation", { name: /Sections|分区/i });
    // 顶层条目：单页分区是链接本身，多页分区是包着标题与列表的一层。
    const entries = Array.from(nav.children) as HTMLElement[];
    const last = entries.at(-1);
    expect(last).toHaveAttribute("href", "/runtime/system");
    expect(last).toHaveTextContent(/System Info|系统信息/i);
    expect(entries[0]).toHaveAttribute("href", "/dashboard");
    expect(entries[0]).toHaveAttribute("aria-current", "page");
    expect(entries[0]).toHaveClass("bg-surface");
    expect(entries.slice(1, -1).map((entry) => entry.querySelector("[data-sidebar-section]")?.getAttribute("data-sidebar-section"))).toEqual([
      "group.runtime",
      "group.access",
      "group.models",
      "group.system",
    ]);
  });

  test("hides entries without permission and disabled menus", () => {
    grantedPermissions = (permission) => permission !== "monitor.read";
    authPrincipal = defaultPrincipal({
      menus: testMenus.map((entry) =>
        entry.code === "group.models" ? { ...entry, enabled: false } : entry,
      ),
    });
    renderShell("/runtime/request-logs");

    const list = sectionList(OBSERVABILITY);
    expect(within(list).queryByRole("link", { name: /Monitor|监控中心/i })).toBeNull();
    expect(within(list).getByRole("link", { name: /Request Logs|请求日志/i })).toBeInTheDocument();
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
    expect(localStorage.getItem("cli-proxy-sidebar-collapsed")).toBe("1");

    const expand = screen.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i });
    expect(expand).toBe(toggle);
    expect(expand.querySelector("svg")?.getAttribute("class")).toBe(iconClass);
    // 只剩图标：文字仍在（可访问名称不变），悬停改由提示气泡露出名字；展开的分区把列表折起来。
    const dashboard = screen.getByRole("link", { name: /Dashboard|仪表盘/i });
    expect(dashboard).toHaveAttribute("data-tooltip", expect.stringMatching(/Dashboard|仪表盘/i));
    expect(sectionList(/System Settings|系统设置/i)).toHaveAttribute("inert");
    expect(sectionButton(MODELS)).toHaveAttribute("aria-haspopup", "menu");
    // 当前页所在的分区只剩图标，选中外观落在图标上。
    expect(sectionButton(/System Settings|系统设置/i)).toHaveClass("bg-surface");
    const account = screen.getByRole("button", { name: "Admin" });
    expect(account).toHaveAttribute("data-tooltip", "Admin");

    fireEvent.click(expand);
    expect(dashboard).not.toHaveAttribute("data-tooltip");
    expect(account).not.toHaveAttribute("data-tooltip");
    expect(sectionList(/System Settings|系统设置/i)).not.toHaveAttribute("inert");
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

    const models = sectionButton(MODELS);
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
    expect(aside).toHaveClass("-translate-x-full", "will-change-transform", "motion-safe:duration-200");

    fireEvent.click(screen.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i }));

    // 打开走 320ms 指数减速，关闭走 200ms ease-in（与弹窗、抽屉同一套节奏）。
    expect(aside).toHaveAttribute("data-mobile-open", "true");
    expect(aside).toHaveClass("translate-x-0", "motion-safe:duration-[320ms]", "motion-safe:ease-pop");
    expect(backdrop).toHaveClass("opacity-100", "motion-safe:duration-[320ms]");
    // 抽屉和桌面侧边栏是同一套分区导航：分区可以展开，点开就能看到下面的页面。
    const drawer = within(aside as HTMLElement);
    fireEvent.click(drawer.getByRole("button", { name: ACCESS }));
    expect(drawer.getByRole("button", { name: ACCESS })).toHaveAttribute("aria-expanded", "true");
    expect(
      within(drawer.getByRole("group", { name: ACCESS })).getByRole("link", { name: /AI Providers|AI 供应商/i }),
    ).toBeInTheDocument();

    fireEvent.click(backdrop);

    expect(aside).toHaveAttribute("data-mobile-open", "false");
    expect(aside).toHaveClass("-translate-x-full");
    expect(backdrop).toHaveClass("pointer-events-none", "opacity-0");
    expect(document.body.contains(aside)).toBe(true);
  });

  test("closes the drawer as soon as a page is picked", () => {
    renderShell("/runtime/monitor");
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
