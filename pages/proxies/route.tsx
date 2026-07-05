import { preloadablePage } from "../preloadablePage";

const { Page: ProxiesPage, preload: preloadProxiesPage } = preloadablePage(() =>
  import("./ProxiesPage").then((m) => ({ default: m.ProxiesPage })),
);

export const proxiesRoute = {
  path: "/proxies",
  element: <ProxiesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.proxies" },
  redirects: [{ from: "/manage/proxies", to: "/proxies" }],
  preload: preloadProxiesPage,
};
