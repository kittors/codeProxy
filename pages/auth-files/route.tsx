import { Navigate, useLocation } from "react-router-dom";

function AuthFilesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/system/account-security", search: location.search }} replace />;
}

export const authFilesRoute = {
  path: "/auth-files",
  element: <AuthFilesRedirect />,
  auth: true,
  layout: "dashboard",
  requiredPermission: "auth_files.read",
  nav: { labelKey: "nav.authFiles" },
  redirects: [
    { from: "/auth-files/oauth-excluded", to: "/system/account-security?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/system/account-security?tab=alias" },
  ],
};
