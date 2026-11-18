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
  redirects: [
    { from: "/api-keys", to: "/access/end-users" },
    // Product entry is 用户账号; bare /access/api-keys redirects there.
    // Scoped deep-link ?endUserId= keeps the full key manager for one user.
    {
      from: "/access/api-keys",
      to: "/access/end-users",
      when: (params: URLSearchParams) => !params.get("endUserId")?.trim(),
    },
  ],
  requiredPermission: "api_keys.read",
  preload: preloadApiKeysPage,
};
