import { Navigate } from "react-router-dom";

export const identityFingerprintRoute = {
  path: "/identity-fingerprint",
  element: <Navigate to="/system/account-security" replace />,
  auth: true,
  layout: "dashboard",
  requiredPermission: "auth_files.read",
  nav: { labelKey: "nav.identityFingerprint" },
  redirects: [{ from: "/manage/identity-fingerprint", to: "/system/account-security" }],
};
