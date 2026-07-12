import { Navigate, useLocation } from "react-router-dom";

function AuthFilesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/access/ai-accounts", search: location.search }} replace />;
}

export const authFilesRoute = {
  path: "/auth-files",
  element: <AuthFilesRedirect />,
  auth: true,
  layout: "dashboard",
  requiredPermission: "auth_files.read",
  nav: { labelKey: "nav.authFiles" },
  redirects: [
    { from: "/auth-files/oauth-excluded", to: "/access/ai-accounts?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/access/ai-accounts?tab=alias" },
  ],
};
