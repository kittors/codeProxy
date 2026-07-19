import { lazy, Suspense } from "react";
import type { PageRoute } from "../registry";

const EndUsersPage = lazy(() =>
  import("./EndUsersPage").then((m) => ({ default: m.EndUsersPage })),
);

export const endUsersRoute: PageRoute = {
  path: "/access/end-users",
  element: (
    <Suspense fallback={null}>
      <EndUsersPage />
    </Suspense>
  ),
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "shell.nav_end_users" },
  requiredPermission: "end_users.read",
  // Legacy key-admin roles: seed grants end_users.read from api_keys.read; keep OR for safety.
  requiredAnyPermissions: ["api_keys.read"],
  component: "end-users",
  preload: () => import("./EndUsersPage"),
};
