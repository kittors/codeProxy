import { preloadablePage } from "../preloadablePage";

const { Page: ProvidersPage, preload: preloadProvidersPage } = preloadablePage(
  () => import("./ProvidersPage").then((m) => ({ default: m.ProvidersPage })),
);

export const providersRoute = {
  path: "/access/ai-providers",
  component: "providers",
  element: <ProvidersPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.providers" },
  hasWildcard: true,
  redirects: [{ from: "/ai-providers", to: "/access/ai-providers" }],
  requiredPermission: "providers.read",
  preload: preloadProvidersPage,
};
