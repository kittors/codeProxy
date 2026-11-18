import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";

/** 布局每次渲染时看到的地址：旧地址不该被当成一页挂进布局。 */
const layoutSeen = vi.hoisted(() => ({ pathnames: [] as string[] }));

const principal = {
  menus: [
    {
      code: "dashboard",
      parent_code: "",
      type: "menu" as const,
      path: "/dashboard",
      component: "dashboard",
      link_url: "",
      label_key: "shell.nav_dashboard",
      title: "",
      icon: "layout-dashboard",
      permission_code: "dashboard.read",
      sort_order: 10,
      visible: true,
      enabled: true,
      badge_type: "",
      badge_content: "",
      hide_menu: false,
      system_protected: true,
      version: 1,
    },
    {
      code: "docs.embed",
      parent_code: "",
      type: "embed" as const,
      path: "/docs-embed",
      component: "",
      link_url: "https://example.com",
      label_key: "shell.nav_docs",
      title: "Docs",
      icon: "link",
      permission_code: "",
      sort_order: 20,
      visible: true,
      enabled: true,
      badge_type: "",
      badge_content: "",
      hide_menu: false,
      system_protected: false,
      version: 1,
    },
  ],
  permissions: ["dashboard.read"],
  user: {
    display_name: "Admin",
    username: "admin",
    role_codes: [],
    must_change_password: false,
  },
  effective_tenant: { type: "system", name: "System" },
  home_tenant: { type: "system", name: "System" },
  roles: [],
  platform_admin: true,
  kind: "user_session" as const,
};

vi.mock("@app/providers/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    can: () => true,
    state: {
      isAuthenticated: true,
      isRestoring: false,
      principal,
    },
    actions: {
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
      refresh: vi.fn(),
    },
  }),
  useOptionalAuth: () => ({
    can: () => true,
    state: {
      isAuthenticated: true,
      isRestoring: false,
      principal,
    },
    actions: {
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
      refresh: vi.fn(),
    },
  }),
}));

vi.mock("@app/guards/ProtectedRoute", () => ({
  ProtectedRoute: () => <Outlet />,
}));

vi.mock("@app/layout/DashboardLayout", () => ({
  DashboardLayout: () => {
    layoutSeen.pathnames.push(useLocation().pathname);
    return (
      <div data-testid="dashboard-layout">
        <Outlet />
      </div>
    );
  },
}));

vi.mock("@app/update/AutoUpdatePrompt", () => ({
  AutoUpdatePrompt: () => null,
}));

vi.mock("@/app/bootstrap/dismissAppLoader", () => ({
  dismissAppLoader: vi.fn(),
}));

vi.mock("@pages/registry", async () => {
  const React = await import("react");
  return {
    pageRoutes: [
      {
        path: "/login",
        element: React.createElement("div", null, "login"),
        auth: false,
        layout: "standalone",
        nav: null,
      },
      {
        path: "/dashboard",
        component: "dashboard",
        element: React.createElement("div", { "data-testid": "dashboard-page" }, "dashboard"),
        auth: true,
        layout: "dashboard",
        nav: { labelKey: "nav.dashboard" },
        redirects: [{ from: "/", to: "/dashboard" }],
        requiredPermission: "dashboard.read",
      },
      {
        path: "/access/ai-accounts",
        element: React.createElement("div", { "data-testid": "ai-accounts-page" }, "ai accounts"),
        auth: true,
        layout: "dashboard",
        nav: null,
        redirects: [{ from: "/auth-files", to: "/access/ai-accounts", keepSearch: true }],
      },
    ],
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

vi.mock("@pages/embed/EmbedPage", () => ({
  EmbedPage: () => <div data-testid="embed-page">embed</div>,
}));

import { AppRouter } from "./AppRouter";

describe("AppRouter", () => {
  beforeEach(() => {
    layoutSeen.pathnames = [];
  });

  test("renders a legacy address as its target page right away, then fixes the address", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files?tab=alias"]}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("ai-accounts-page")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/access/ai-accounts?tab=alias"),
    );
    // 以前旧地址是布局里的一个 <Navigate> 页面：先挂一个空白页、走一遍切页动画，再跳目标页。
    expect(layoutSeen.pathnames.length).toBeGreaterThan(0);
    expect(layoutSeen.pathnames).not.toContain("/auth-files");
  });

  test("opens the dashboard at the panel root without mounting a redirect page", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/dashboard"));
    expect(layoutSeen.pathnames).not.toContain("/");
  });

  test("renders dashboard without invalid Route children error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRouter />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
    const routeChildErrors = errorSpy.mock.calls
      .flat()
      .map((arg) => String(arg ?? ""))
      .filter((msg) => msg.includes("is not a <Route> component"));
    expect(routeChildErrors).toEqual([]);
    errorSpy.mockRestore();
  });

  test("registers embed menu paths as real routes", async () => {
    render(
      <MemoryRouter initialEntries={["/docs-embed"]}>
        <AppRouter />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("embed-page")).toBeInTheDocument();
  });

  test("shows stale-route recovery instead of silently redirecting unknown paths", async () => {
    render(
      <MemoryRouter initialEntries={["/access/route-from-newer-shell"]}>
        <AppRouter />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", {
        name: /Page not found|页面未找到|Страница не найдена/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cmd\+Shift\+R/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reload page|重新加载页面|Перезагрузить страницу/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).not.toBeInTheDocument();
  });
});
