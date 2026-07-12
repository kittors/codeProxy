import { preloadablePage } from "../preloadablePage";

const { Page: AuthFilesPage, preload: preloadAuthFilesPage } = preloadablePage(() =>
  import("../auth-files/AuthFilesPage").then((m) => ({ default: m.AuthFilesPage })),
);

export const accountSecurityRoute = {
  path: "/system/account-security",
  component: "account-security",
  element: <AuthFilesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.accountSecurity" },
  redirects: [
    { from: "/account-security", to: "/system/account-security" },
    { from: "/auth-files/oauth-excluded", to: "/system/account-security?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/system/account-security?tab=alias" },
    { from: "/manage/identity-fingerprint", to: "/system/account-security" },
  ],
  requiredPermission: "auth_files.read",
  preload: preloadAuthFilesPage,
};
