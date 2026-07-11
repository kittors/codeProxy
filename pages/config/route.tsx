import { preloadablePage } from "../preloadablePage";

const { Page: ConfigPage, preload: preloadConfigPage } = preloadablePage(() =>
  import("./ConfigPage").then((m) => ({ default: m.ConfigPage })),
);

export const configRoute = {
  path: "/config",
  element: <ConfigPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.config" },
  redirects: [{ from: "/settings", to: "/config" }],
  requiredPermission: "system.config.read",
  preload: preloadConfigPage,
};
