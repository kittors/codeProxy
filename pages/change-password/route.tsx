import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./ChangePasswordPage").then((m) => ({ default: m.ChangePasswordPage })),
);
export const changePasswordRoute = {
  path: "/change-password",
  element: <Page />,
  auth: true,
  layout: "standalone",
  nav: null,
  preload,
};
