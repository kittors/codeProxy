import { Navigate } from "react-router-dom";

export const authFilesRoute = {
  path: "/auth-files",
  element: <Navigate to="/account-security" replace />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.authFiles" },
  redirects: [
    { from: "/auth-files/oauth-excluded", to: "/account-security?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/account-security?tab=alias" },
  ],
};
