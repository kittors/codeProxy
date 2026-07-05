import { preloadablePage } from "../preloadablePage";

const { Page: LoginPage, preload: preloadLoginPage } = preloadablePage(() =>
  import("./LoginPage").then((m) => ({ default: m.LoginPage })),
);

export const loginRoute = {
  path: "/login",
  element: <LoginPage />,
  auth: false,
  layout: "none",
  nav: null,
  preload: preloadLoginPage,
};
