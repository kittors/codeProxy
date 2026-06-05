import { lazy } from "react";

const DashboardPage = lazy(() =>
  import("./DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

export const dashboardRoute = {
  path: "/dashboard",
  element: <DashboardPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.dashboard" },
};
