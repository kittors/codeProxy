import { preloadablePage } from "../preloadablePage";

const { Page: ModelsPage, preload: preloadModelsPage } = preloadablePage(() =>
  import("./ModelsPage").then((m) => ({ default: m.ModelsPage })),
);

export const modelsRoute = {
  path: "/models/catalog",
  component: "models",
  element: <ModelsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.models" },
  redirects: [
    { from: "/models", to: "/models/catalog" },
    { from: "/manage/models", to: "/models/catalog" },
  ],
  requiredPermission: "models.read",
  preload: preloadModelsPage,
};
