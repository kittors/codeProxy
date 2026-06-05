import { lazy } from "react";

const ModelsPage = lazy(() => import("./ModelsPage").then((m) => ({ default: m.ModelsPage })));

export const modelsRoute = {
  path: "/models",
  element: <ModelsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.models" },
  redirects: [{ from: "/manage/models", to: "/models" }],
};
