import { preloadablePage } from "../preloadablePage";

const { Page: LogsPage, preload: preloadLogsPage } = preloadablePage(() =>
  import("./LogsPage").then((m) => ({ default: m.LogsPage })),
);

export const logsRoute = {
  path: "/runtime/logs",
  component: "logs",
  element: <LogsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.logs" },
  redirects: [{ from: "/logs", to: "/runtime/logs" }],
  requiredPermission: "system.logs.read",
  preload: preloadLogsPage,
};
