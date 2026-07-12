import { preloadablePage } from "../preloadablePage";

const { Page: ApiKeysPage, preload: preloadApiKeysPage } = preloadablePage(() =>
  import("./ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);

export const apiKeysRoute = {
  path: "/access/api-keys",
  component: "api-keys",
  element: <ApiKeysPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.apiKeys" },
  redirects: [{ from: "/api-keys", to: "/access/api-keys" }],
  requiredPermission: "api_keys.read",
  preload: preloadApiKeysPage,
};
