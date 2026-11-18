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
    // 「认证文件」时期的地址：页面参数（?tab= 等）原样带到 AI 账号页。
    { from: "/auth-files", to: "/access/ai-accounts", keepSearch: true },
    { from: "/auth-files/oauth-excluded", to: "/access/ai-accounts?tab=excluded" },
    { from: "/auth-files/oauth-model-alias", to: "/access/ai-accounts?tab=alias" },
    // 身份指纹并进了 AI 账号页。
    { from: "/identity-fingerprint", to: "/access/ai-accounts" },
    { from: "/manage/identity-fingerprint", to: "/access/ai-accounts" },
  ],
  requiredPermission: "auth_files.read",
  preload: preloadAuthFilesPage,
};
