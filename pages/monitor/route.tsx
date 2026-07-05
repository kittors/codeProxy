import { preloadablePage } from "../preloadablePage";

const { Page: MonitorPage, preload: preloadMonitorPage } = preloadablePage(() =>
  import("./MonitorPage").then((m) => ({ default: m.MonitorPage })),
);

export const monitorRoute = {
  path: "/monitor",
  element: <MonitorPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.monitor" },
  redirects: [{ from: "/usage", to: "/monitor" }],
  preload: preloadMonitorPage,
};
