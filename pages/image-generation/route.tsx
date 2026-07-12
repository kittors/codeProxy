import { preloadablePage } from "../preloadablePage";

const { Page: ImageGenerationPage, preload: preloadImageGenerationPage } = preloadablePage(() =>
  import("./ImageGenerationPage").then((m) => ({
    default: m.ImageGenerationPage,
  })),
);

export const imageGenerationRoute = {
  path: "/models/image-generation",
  component: "image-generation",
  element: <ImageGenerationPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.imageGeneration" },
  redirects: [{ from: "/image-generation", to: "/models/image-generation" }],
  requiredPermission: "system.config.read",
  preload: preloadImageGenerationPage,
};
