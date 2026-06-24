import { Navigate } from "react-router-dom";

export const identityFingerprintRoute = {
  path: "/identity-fingerprint",
  element: <Navigate to="/account-security" replace />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.identityFingerprint" },
  redirects: [{ from: "/manage/identity-fingerprint", to: "/account-security" }],
};
