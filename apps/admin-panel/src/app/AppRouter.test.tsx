import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";

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
  DashboardLayout: () => (
    <div data-testid="dashboard-layout">
      <Outlet />
    </div>
  ),
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
        requiredPermission: "dashboard.read",
      },
    ],
  };
});

vi.mock("@pages/embed/EmbedPage", () => ({
  EmbedPage: () => <div data-testid="embed-page">embed</div>,
}));

import { AppRouter } from "./AppRouter";

describe("AppRouter", () => {
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
