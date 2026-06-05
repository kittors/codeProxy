import { lazy } from "react";

const ProvidersPage = lazy(() =>
  import("./ProvidersPage").then((m) => ({ default: m.ProvidersPage })),
);

export const providersRoute = {
  path: "/ai-providers",
  element: <ProvidersPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.providers" },
  hasWildcard: true,
};
