import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./UsersPage").then((m) => ({ default: m.UsersPage })),
);
export const usersRoute = {
  path: "/governance/users",
  component: "users",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.users" },
  redirects: [{ from: "/users", to: "/governance/users" }],
  requiredPermission: "tenant.users.read",
  preload,
};
