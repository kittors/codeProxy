import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./IpAccessPage").then((m) => ({ default: m.IpAccessPage })),
);

export const ipAccessRoute = {
  path: "/governance/ip-access",
  component: "ip-access",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.ipAccess" },
  requiredPermission: "platform.ip_access.read",
  preload,
};
