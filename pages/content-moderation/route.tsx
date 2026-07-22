import { preloadablePage } from "../preloadablePage";

const { Page: ContentModerationPage, preload: preloadContentModerationPage } = preloadablePage(() =>
  import("./ContentModerationPage").then((module) => ({ default: module.ContentModerationPage })),
);

export const contentModerationRoute = {
  path: "/runtime/content-moderation",
  component: "content-moderation",
  element: <ContentModerationPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.content_moderation" },
  requiredPermission: "content_moderation.read",
  preload: preloadContentModerationPage,
};
