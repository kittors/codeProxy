import { Navigate, useSearchParams } from "react-router-dom";
import { preloadablePage } from "../preloadablePage";

const { Page: ApiKeysPage, preload: preloadApiKeysPage } = preloadablePage(() =>
  import("./ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);

function ApiKeysEntry() {
  const [params] = useSearchParams();
  // Product entry is 用户账号; bare /access/api-keys redirects there.
  // Scoped deep-link ?endUserId= keeps the full key manager for one user.
  if (!params.get("endUserId")?.trim()) {
    return <Navigate to="/access/end-users" replace />;
  }
  return <ApiKeysPage />;
}

export const apiKeysRoute = {
  path: "/access/api-keys",
  component: "api-keys",
  element: <ApiKeysEntry />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.apiKeys" },
  redirects: [{ from: "/api-keys", to: "/access/end-users" }],
  requiredPermission: "api_keys.read",
  preload: preloadApiKeysPage,
};
