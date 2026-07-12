import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./MenuManagementPage").then((module) => ({ default: module.MenuManagementPage })),
);

export const menuManagementRoute = {
  path: "/menu-management",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.menuManagement" },
  requiredPermission: "platform.menus.read",
  preload,
};
