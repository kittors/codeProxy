import { lazy } from "react";

const ConfigPage = lazy(() => import("./ConfigPage").then((m) => ({ default: m.ConfigPage })));

export const configRoute = {
  path: "/config",
  element: <ConfigPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.config" },
  redirects: [{ from: "/settings", to: "/config" }],
};
