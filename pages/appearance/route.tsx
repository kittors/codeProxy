import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./AppearancePage").then((module) => ({ default: module.AppearancePage })),
);

/**
 * 外观：只改当前浏览器里的显示偏好，不调任何管理接口，所以不设权限——所有登录用户都能进。
 * 菜单由 CliRelay 的 MenuCatalog 下发（system.appearance）；更早的后端没有这一项时，
 * 侧边栏会自己补上（见 app/layout/shell/navModel.ts 的 withAppearanceMenu）。
 */
export const appearanceRoute = {
  path: "/system/appearance",
  component: "appearance",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.appearance" },
  preload,
};
