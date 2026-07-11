import { preloadablePage } from "../preloadablePage";

const { Page: ProvidersPage, preload: preloadProvidersPage } = preloadablePage(
  () => import("./ProvidersPage").then((m) => ({ default: m.ProvidersPage })),
);

export const providersRoute = {
  path: "/ai-providers",
  element: <ProvidersPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.providers" },
  hasWildcard: true,
  requiredPermission: "providers.read",
  preload: preloadProvidersPage,
};
