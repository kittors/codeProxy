import { lazy } from "react";

const ApiKeysPage = lazy(() => import("./ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })));

export const apiKeysRoute = {
  path: "/api-keys",
  element: <ApiKeysPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.apiKeys" },
};
