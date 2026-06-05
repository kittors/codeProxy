import { lazy } from "react";

const LogsPage = lazy(() => import("./LogsPage").then((m) => ({ default: m.LogsPage })));

export const logsRoute = {
  path: "/logs",
  element: <LogsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.logs" },
};
