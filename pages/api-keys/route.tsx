import { preloadablePage } from "../preloadablePage";

const { Page: ApiKeysPage, preload: preloadApiKeysPage } = preloadablePage(() =>
  import("./ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);

export const apiKeysRoute = {
  path: "/api-keys",
  element: <ApiKeysPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.apiKeys" },
  requiredPermission: "api_keys.read",
  preload: preloadApiKeysPage,
};
