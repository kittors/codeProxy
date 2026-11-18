import { preloadablePage } from "../preloadablePage";

const { Page: DashboardPage, preload: preloadDashboardPage } = preloadablePage(() =>
  import("./DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

export const dashboardRoute = {
  path: "/dashboard",
  component: "dashboard",
  element: <DashboardPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.dashboard" },
  // 面板根地址（/manage/）就是仪表盘。
  redirects: [{ from: "/", to: "/dashboard" }],
  requiredPermission: "dashboard.read",
  preload: preloadDashboardPage,
};
