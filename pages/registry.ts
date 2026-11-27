import type { ReactElement } from "react";
import { parsePath } from "react-router-dom";
import { pendingPageLoad } from "./preloadablePage";
import { matchPageRoute, resolveLegacyLocation, type RouteRedirect } from "./routeResolution";
import { loginRoute } from "./login/route";
import { dashboardRoute } from "./dashboard/route";
import { monitorRoute } from "./monitor/route";
import { requestLogsRoute } from "./request-logs/route";
import { contentModerationRoute } from "./content-moderation/route";
import { providersRoute } from "./providers/route";
import { accountSecurityRoute } from "./account-security/route";
import { apiKeysRoute } from "./api-keys/route";
import { endUsersRoute } from "./end-users/route";
import { apiKeyPermissionsRoute } from "./api-key-permissions/route";
import { modelsRoute } from "./models/route";
import { modelPlazaRoute } from "./model-plaza/route";
import { channelGroupsRoute } from "./channel-groups/route";
import { configRoute } from "./config/route";
import { logsRoute } from "./logs/route";
import { systemRoute } from "./system/route";
import { proxiesRoute } from "./proxies/route";
import { imageGenerationRoute } from "./image-generation/route";
import { videoGenerationRoute } from "./video-generation/route";
import { ccswitchImportSettingsRoute } from "./ccswitch-import-settings/route";
import { apiKeyLookupRoute } from "./api-key-lookup/route";
import { apiKeyUsageRoute } from "./api-key-usage/route";
import { tenantsRoute } from "./tenants/route";
import { usersRoute } from "./users/route";
import { rolesRoute } from "./roles/route";
import { changePasswordRoute } from "./change-password/route";
import { auditLogsRoute } from "./audit-logs/route";
import { ipAccessRoute } from "./ip-access/route";
import { menuManagementRoute } from "./menu-management/route";
import { alertsRoute } from "./alerts/route";
import { privacyMaskingRoute } from "./privacy-masking/route";
import { billingRoute } from "./billing/route";
import { publicPayRoute } from "./billing-pay/route";
import { dataGridLabRoute } from "./data-grid-lab/route";

export interface PageRoute {
  path: string;
  element: ReactElement;
  auth: boolean;
  layout: string;
  nav: { labelKey: string } | null;
  /** 指向本页的旧地址。登录后的页面由 resolveLegacyLocation 在匹配路由前换算，不再挂成 <Navigate> 页面。 */
  redirects?: RouteRedirect[];
  hasWildcard?: boolean;
  preload?: () => Promise<unknown>;
  requiredPermission?: string;
  /** Any-of alternative permissions (OR with requiredPermission). */
  requiredAnyPermissions?: string[];
  /** Stable key for dynamic menu component binding */
  component?: string;
}

export const pageRoutes: PageRoute[] = [
  loginRoute,
  changePasswordRoute,
  tenantsRoute,
  usersRoute,
  rolesRoute,
  auditLogsRoute,
  ipAccessRoute,
  menuManagementRoute,
  alertsRoute,
  dashboardRoute,
  monitorRoute,
  requestLogsRoute,
  privacyMaskingRoute,
  contentModerationRoute,
  providersRoute,
  accountSecurityRoute,
  apiKeysRoute,
  endUsersRoute,
  apiKeyPermissionsRoute,
  billingRoute,
  modelsRoute,
  modelPlazaRoute,
  channelGroupsRoute,
  configRoute,
  logsRoute,
  systemRoute,
  proxiesRoute,
  imageGenerationRoute,
  videoGenerationRoute,
  ccswitchImportSettingsRoute,
  apiKeyLookupRoute,
  apiKeyUsageRoute,
  publicPayRoute,
  // 开发环境专用的表格演示页（计划 104），生产构建里是 null。
  ...(dataGridLabRoute ? [dataGridLabRoute] : []),
];

/** 预加载 `to` 最终落到的页面（旧地址先换算成现地址）。 */
export function preloadPageRoute(to: string): Promise<unknown> {
  const parsed = parsePath(to);
  const location = { pathname: parsed.pathname || "/", search: parsed.search || "", hash: "" };
  const target = resolveLegacyLocation(location, pageRoutes) ?? location;
  return matchPageRoute(target.pathname, pageRoutes)?.preload?.() ?? Promise.resolve();
}

/** 渲染 `pathname` 的页面代码还在加载时返回加载结束就兑现的 promise，否则 null（用法见 DashboardLayout）。 */
export function pendingPageCode(pathname: string): Promise<void> | null {
  return pendingPageLoad(matchPageRoute(pathname, pageRoutes)?.preload);
}
