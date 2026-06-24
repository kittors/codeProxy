import { loginRoute } from "./login/route";
import { dashboardRoute } from "./dashboard/route";
import { monitorRoute } from "./monitor/route";
import { requestLogsRoute } from "./request-logs/route";
import { providersRoute } from "./providers/route";
import { accountSecurityRoute } from "./account-security/route";
import { authFilesRoute } from "./auth-files/route";
import { apiKeysRoute } from "./api-keys/route";
import { apiKeyPermissionsRoute } from "./api-key-permissions/route";
import { modelsRoute } from "./models/route";
import { channelGroupsRoute } from "./channel-groups/route";
import { configRoute } from "./config/route";
import { logsRoute } from "./logs/route";
import { systemRoute } from "./system/route";
import { proxiesRoute } from "./proxies/route";
import { identityFingerprintRoute } from "./identity-fingerprint/route";
import { imageGenerationRoute } from "./image-generation/route";
import { ccswitchImportSettingsRoute } from "./ccswitch-import-settings/route";
import { apiKeyLookupRoute } from "./api-key-lookup/route";

export const pageRoutes = [
  loginRoute,
  dashboardRoute,
  monitorRoute,
  requestLogsRoute,
  providersRoute,
  accountSecurityRoute,
  authFilesRoute,
  apiKeysRoute,
  apiKeyPermissionsRoute,
  modelsRoute,
  channelGroupsRoute,
  configRoute,
  logsRoute,
  systemRoute,
  proxiesRoute,
  identityFingerprintRoute,
  imageGenerationRoute,
  ccswitchImportSettingsRoute,
  apiKeyLookupRoute,
];
