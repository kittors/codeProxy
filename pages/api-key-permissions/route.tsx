import { lazy } from "react";

const ApiKeyPermissionsPage = lazy(() =>
  import("./ApiKeyPermissionsPage").then((m) => ({
    default: m.ApiKeyPermissionsPage,
  })),
);

export const apiKeyPermissionsRoute = {
  path: "/api-key-permissions",
  element: <ApiKeyPermissionsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.apiKeyPermissions" },
  redirects: [{ from: "/manage/api-key-permissions", to: "/api-key-permissions" }],
};
