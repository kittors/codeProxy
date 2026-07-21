import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: () => true,
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

function renderShell(initialPath = "/dashboard") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div>Dashboard route</div>
          <LocationEcho />
        </AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function defaultPrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    menus: testMenus,
    user: { display_name: "Admin", username: "admin", role_codes: [] },
    effective_tenant: systemTenant,
    ...overrides,
  };
}

describe("AppShell route progress", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal();
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
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access(?: & Credentials)?|接入(?:管理|与凭证)/i }));

    const link = document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    expect(preloadPageRoute).toHaveBeenCalledWith("/access/ai-providers");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(680);
    });

    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    await act(async () => {
      resolvePreload?.();
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/access/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("animates a fixed window-top progress bar during sidebar navigation", async () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access(?: & Credentials)?|接入(?:管理|与凭证)/i }));

    const link = document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    await act(async () => {
      vi.advanceTimersByTime(680);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/access/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("restarts the progress animation on rapid sidebar navigation", async () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access(?: & Credentials)?|接入(?:管理|与凭证)/i }));

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]')!);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.click(screen.getByRole("button", { name: /Models & Routing|模型与(?:路由|调度)/i }));
    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/models/catalog"]')!);

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
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access(?: & Credentials)?|接入(?:管理|与凭证)/i }));

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]')!, {
      ctrlKey: true,
    });

    expect(preloadPageRoute).not.toHaveBeenCalled();
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });

  test("recovers from chunk load failures instead of navigating into a blank route", async () => {
    vi.useFakeTimers();
    const chunkError = new TypeError("Failed to fetch dynamically imported module");
    vi.mocked(preloadPageRoute).mockRejectedValueOnce(chunkError);
    vi.mocked(recoverFromChunkLoadError).mockReturnValueOnce(true);

    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access(?: & Credentials)?|接入(?:管理|与凭证)/i }));
    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]')!);

    await act(async () => {
      vi.advanceTimersByTime(680);
      await Promise.resolve();
    });

    expect(recoverFromChunkLoadError).toHaveBeenCalledWith(chunkError);
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("groups sidebar routes and uses a compact neutral active state", () => {
    renderShell("/runtime/request-logs");

    const runtimeGroup = screen.getByRole("button", {
      name: /Operations|Observability|运行监控|运行观测/i,
    });
    expect(runtimeGroup).toHaveAttribute("aria-expanded", "true");

    const requestLogs = screen.getByRole("link", { name: /Request Logs|请求日志/i });
    expect(requestLogs).toHaveAttribute("aria-current", "page");
    expect(requestLogs).toHaveClass("bg-slate-100", "text-sm", "h-9");
    expect(requestLogs.className).not.toContain("from-blue-600");

    fireEvent.click(runtimeGroup);
    expect(runtimeGroup).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Request Logs|请求日志/i })).not.toBeInTheDocument();
  });

  test("renders system info as a top-level leaf after all nav groups", () => {
    renderShell("/dashboard");

    const systemInfo = screen.getByRole("link", { name: /System Info|系统信息/i });
    expect(systemInfo).toHaveAttribute("href", "/runtime/system");

    // Must not appear nested under the runtime group children list.
    const runtimeGroup = screen.getByRole("button", {
      name: /Operations|Observability|运行监控|运行观测/i,
    });
    const runtimeRegion = runtimeGroup.closest("div");
    expect(runtimeRegion?.querySelector('a[href="/runtime/system"]')).toBeNull();

    const nav = document.querySelector("nav");
    expect(nav).toBeTruthy();
    const topLevel = Array.from(nav!.children);
    const systemIndex = topLevel.findIndex(
      (el) => el instanceof HTMLElement && el.matches('a[href="/runtime/system"]'),
    );
    let lastGroupIndex = -1;
    topLevel.forEach((el, index) => {
      if (el instanceof HTMLElement && el.querySelector("button[aria-expanded]")) {
        lastGroupIndex = index;
      }
    });
    expect(systemIndex).toBeGreaterThan(lastGroupIndex);
    expect(systemIndex).toBe(topLevel.length - 1);
  });

  test("keeps a stable icon rail and the same sidebar toggle icon when collapsed", () => {
    vi.useFakeTimers();
    renderShell("/system/config");

    const collapseButton = screen.getByRole("button", {
      name: /Collapse Sidebar|收起侧边栏/i,
    });
    const iconClass = collapseButton.querySelector("svg")?.getAttribute("class");

    fireEvent.click(collapseButton);
    act(() => {
      vi.advanceTimersByTime(90);
    });

    const aside = document.querySelector("aside");
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(aside).toHaveClass("w-16");

    const expandButton = screen.getByRole("button", {
      name: /Expand Sidebar|展开侧边栏/i,
    });
    expect(expandButton.querySelector("svg")?.getAttribute("class")).toBe(iconClass);
    expect(screen.getByRole("link", { name: /Dashboard|仪表盘/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Models & Routing|模型与(?:路由|调度)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });
});

describe("AppShell mobile sidebar", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal();
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
    expect(aside).toHaveClass(
      "-translate-x-full",
      "will-change-transform",
      "motion-safe:duration-[320ms]",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i }),
    );

    expect(aside).toHaveAttribute("data-mobile-open", "true");
    expect(aside).toHaveClass("translate-x-0");
    expect(backdrop).toHaveClass("opacity-100", "motion-safe:duration-[320ms]");

    fireEvent.click(backdrop);

    expect(aside).toHaveAttribute("data-mobile-open", "false");
    expect(aside).toHaveClass("-translate-x-full");
    expect(backdrop).toHaveClass("pointer-events-none", "opacity-0");
    expect(document.body.contains(aside)).toBe(true);
  });
});

describe("AppShell tenant switcher", () => {
  beforeEach(() => {
    authPrincipal = defaultPrincipal({ platform_admin: true });
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
