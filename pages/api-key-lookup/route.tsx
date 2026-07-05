import { preloadablePage } from "../preloadablePage";

const { Page: ApiKeyLookupPage, preload: preloadApiKeyLookupPage } = preloadablePage(() =>
  import("./ApiKeyLookupPage").then((m) => ({ default: m.ApiKeyLookupPage })),
);

export const apiKeyLookupRoute = {
  path: "/apikey-lookup",
  element: <ApiKeyLookupPage />,
  auth: false,
  layout: "none",
  nav: null,
  preload: preloadApiKeyLookupPage,
};
