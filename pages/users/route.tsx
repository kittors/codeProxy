import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./UsersPage").then((m) => ({ default: m.UsersPage })),
);
export const usersRoute = {
  path: "/users",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.users" },
  requiredPermission: "tenant.users.read",
  preload,
};
