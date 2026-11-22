import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./BillingPage").then((m) => ({ default: m.BillingPage })),
);

export const billingRoute = {
  path: "/access/billing",
  component: "billing",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "shell.nav_billing" },
  requiredPermission: "tenant_settings.read",
  preload,
};
