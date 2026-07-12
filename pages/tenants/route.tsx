import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./TenantsPage").then((m) => ({ default: m.TenantsPage })),
);
export const tenantsRoute = {
  path: "/governance/tenants",
  component: "tenants",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.tenants" },
  redirects: [{ from: "/tenants", to: "/governance/tenants" }],
  requiredPermission: "platform.tenants.read",
  preload,
};
