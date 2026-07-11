import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./AuditLogsPage").then((m) => ({ default: m.AuditLogsPage })),
);
export const auditLogsRoute = {
  path: "/audit-logs",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.auditLogs" },
  requiredPermission: "tenant.audit.read",
  preload,
};
