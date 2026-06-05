import { lazy } from "react";

const AuthFilesPage = lazy(() =>
  import("./AuthFilesPage").then((m) => ({ default: m.AuthFilesPage })),
);

export const authFilesRoute = {
  path: "/auth-files",
  element: <AuthFilesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.authFiles" },
  redirects: [
    { from: "/auth-files/oauth-excluded", to: "/auth-files?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/auth-files?tab=alias" },
  ],
};
