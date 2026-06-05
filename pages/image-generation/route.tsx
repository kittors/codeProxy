import { lazy } from "react";

const ImageGenerationPage = lazy(() =>
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
};
