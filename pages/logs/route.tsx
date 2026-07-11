import { preloadablePage } from "../preloadablePage";

const { Page: LogsPage, preload: preloadLogsPage } = preloadablePage(() =>
  import("./LogsPage").then((m) => ({ default: m.LogsPage })),
);

export const logsRoute = {
  path: "/logs",
  element: <LogsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.logs" },
  requiredPermission: "system.logs.read",
  preload: preloadLogsPage,
};
