import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./RolesPage").then((m) => ({ default: m.RolesPage })),
);
export const rolesRoute = {
  path: "/roles",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.roles" },
  requiredPermission: "tenant.roles.read",
  preload,
};
