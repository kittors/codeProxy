import { preloadablePage } from "../preloadablePage";

const { Page: RequestLogsPage, preload: preloadRequestLogsPage } = preloadablePage(() =>
  import("./RequestLogsPage").then((m) => ({ default: m.RequestLogsPage })),
);

export const requestLogsRoute = {
  path: "/monitor/request-logs",
  element: <RequestLogsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.requestLogs" },
  requiredPermission: "request_logs.read",
  preload: preloadRequestLogsPage,
};
