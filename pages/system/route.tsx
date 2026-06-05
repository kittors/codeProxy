import { lazy } from "react";

const SystemPage = lazy(() => import("./SystemPage").then((m) => ({ default: m.SystemPage })));

export const systemRoute = {
  path: "/system",
  element: <SystemPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.system" },
};
