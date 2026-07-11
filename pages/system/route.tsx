import { preloadablePage } from "../preloadablePage";

const { Page: SystemPage, preload: preloadSystemPage } = preloadablePage(() =>
  import("./SystemPage").then((m) => ({ default: m.SystemPage })),
);

export const systemRoute = {
  path: "/system",
  element: <SystemPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.system" },
  requiredPermission: "system.status.read",
  preload: preloadSystemPage,
};
