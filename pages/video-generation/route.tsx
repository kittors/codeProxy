import { preloadablePage } from "../preloadablePage";

const { Page: VideoGenerationPage, preload: preloadVideoGenerationPage } = preloadablePage(() =>
  import("./VideoGenerationPage").then((m) => ({
    default: m.VideoGenerationPage,
  })),
);

export const videoGenerationRoute = {
  path: "/models/video-generation",
  component: "video-generation",
  element: <VideoGenerationPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.videoGeneration" },
  requiredPermission: "system.config.read",
  preload: preloadVideoGenerationPage,
};
