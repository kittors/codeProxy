import { preloadablePage } from "../preloadablePage";

const { Page: ConfigPage, preload: preloadConfigPage } = preloadablePage(() =>
  import("./ConfigPage").then((m) => ({ default: m.ConfigPage })),
);

export const configRoute = {
  path: "/system/config",
  component: "config",
  element: <ConfigPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.config" },
  redirects: [
    { from: "/config", to: "/system/config" },
    { from: "/settings", to: "/system/config" },
  ],
  requiredPermission: "system.config.read",
  preload: preloadConfigPage,
};
