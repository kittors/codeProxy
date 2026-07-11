import { preloadablePage } from "../preloadablePage";

const { Page: AuthFilesPage, preload: preloadAuthFilesPage } = preloadablePage(() =>
  import("../auth-files/AuthFilesPage").then((m) => ({ default: m.AuthFilesPage })),
);

export const accountSecurityRoute = {
  path: "/account-security",
  element: <AuthFilesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.accountSecurity" },
  redirects: [
    { from: "/auth-files/oauth-excluded", to: "/account-security?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/account-security?tab=alias" },
    { from: "/manage/identity-fingerprint", to: "/account-security" },
  ],
  requiredPermission: "auth_files.read",
  preload: preloadAuthFilesPage,
};
