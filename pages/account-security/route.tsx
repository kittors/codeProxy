import { preloadablePage } from "../preloadablePage";

const { Page: AuthFilesPage, preload: preloadAuthFilesPage } = preloadablePage(() =>
  import("../auth-files/AuthFilesPage").then((m) => ({ default: m.AuthFilesPage })),
);

export const accountSecurityRoute = {
  path: "/access/ai-accounts",
  component: "account-security",
  element: <AuthFilesPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.accountSecurity" },
  redirects: [
    { from: "/account-security", to: "/access/ai-accounts" },
    { from: "/system/account-security", to: "/access/ai-accounts" },
    { from: "/auth-files/oauth-excluded", to: "/access/ai-accounts?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/access/ai-accounts?tab=alias" },
    { from: "/manage/identity-fingerprint", to: "/access/ai-accounts" },
  ],
  requiredPermission: "auth_files.read",
  preload: preloadAuthFilesPage,
};
