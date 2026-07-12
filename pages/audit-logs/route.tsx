import { preloadablePage } from "../preloadablePage";
const { Page, preload } = preloadablePage(() =>
  import("./AuditLogsPage").then((m) => ({ default: m.AuditLogsPage })),
);
export const auditLogsRoute = {
  path: "/governance/audit-logs",
  component: "audit-logs",
  element: <Page />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.auditLogs" },
  redirects: [{ from: "/audit-logs", to: "/governance/audit-logs" }],
  requiredPermission: "tenant.audit.read",
  preload,
};
