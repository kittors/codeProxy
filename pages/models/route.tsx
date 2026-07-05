import { preloadablePage } from "../preloadablePage";

const { Page: ModelsPage, preload: preloadModelsPage } = preloadablePage(() =>
  import("./ModelsPage").then((m) => ({ default: m.ModelsPage })),
);

export const modelsRoute = {
  path: "/models",
  element: <ModelsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.models" },
  redirects: [{ from: "/manage/models", to: "/models" }],
  preload: preloadModelsPage,
};
