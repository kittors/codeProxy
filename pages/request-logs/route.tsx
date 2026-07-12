import { preloadablePage } from "../preloadablePage";

const { Page: RequestLogsPage, preload: preloadRequestLogsPage } = preloadablePage(() =>
  import("./RequestLogsPage").then((m) => ({ default: m.RequestLogsPage })),
);

export const requestLogsRoute = {
  path: "/runtime/request-logs",
  component: "request-logs",
  element: <RequestLogsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.requestLogs" },
  redirects: [{ from: "/monitor/request-logs", to: "/runtime/request-logs" }],
  requiredPermission: "request_logs.read",
  preload: preloadRequestLogsPage,
};
