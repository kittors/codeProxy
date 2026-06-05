import { lazy } from "react";

const ApiKeyLookupPage = lazy(() =>
  import("./ApiKeyLookupPage").then((m) => ({ default: m.ApiKeyLookupPage })),
);

export const apiKeyLookupRoute = {
  path: "/apikey-lookup",
  element: <ApiKeyLookupPage />,
  auth: false,
  layout: "none",
  nav: null,
};
