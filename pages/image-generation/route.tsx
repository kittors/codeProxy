import { preloadablePage } from "../preloadablePage";

const { Page: ImageGenerationPage, preload: preloadImageGenerationPage } = preloadablePage(() =>
  import("./ImageGenerationPage").then((m) => ({
    default: m.ImageGenerationPage,
  })),
);

export const imageGenerationRoute = {
  path: "/image-generation",
  element: <ImageGenerationPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.imageGeneration" },
  preload: preloadImageGenerationPage,
};
