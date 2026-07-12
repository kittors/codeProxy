import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./MenuManagementPage").then((module) => ({ default: module.MenuManagementPage })),
);

export const menuManagementRoute = {
  path: "/system/menu-management",
  component: "menu-management",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.menuManagement" },
  redirects: [{ from: "/menu-management", to: "/system/menu-management" }],
  requiredPermission: "platform.menus.read",
  preload,
};
