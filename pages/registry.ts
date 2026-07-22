import type { ReactElement } from "react";
import { loginRoute } from "./login/route";
import { dashboardRoute } from "./dashboard/route";
import { monitorRoute } from "./monitor/route";
import { requestLogsRoute } from "./request-logs/route";
import { contentModerationRoute } from "./content-moderation/route";
import { providersRoute } from "./providers/route";
import { accountSecurityRoute } from "./account-security/route";
import { authFilesRoute } from "./auth-files/route";
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
import { identityFingerprintRoute } from "./identity-fingerprint/route";
import { imageGenerationRoute } from "./image-generation/route";
import { ccswitchImportSettingsRoute } from "./ccswitch-import-settings/route";
import { apiKeyLookupRoute } from "./api-key-lookup/route";
import { apiKeyUsageRoute } from "./api-key-usage/route";
import { tenantsRoute } from "./tenants/route";
import { usersRoute } from "./users/route";
import { rolesRoute } from "./roles/route";
import { changePasswordRoute } from "./change-password/route";
import { auditLogsRoute } from "./audit-logs/route";
import { menuManagementRoute } from "./menu-management/route";

export interface PageRoute {
  path: string;
  element: ReactElement;
  auth: boolean;
  layout: string;
  nav: { labelKey: string } | null;
  redirects?: Array<{ from: string; to: string }>;
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
  menuManagementRoute,
  dashboardRoute,
  monitorRoute,
  requestLogsRoute,
  contentModerationRoute,
  providersRoute,
  accountSecurityRoute,
  authFilesRoute,
  apiKeysRoute,
  endUsersRoute,
  apiKeyPermissionsRoute,
  modelsRoute,
  modelPlazaRoute,
  channelGroupsRoute,
  configRoute,
  logsRoute,
  systemRoute,
  proxiesRoute,
  identityFingerprintRoute,
  imageGenerationRoute,
  ccswitchImportSettingsRoute,
  apiKeyLookupRoute,
  apiKeyUsageRoute,
];

const normalizePathname = (to: string) => to.split(/[?#]/, 1)[0] || "/";

const matchesPath = (pathname: string, routePath: string) =>
  pathname === routePath || pathname.startsWith(`${routePath}/`);

export function preloadPageRoute(to: string): Promise<unknown> {
  const pathname = normalizePathname(to);
  let matchedRoute: PageRoute | null = null;
  let matchedLength = -1;

  for (const route of pageRoutes) {
    const paths = [route.path, ...(route.redirects ?? []).map((redirect) => redirect.from)];
    for (const path of paths) {
      if (!matchesPath(pathname, path) || path.length <= matchedLength) continue;
      matchedRoute = route;
      matchedLength = path.length;
    }
  }

  return matchedRoute?.preload?.() ?? Promise.resolve();
}
