import { preloadablePage } from "../preloadablePage";

const { Page: ApiKeyPermissionsPage, preload: preloadApiKeyPermissionsPage } = preloadablePage(() =>
  import("./ApiKeyPermissionsPage").then((m) => ({
    default: m.ApiKeyPermissionsPage,
  })),
);

export const apiKeyPermissionsRoute = {
  path: "/access/api-key-permissions",
  component: "api-key-permissions",
  element: <ApiKeyPermissionsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.apiKeyPermissions" },
  redirects: [
    { from: "/api-key-permissions", to: "/access/api-key-permissions" },
    { from: "/system/api-key-permissions", to: "/access/api-key-permissions" },
    { from: "/manage/api-key-permissions", to: "/access/api-key-permissions" },
  ],
  requiredPermission: "api_key_profiles.read",
  preload: preloadApiKeyPermissionsPage,
};
