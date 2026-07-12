import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@code-proxy/ui";
import type { MenuIdentity } from "@code-proxy/api-client";
import { preloadPageRoute } from "@pages/registry";
import { AppShell } from "./AppShell";

vi.mock("@pages/registry", () => ({
  preloadPageRoute: vi.fn(() => Promise.resolve()),
}));

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
];

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: () => true,
    state: {
      principal: {
        menus: testMenus,
        user: { display_name: "Admin", username: "admin", role_codes: [] },
        effective_tenant: { type: "system", name: "System" },
      },
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

describe("AppShell route progress", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(preloadPageRoute).mockClear();
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
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]')!);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.click(screen.getByRole("button", { name: /Models & Routing|模型与路由/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/access/ai-providers"]')!, {
      ctrlKey: true,
    });

    expect(preloadPageRoute).not.toHaveBeenCalled();
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });
  test("groups sidebar routes and uses a compact neutral active state", () => {
    renderShell("/runtime/request-logs");

    const runtimeGroup = screen.getByRole("button", { name: /Operations|运行监控/i });
    expect(runtimeGroup).toHaveAttribute("aria-expanded", "true");

    const requestLogs = screen.getByRole("link", { name: /Request Logs|请求日志/i });
    expect(requestLogs).toHaveAttribute("aria-current", "page");
    expect(requestLogs).toHaveClass("bg-slate-100", "text-sm", "h-9");
    expect(requestLogs.className).not.toContain("from-blue-600");

    fireEvent.click(runtimeGroup);
    expect(runtimeGroup).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Request Logs|请求日志/i })).not.toBeInTheDocument();
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
      screen.getByRole("button", { name: /Models & Routing|模型与路由/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });
});
