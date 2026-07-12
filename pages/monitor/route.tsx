import { preloadablePage } from "../preloadablePage";

const { Page: MonitorPage, preload: preloadMonitorPage } = preloadablePage(() =>
  import("./MonitorPage").then((m) => ({ default: m.MonitorPage })),
);

export const monitorRoute = {
  path: "/runtime/monitor",
  component: "monitor",
  element: <MonitorPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.monitor" },
  redirects: [
    { from: "/monitor", to: "/runtime/monitor" },
    { from: "/usage", to: "/runtime/monitor" },
  ],
  requiredPermission: "monitor.read",
  preload: preloadMonitorPage,
};
