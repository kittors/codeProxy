import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./AlertsPage").then((m) => ({ default: m.AlertsPage })),
);

export const alertsRoute = {
  path: "/system/alerts",
  component: "alerts",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.alerts" },
  requiredPermission: "tenant_settings.read",
  preload,
};
