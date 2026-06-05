import { lazy } from "react";

const IdentityFingerprintPage = lazy(() =>
  import("./IdentityFingerprintPage").then((m) => ({
    default: m.IdentityFingerprintPage,
  })),
);

export const identityFingerprintRoute = {
  path: "/identity-fingerprint",
  element: <IdentityFingerprintPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.identityFingerprint" },
  redirects: [{ from: "/manage/identity-fingerprint", to: "/identity-fingerprint" }],
};
