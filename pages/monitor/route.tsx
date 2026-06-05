import { lazy } from "react";

const MonitorPage = lazy(() => import("./MonitorPage").then((m) => ({ default: m.MonitorPage })));

export const monitorRoute = {
  path: "/monitor",
  element: <MonitorPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.monitor" },
  redirects: [{ from: "/usage", to: "/monitor" }],
};
