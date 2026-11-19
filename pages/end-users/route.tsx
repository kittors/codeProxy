import { preloadablePage } from "../preloadablePage";
import type { PageRoute } from "../registry";

// 和其他页面一样用 preloadablePage：代码加载完之后同步渲染，外壳在切页前能等到它（见 DashboardLayout）。
// 以前是 React.lazy 包一层 Suspense fallback={null}，即便代码已经预加载过，首次渲染也要先挂起一拍，
// 新页面入场时内容区是空的。
const { Page: EndUsersPage, preload: preloadEndUsersPage } = preloadablePage(() =>
  import("./EndUsersPage").then((m) => ({ default: m.EndUsersPage })),
);

export const endUsersRoute: PageRoute = {
  path: "/access/end-users",
  element: <EndUsersPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "shell.nav_end_users" },
  requiredPermission: "end_users.read",
  // Legacy key-admin roles: seed grants end_users.read from api_keys.read; keep OR for safety.
  requiredAnyPermissions: ["api_keys.read"],
  component: "end-users",
  preload: preloadEndUsersPage,
};
