import { lazy } from "react";

const ProxiesPage = lazy(() => import("./ProxiesPage").then((m) => ({ default: m.ProxiesPage })));

export const proxiesRoute = {
  path: "/proxies",
  element: <ProxiesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.proxies" },
  redirects: [{ from: "/manage/proxies", to: "/proxies" }],
};
