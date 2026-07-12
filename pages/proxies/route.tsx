import { preloadablePage } from "../preloadablePage";

const { Page: ProxiesPage, preload: preloadProxiesPage } = preloadablePage(() =>
  import("./ProxiesPage").then((m) => ({ default: m.ProxiesPage })),
);

export const proxiesRoute = {
  path: "/models/proxies",
  component: "proxies",
  element: <ProxiesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.proxies" },
  redirects: [
    { from: "/proxies", to: "/models/proxies" },
    { from: "/manage/proxies", to: "/models/proxies" },
  ],
  requiredPermission: "proxies.read",
  preload: preloadProxiesPage,
};
