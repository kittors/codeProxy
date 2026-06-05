import { lazy } from "react";

const OAuthPage = lazy(() => import("./OAuthPage").then((m) => ({ default: m.OAuthPage })));

export const oauthRoute = {
  path: "/oauth",
  element: <OAuthPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.oauth" },
};
