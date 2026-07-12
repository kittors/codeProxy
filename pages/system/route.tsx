import { preloadablePage } from "../preloadablePage";

const { Page: SystemPage, preload: preloadSystemPage } = preloadablePage(() =>
  import("./SystemPage").then((m) => ({ default: m.SystemPage })),
);

export const systemRoute = {
  path: "/runtime/system",
  component: "system",
  element: <SystemPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.system" },
  redirects: [{ from: "/system", to: "/runtime/system" }],
  requiredPermission: "system.status.read",
  preload: preloadSystemPage,
};
