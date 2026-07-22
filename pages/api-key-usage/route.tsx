import { preloadablePage } from "../preloadablePage";

const { Page: ApiKeyUsagePage, preload: preloadApiKeyUsagePage } = preloadablePage(() =>
  import("./ApiKeyUsagePage").then((m) => ({ default: m.ApiKeyUsagePage })),
);

export const apiKeyUsageRoute = {
  path: "/apikey-usage",
  element: <ApiKeyUsagePage />,
  auth: false,
  layout: "none",
  nav: null,
  preload: preloadApiKeyUsagePage,
};
