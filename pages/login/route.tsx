import { lazy } from "react";

const LoginPage = lazy(() => import("./LoginPage").then((m) => ({ default: m.LoginPage })));

export const loginRoute = {
  path: "/login",
  element: <LoginPage />,
  auth: false,
  layout: "none",
  nav: null,
};
