import { preloadablePage } from "../preloadablePage";

const { Page: DashboardPage, preload: preloadDashboardPage } = preloadablePage(() =>
  import("./DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

export const dashboardRoute = {
  path: "/dashboard",
  element: <DashboardPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.dashboard" },
  requiredPermission: "dashboard.read",
  preload: preloadDashboardPage,
};
