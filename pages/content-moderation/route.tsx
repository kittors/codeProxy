import { preloadablePage } from "../preloadablePage";

const { Page: ContentModerationPage, preload: preloadContentModerationPage } = preloadablePage(() =>
  import("./ContentModerationPage").then((module) => ({ default: module.ContentModerationPage })),
);

export const contentModerationRoute = {
  path: "/access/content-moderation",
  component: "content-moderation",
  element: <ContentModerationPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.content_moderation" },
  redirects: [
    { from: "/runtime/content-moderation", to: "/access/content-moderation" },
    { from: "/manage/runtime/content-moderation", to: "/access/content-moderation" },
  ],
  requiredPermission: "content_moderation.read",
  preload: preloadContentModerationPage,
};
