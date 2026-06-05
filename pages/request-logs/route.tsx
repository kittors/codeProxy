import { lazy } from "react";

const RequestLogsPage = lazy(() =>
  import("./RequestLogsPage").then((m) => ({ default: m.RequestLogsPage })),
);

export const requestLogsRoute = {
  path: "/monitor/request-logs",
  element: <RequestLogsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.requestLogs" },
};
