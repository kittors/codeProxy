import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./PrivacyMaskingPage").then((m) => ({ default: m.PrivacyMaskingPage })),
);

export const privacyMaskingRoute = {
  path: "/runtime/privacy-masking",
  component: "privacy-masking",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.privacy_masking" },
  // 后端把隐私脱敏归在内容审核的权限下：同一批人配置、查看记录
  requiredPermission: "content_moderation.read",
  preload,
};
