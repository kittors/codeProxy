import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  apiClient,
  AUTH_ACCOUNTS_CHANGED_EVENT,
  AUTH_ACCOUNTS_STORAGE_KEY,
  buildAccountKey,
  clearPersistedAuthSnapshot,
  computeManagementApiBase,
  detectApiBaseFromLocation,
  getSavedAuthAccount,
  identityApi,
  IDENTITY_MENUS_UPDATED_EVENT,
  extractApiErrorCode,
  isApiClientError,
  configApi,
  listSavedAuthAccounts,
  normalizeApiBase,
  readPersistedAuthSnapshot,
  removeSavedAuthAccount,
  updatePersistedEffectiveTenantId,
  upsertSavedAuthAccount,
  writePersistedAuthSnapshot,
  type ManagementPrincipal,
  type MenuIdentity,
  type SavedAuthAccount,
} from "@code-proxy/api-client";
import {
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheScopePrefix,
  setActiveCacheTenantId,
  setCacheScopeResolver,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import { invalidateConfiguredModelAvailability } from "@features/model-availability";

interface AuthContextState {
  state: {
    isAuthenticated: boolean;
    isRestoring: boolean;
    apiBase: string;
    managementKey: string;
    rememberPassword: boolean;
    serverVersion: string | null;
    serverBuildDate: string | null;
    principal: ManagementPrincipal | null;
    authFailureCode: string;
    permissions: ReadonlySet<string>;
    savedAccounts: SavedAuthAccount[];
  };
  actions: {
    login: (input: {
      apiBase: string;
      username: string;
      password: string;
      rememberPassword: boolean;
    }) => Promise<ManagementPrincipal>;
    logout: () => void;
    restore: () => Promise<void>;
    switchTenant: (tenantId: string) => Promise<void>;
    /** Soft-switch: keep current session in vault, go to login to add another. */
    beginAddAccount: () => void;
    /** @returns true when the target session is active after switch. Accepts accountKey or legacy id. */
    switchAccount: (accountKeyOrId: string) => Promise<boolean>;
    removeSavedAccount: (accountKeyOrId: string) => void;
  };
  meta: { managementEndpoint: string };
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextState | null>(null);

const isLocalPreviewMode = () =>
  import.meta.env.DEV &&
  ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).get("preview") === "1";

/** Empty string means home tenant (no X-Effective-Tenant-ID header). */
const normalizeTenantOverride = (tenantId: string | undefined | null): string =>
  typeof tenantId === "string" ? tenantId.trim() : "";

/**
 * Persist the platform-admin tenant override alongside the auth snapshot so
 * refresh / keep-alive restore reuses the same X-Effective-Tenant-ID without a
 * home-tenant flash. Home tenant is stored as an empty override.
 */
const persistEffectiveTenantOverride = (tenantId: string): void => {
  updatePersistedEffectiveTenantId(normalizeTenantOverride(tenantId));
};

const cacheScopePrefix = (apiBase: string, accountId?: string | null): string => {
  const base = normalizeApiBase(apiBase);
  const id = typeof accountId === "string" ? accountId.trim() : "";
  if (!base) return "";
  return id ? `${base}::${id}` : base;
};

/**
 * Pin the browser data-cache tenant to the effective management tenant.
 * Data caches (providers, auth-files, pricing, proxy checks, lookup charts)
 * all read getActiveCacheTenantId() so they never reuse another tenant's payload.
 * Scope prefix (apiBase+account) prevents collisions across hosts/accounts.
 */
const syncActiveDataCacheTenant = (
  tenantId?: string | null,
  scope?: { apiBase?: string; accountId?: string | null },
): void => {
  if (scope) {
    setActiveCacheScopePrefix(cacheScopePrefix(scope.apiBase ?? "", scope.accountId));
  }
  setActiveCacheTenantId(tenantId ?? DEFAULT_CACHE_TENANT_ID);
  // Hard-invalidate process-global availability so in-flight promises cannot leak.
  invalidateConfiguredModelAvailability();
};

/** Mirrors CliRelay MenuCatalog so management-key / preview mode has a usable sidebar. */
const menu = (
  partial: Pick<
    MenuIdentity,
    "code" | "type" | "path" | "component" | "label_key" | "icon" | "sort_order"
  > &
    Partial<Pick<MenuIdentity, "parent_code" | "permission_code">>,
): MenuIdentity => ({
  code: partial.code,
  parent_code: partial.parent_code ?? "",
  type: partial.type,
  path: partial.path,
  component: partial.component,
  link_url: "",
  label_key: partial.label_key,
  title: "",
  icon: partial.icon,
  permission_code: partial.permission_code ?? "",
  sort_order: partial.sort_order,
  visible: true,
  enabled: true,
  badge_type: "",
  badge_content: "",
  hide_menu: false,
  system_protected: true,
  version: 1,
});

const LEGACY_SERVICE_MENUS: MenuIdentity[] = [
  menu({
    code: "dashboard",
    type: "menu",
    path: "/dashboard",
    component: "dashboard",
    label_key: "shell.nav_dashboard",
    icon: "layout-dashboard",
    permission_code: "dashboard.read",
    sort_order: 10,
  }),
  menu({
    code: "group.runtime",
    type: "directory",
    path: "/runtime",
    component: "Layout",
    label_key: "shell.nav_group_runtime",
    icon: "activity",
    sort_order: 20,
  }),
  menu({
    code: "runtime.monitor",
    parent_code: "group.runtime",
    type: "menu",
    path: "/runtime/monitor",
    component: "monitor",
    label_key: "shell.nav_monitor",
    icon: "activity",
    permission_code: "monitor.read",
    sort_order: 10,
  }),
  menu({
    code: "runtime.request-logs",
    parent_code: "group.runtime",
    type: "menu",
    path: "/runtime/request-logs",
    component: "request-logs",
    label_key: "shell.nav_request_logs",
    icon: "scroll-text",
    permission_code: "request_logs.read",
    sort_order: 20,
  }),
  menu({
    code: "runtime.logs",
    parent_code: "group.runtime",
    type: "menu",
    path: "/runtime/logs",
    component: "logs",
    label_key: "shell.nav_logs",
    icon: "file-text",
    permission_code: "system.logs.read",
    sort_order: 30,
  }),
  // Top-level leaf pinned after all groups (matches CliRelay MenuCatalog).
  menu({
    code: "runtime.system",
    type: "menu",
    path: "/runtime/system",
    component: "system",
    label_key: "shell.nav_system",
    icon: "info",
    permission_code: "system.status.read",
    sort_order: 70,
  }),
  menu({
    code: "group.access",
    type: "directory",
    path: "/access",
    component: "Layout",
    label_key: "shell.nav_group_access",
    icon: "bot",
    sort_order: 30,
  }),
  menu({
    code: "access.providers",
    parent_code: "group.access",
    type: "menu",
    path: "/access/ai-providers",
    component: "providers",
    label_key: "shell.nav_ai_providers",
    icon: "bot",
    permission_code: "providers.read",
    sort_order: 10,
  }),
  menu({
    code: "system.account-security",
    parent_code: "group.access",
    type: "menu",
    path: "/access/ai-accounts",
    component: "account-security",
    label_key: "shell.nav_ai_accounts",
    icon: "key-round",
    permission_code: "auth_files.read",
    sort_order: 20,
  }),
  // Hidden from sidebar: key management is under 用户账号 (?endUserId=). Route kept for deep links.
  {
    ...menu({
      code: "access.api-keys",
      parent_code: "group.access",
      type: "menu",
      path: "/access/api-keys",
      component: "api-keys",
      label_key: "shell.nav_api_keys",
      icon: "sparkles",
      permission_code: "api_keys.read",
      sort_order: 30,
    }),
    hide_menu: true,
  },
  menu({
    code: "access.end-users",
    parent_code: "group.access",
    type: "menu",
    path: "/access/end-users",
    component: "end-users",
    // Prefer end_users.read; legacy key admins also get the menu via api_keys.read in can() OR at route gate.
    label_key: "shell.nav_end_users",
    icon: "user-round",
    permission_code: "end_users.read",
    sort_order: 25,
  }),
  menu({
    code: "system.api-key-permissions",
    parent_code: "group.access",
    type: "menu",
    path: "/access/api-key-permissions",
    component: "api-key-permissions",
    label_key: "shell.nav_api_key_permissions",
    icon: "shield-check",
    permission_code: "api_key_profiles.read",
    sort_order: 40,
  }),
  menu({
    code: "access.ccswitch",
    parent_code: "group.access",
    type: "menu",
    path: "/access/ccswitch-import-settings",
    component: "ccswitch-import-settings",
    label_key: "shell.nav_ccswitch_import_settings",
    icon: "arrow-down-to-line",
    // Tenant-scoped: matches /ccswitch-import-configs API auth (routing.read/write).
    // Must not use platform system.config.read, or ordinary tenants never see this menu.
    permission_code: "routing.read",
    sort_order: 50,
  }),
  menu({
    code: "group.models",
    type: "directory",
    path: "/models",
    component: "Layout",
    label_key: "shell.nav_group_models",
    icon: "layers",
    sort_order: 40,
  }),
  menu({
    code: "models.plaza",
    parent_code: "group.models",
    type: "menu",
    path: "/models/plaza",
    component: "model-plaza",
    label_key: "shell.nav_model_plaza",
    icon: "store",
    // Same surface as former System Info "available models": tenant-visible model set.
    permission_code: "system.status.read",
    sort_order: 5,
  }),
  menu({
    code: "models.catalog",
    parent_code: "group.models",
    type: "menu",
    path: "/models/catalog",
    component: "models",
    label_key: "shell.nav_models",
    icon: "cpu",
    permission_code: "models.read",
    sort_order: 10,
  }),
  menu({
    code: "models.image-generation",
    parent_code: "group.models",
    type: "menu",
    path: "/models/image-generation",
    component: "image-generation",
    label_key: "shell.nav_image_generation",
    icon: "image",
    permission_code: "system.config.read",
    sort_order: 20,
  }),
  menu({
    code: "models.channel-groups",
    parent_code: "group.models",
    type: "menu",
    path: "/models/channel-groups",
    component: "channel-groups",
    label_key: "shell.nav_channel_groups",
    icon: "layers",
    permission_code: "routing.read",
    sort_order: 30,
  }),
  menu({
    code: "models.proxies",
    parent_code: "group.models",
    type: "menu",
    path: "/models/proxies",
    component: "proxies",
    label_key: "shell.nav_proxies",
    icon: "network",
    permission_code: "proxies.read",
    sort_order: 40,
  }),
  menu({
    code: "group.governance",
    type: "directory",
    path: "/governance",
    component: "Layout",
    label_key: "shell.nav_group_governance",
    icon: "users-round",
    sort_order: 50,
  }),
  menu({
    code: "governance.tenants",
    parent_code: "group.governance",
    type: "menu",
    path: "/governance/tenants",
    component: "tenants",
    label_key: "shell.nav_tenants",
    icon: "building-2",
    permission_code: "platform.tenants.read",
    sort_order: 10,
  }),
  menu({
    code: "governance.users",
    parent_code: "group.governance",
    type: "menu",
    path: "/governance/users",
    component: "users",
    label_key: "shell.nav_users",
    icon: "user-round",
    permission_code: "tenant.users.read",
    sort_order: 20,
  }),
  menu({
    code: "governance.roles",
    parent_code: "group.governance",
    type: "menu",
    path: "/governance/roles",
    component: "roles",
    label_key: "shell.nav_roles",
    icon: "shield-check",
    permission_code: "tenant.roles.read",
    sort_order: 30,
  }),
  menu({
    code: "governance.audit",
    parent_code: "group.governance",
    type: "menu",
    path: "/governance/audit-logs",
    component: "audit-logs",
    label_key: "shell.nav_audit_logs",
    icon: "file-text",
    permission_code: "tenant.audit.read",
    sort_order: 40,
  }),
  menu({
    code: "group.system",
    type: "directory",
    path: "/system",
    component: "Layout",
    label_key: "shell.nav_group_system",
    icon: "settings",
    sort_order: 60,
  }),
  menu({
    code: "system.config",
    parent_code: "group.system",
    type: "menu",
    path: "/system/config",
    component: "config",
    label_key: "shell.nav_config",
    icon: "settings",
    permission_code: "system.config.read",
    sort_order: 10,
  }),
  menu({
    code: "system.menus",
    parent_code: "group.system",
    type: "menu",
    path: "/system/menu-management",
    component: "menu-management",
    label_key: "shell.nav_menu_management",
    icon: "menu",
    permission_code: "platform.menus.read",
    sort_order: 20,
  }),
];

/** Override is only dropped when the server explicitly rejects the tenant scope. */
const RECOVERABLE_TENANT_OVERRIDE_CODES = new Set([
  "tenant_scope_forbidden",
  "tenant_suspended",
  "tenant_expired",
  "not_found",
]);

export function isRecoverableTenantOverrideError(error: unknown): boolean {
  if (!isApiClientError(error)) return false;
  // Network/timeout leave status 0; 5xx is transient server failure.
  if (isTransientRestoreError(error)) return false;
  const code = extractApiErrorCode(error.payload);
  if (code && RECOVERABLE_TENANT_OVERRIDE_CODES.has(code)) return true;
  // 404 without a known code still means the override target is gone.
  return error.status === 404;
}

/** Transient failures must keep the persisted override for the next retry/refresh. */
export function isTransientRestoreError(error: unknown): boolean {
  if (!isApiClientError(error)) {
    // Non-API errors (TypeError from fetch, etc.) are treated as transient.
    return error instanceof Error;
  }
  if (error.isTimeout || error.status === 0 || error.status >= 500) return true;
  return false;
}

const legacyServicePrincipal = (): ManagementPrincipal => ({
  kind: "service_credential",
  user: {
    id: "service",
    tenant_id: "system",
    username: "admin",
    display_name: "Administrator",
    status: "active",
    must_change_password: false,
    last_login_at: null,
    role_ids: [],
    role_codes: [],
    version: 1,
    created_at: "",
    updated_at: "",
  },
  home_tenant: {
    id: "system",
    slug: "system",
    name: "System Administration",
    type: "system",
    status: "active",
    effective_status: "active",
    expires_at: null,
    description: "",
    version: 1,
    created_at: "",
    updated_at: "",
  },
  effective_tenant: {
    id: "system",
    slug: "system",
    name: "System Administration",
    type: "system",
    status: "active",
    effective_status: "active",
    expires_at: null,
    description: "",
    version: 1,
    created_at: "",
    updated_at: "",
  },
  roles: [],
  menus: LEGACY_SERVICE_MENUS,
  permissions: ["*"],
  platform_admin: true,
});

const accountMetaFromPrincipal = (apiBase: string, principal: ManagementPrincipal) => {
  const accountId = principal.user.id;
  return {
    accountId,
    accountKey: buildAccountKey(apiBase, accountId),
    username: principal.user.username,
    displayName: principal.user.display_name || principal.user.username,
  };
};

const parseExpiryMs = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};

const persistSession = (input: {
  apiBase: string;
  managementKey: string;
  refreshToken?: string;
  rememberPassword: boolean;
  effectiveTenantId?: string;
  principal?: ManagementPrincipal | null;
  expiresAtMs?: number;
  refreshExpiresAtMs?: number;
}) => {
  const meta = input.principal ? accountMetaFromPrincipal(input.apiBase, input.principal) : {};
  const expiry = {
    ...(input.expiresAtMs ? { expiresAtMs: input.expiresAtMs } : {}),
    ...(input.refreshExpiresAtMs ? { refreshExpiresAtMs: input.refreshExpiresAtMs } : {}),
  };
  writePersistedAuthSnapshot({
    apiBase: input.apiBase,
    managementKey: input.managementKey,
    ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
    rememberPassword: input.rememberPassword,
    effectiveTenantId: input.effectiveTenantId,
    ...meta,
    ...expiry,
  });
  // writePersistedAuthSnapshot already upserts vault when accountKey is present.
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [apiBase, setApiBase] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [serverBuildDate, setServerBuildDate] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<ManagementPrincipal | null>(null);
  const [authFailureCode, setAuthFailureCode] = useState("");
  const [savedAccounts, setSavedAccounts] = useState<SavedAuthAccount[]>(() =>
    listSavedAuthAccounts(),
  );
  // Monotonic op id so a slower bootstrap cannot overwrite a newer login/switch.
  const bootstrapOpRef = useRef(0);

  const refreshSavedAccounts = useCallback(() => {
    setSavedAccounts(listSavedAuthAccounts());
  }, []);

  const configureClient = useCallback(
    (
      base: string,
      token: string,
      effectiveTenant = "",
      /** undefined keeps current refresh; string/null replaces it */
      nextRefresh?: string | null,
    ) => {
      apiClient.setConfig({
        apiBase: base,
        managementKey: token,
        ...(nextRefresh !== undefined ? { refreshToken: nextRefresh ?? "" } : {}),
      });
      const tenantId = normalizeTenantOverride(effectiveTenant);
      // Always replace headers so a previous tenant override cannot leak into home-tenant mode.
      apiClient.setDefaultHeaders(tenantId ? { "X-Effective-Tenant-ID": tenantId } : {});
    },
    [],
  );

  // Prefer live principal.effective_tenant for cache keys; fall back to last explicit pin.
  useEffect(() => {
    setCacheTenantResolver(() => principal?.effective_tenant?.id ?? null);
    setCacheScopeResolver(() =>
      principal ? cacheScopePrefix(apiBase, principal.user.id) : cacheScopePrefix(apiBase),
    );
    if (principal?.effective_tenant?.id) {
      setActiveCacheTenantId(principal.effective_tenant.id);
      setActiveCacheScopePrefix(cacheScopePrefix(apiBase, principal.user.id));
    }
    return () => {
      setCacheTenantResolver(null);
      setCacheScopeResolver(null);
    };
  }, [apiBase, principal, principal?.effective_tenant?.id, principal?.user.id]);

  const bootstrap = useCallback(async (): Promise<boolean> => {
    const op = ++bootstrapOpRef.current;
    const isCurrent = () => bootstrapOpRef.current === op;
    const fallbackBase = detectApiBaseFromLocation();
    const snapshot = readPersistedAuthSnapshot();
    const resolvedBase = snapshot?.apiBase ?? fallbackBase;
    const resolvedToken = snapshot?.managementKey ?? "";
    const resolvedRemember = snapshot?.rememberPassword ?? false;
    // Restore the last platform-admin tenant override on the first /me call so
    // refresh does not briefly render home tenant then jump to the override.
    const requestedTenant = normalizeTenantOverride(snapshot?.effectiveTenantId);

    setApiBase(resolvedBase);
    setAccessToken(resolvedToken);
    setRefreshToken(snapshot?.refreshToken ?? "");
    setRememberPassword(resolvedRemember);
    configureClient(resolvedBase, resolvedToken, requestedTenant, snapshot?.refreshToken ?? "");
    // Pin cache tenant before any page paints from localStorage/sessionStorage.
    syncActiveDataCacheTenant(requestedTenant || DEFAULT_CACHE_TENANT_ID, {
      apiBase: resolvedBase,
      accountId: snapshot?.accountId,
    });

    if (!resolvedToken) {
      if (!isCurrent()) return false;
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase: resolvedBase });
      setIsRestoring(false);
      return false;
    }
    if (isLocalPreviewMode()) {
      if (!isCurrent()) return false;
      const preview = legacyServicePrincipal();
      setPrincipal(preview);
      syncActiveDataCacheTenant(preview.effective_tenant.id, {
        apiBase: resolvedBase,
        accountId: preview.user.id,
      });
      setIsAuthenticated(true);
      setIsRestoring(false);
      return true;
    }

    try {
      if (!resolvedToken.startsWith("cps_")) {
        await configApi.getConfig();
        if (!isCurrent()) return false;
        const legacy = legacyServicePrincipal();
        setPrincipal(legacy);
        syncActiveDataCacheTenant(legacy.effective_tenant.id, {
          apiBase: resolvedBase,
          accountId: legacy.user.id,
        });
        setIsAuthenticated(true);
        return true;
      }
      let restoredPrincipal: ManagementPrincipal;
      try {
        restoredPrincipal = (await identityApi.me()).principal;
      } catch (overrideError) {
        // Only drop a persisted override when the server says it is invalid.
        // Transient network/timeout/5xx must keep the override and surface as
        // restore failure instead of silently switching the user home.
        if (!requestedTenant || !isRecoverableTenantOverrideError(overrideError)) {
          throw overrideError;
        }
        // Keep refresh token while clearing tenant override.
        configureClient(resolvedBase, resolvedToken, "", snapshot?.refreshToken);
        syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
        restoredPrincipal = (await identityApi.me()).principal;
      }
      if (!isCurrent()) return false;
      // If the server ignored or could not apply the override, drop the stale value.
      if (requestedTenant && restoredPrincipal.effective_tenant.id !== requestedTenant) {
        configureClient(resolvedBase, resolvedToken, "", snapshot?.refreshToken);
        if (restoredPrincipal.effective_tenant.id !== restoredPrincipal.home_tenant.id) {
          restoredPrincipal = (await identityApi.me()).principal;
          if (!isCurrent()) return false;
        }
      }
      // Sync storage to what the server accepted so refresh keeps the same tenant.
      const confirmedOverride =
        restoredPrincipal.effective_tenant.id === restoredPrincipal.home_tenant.id
          ? ""
          : restoredPrincipal.effective_tenant.id;
      if (confirmedOverride !== requestedTenant) {
        configureClient(resolvedBase, resolvedToken, confirmedOverride, snapshot?.refreshToken);
      }
      persistEffectiveTenantOverride(confirmedOverride);
      setPrincipal(restoredPrincipal);
      syncActiveDataCacheTenant(restoredPrincipal.effective_tenant.id, {
        apiBase: resolvedBase,
        accountId: restoredPrincipal.user.id,
      });
      setIsAuthenticated(true);
      setAuthFailureCode("");
      persistSession({
        apiBase: resolvedBase,
        managementKey: resolvedToken,
        refreshToken: snapshot?.refreshToken,
        rememberPassword: resolvedRemember,
        effectiveTenantId: confirmedOverride || undefined,
        principal: restoredPrincipal,
        expiresAtMs: snapshot?.expiresAtMs,
        refreshExpiresAtMs: snapshot?.refreshExpiresAtMs,
      });
      refreshSavedAccounts();
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase: resolvedBase });
      setAuthFailureCode(isApiClientError(error) ? extractApiErrorCode(error.payload) : "");
      // Transient restore failures keep the snapshot (including tenant override)
      // so a refresh can retry the same context instead of wiping it.
      if (!isTransientRestoreError(error)) {
        const staleKey = snapshot?.accountKey || snapshot?.accountId;
        clearPersistedAuthSnapshot();
        if (staleKey) removeSavedAuthAccount(staleKey);
        refreshSavedAccounts();
      }
      return false;
    } finally {
      if (isCurrent()) setIsRestoring(false);
    }
  }, [configureClient, refreshSavedAccounts]);

  useEffect(() => void bootstrap(), [bootstrap]);

  useEffect(() => {
    const refreshMenus = () => void bootstrap();
    window.addEventListener(IDENTITY_MENUS_UPDATED_EVENT, refreshMenus);
    return () => window.removeEventListener(IDENTITY_MENUS_UPDATED_EVENT, refreshMenus);
  }, [bootstrap]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      if (isLocalPreviewMode()) return;
      const detail = (event as CustomEvent<{ code?: string; authGeneration?: number }>).detail;
      // Ignore 401/403 from a request that started before the latest setConfig.
      if (
        typeof detail?.authGeneration === "number" &&
        detail.authGeneration !== apiClient.getAuthGeneration()
      ) {
        return;
      }
      const code = detail?.code?.trim() ?? "";
      setAuthFailureCode(code);
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase });
      const snap = readPersistedAuthSnapshot();
      const staleKey = snap?.accountKey || snap?.accountId;
      clearPersistedAuthSnapshot();
      if (staleKey) removeSavedAuthAccount(staleKey);
      setSavedAccounts(listSavedAuthAccounts());
    };
    const handleVersion = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: string; buildDate?: string }>).detail;
      setServerVersion(detail?.version ?? null);
      setServerBuildDate(detail?.buildDate ?? null);
    };
    const handleTokenRefreshed = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          accessToken?: string;
          refreshToken?: string;
          authGeneration?: number;
        }>
      ).detail;
      if (
        typeof detail?.authGeneration === "number" &&
        detail.authGeneration !== apiClient.getAuthGeneration()
      ) {
        return;
      }
      if (detail?.accessToken) setAccessToken(detail.accessToken);
      if (detail?.refreshToken) setRefreshToken(detail.refreshToken);
    };
    const handleAccountsChanged = () => setSavedAccounts(listSavedAuthAccounts());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_ACCOUNTS_STORAGE_KEY || event.key === null) {
        setSavedAccounts(listSavedAuthAccounts());
      }
    };
    window.addEventListener("unauthorized", handleUnauthorized);
    window.addEventListener("server-version-update", handleVersion as EventListener);
    window.addEventListener("auth-token-refreshed", handleTokenRefreshed as EventListener);
    window.addEventListener(AUTH_ACCOUNTS_CHANGED_EVENT, handleAccountsChanged);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("unauthorized", handleUnauthorized);
      window.removeEventListener("server-version-update", handleVersion as EventListener);
      window.removeEventListener("auth-token-refreshed", handleTokenRefreshed as EventListener);
      window.removeEventListener(AUTH_ACCOUNTS_CHANGED_EVENT, handleAccountsChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, [accessToken, apiBase, bootstrap, configureClient, principal, refreshToken]);

  const login = useCallback(
    async (input: {
      apiBase: string;
      username: string;
      password: string;
      rememberPassword: boolean;
    }) => {
      const normalizedBase = normalizeApiBase(input.apiBase);
      // Login always starts on the home tenant; do not carry a previous override.
      configureClient(normalizedBase, "", "");
      const response = await identityApi.login({
        username: input.username.trim(),
        password: input.password,
        remember_me: input.rememberPassword,
      });
      configureClient(normalizedBase, response.access_token, "", response.refresh_token ?? "");
      setApiBase(normalizedBase);
      setAccessToken(response.access_token);
      setRefreshToken(response.refresh_token ?? "");
      setRememberPassword(input.rememberPassword);
      setPrincipal(response.principal);
      syncActiveDataCacheTenant(response.principal.effective_tenant.id, {
        apiBase: normalizedBase,
        accountId: response.principal.user.id,
      });
      setAuthFailureCode("");
      setIsAuthenticated(true);
      // Explicit empty override so a leftover legacy key cannot re-apply.
      persistSession({
        apiBase: normalizedBase,
        managementKey: response.access_token,
        refreshToken: response.refresh_token,
        rememberPassword: input.rememberPassword,
        effectiveTenantId: undefined,
        principal: response.principal,
        expiresAtMs: parseExpiryMs(response.expires_at),
        refreshExpiresAtMs: parseExpiryMs(response.refresh_expires_at),
      });
      refreshSavedAccounts();
      return response.principal;
    },
    [configureClient, refreshSavedAccounts],
  );

  const logout = useCallback(() => {
    const accountKey = principal
      ? buildAccountKey(apiBase, principal.user.id)
      : readPersistedAuthSnapshot()?.accountKey;
    void identityApi.logout().catch(() => undefined);
    setIsAuthenticated(false);
    setAccessToken("");
    setRefreshToken("");
    setPrincipal(null);
    setAuthFailureCode("");
    configureClient(apiBase, "", "", "");
    syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase });
    clearPersistedAuthSnapshot();
    if (accountKey) removeSavedAuthAccount(accountKey);
    refreshSavedAccounts();
  }, [apiBase, configureClient, principal, refreshSavedAccounts]);

  const beginAddAccount = useCallback(() => {
    // Soft logout: keep vault entry so user can switch back after adding another account.
    if (principal && accessToken) {
      const override =
        principal.effective_tenant.id === principal.home_tenant.id
          ? undefined
          : principal.effective_tenant.id;
      const meta = accountMetaFromPrincipal(apiBase, principal);
      upsertSavedAuthAccount({
        apiBase,
        managementKey: accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        rememberPassword,
        effectiveTenantId: override,
        ...meta,
        lastUsedAt: Date.now(),
      });
      refreshSavedAccounts();
    }
    setIsAuthenticated(false);
    setAccessToken("");
    setRefreshToken("");
    setPrincipal(null);
    setAuthFailureCode("");
    configureClient(apiBase, "", "", "");
    syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase });
    clearPersistedAuthSnapshot();
  }, [
    accessToken,
    apiBase,
    configureClient,
    principal,
    refreshSavedAccounts,
    refreshToken,
    rememberPassword,
  ]);

  const switchAccount = useCallback(
    async (accountKeyOrId: string): Promise<boolean> => {
      const target = getSavedAuthAccount(accountKeyOrId);
      if (!target) return false;
      const currentKey = principal ? buildAccountKey(apiBase, principal.user.id) : "";
      if (currentKey && target.accountKey === currentKey) return true;

      const previousSnapshot =
        principal && accessToken
          ? {
              apiBase,
              managementKey: accessToken,
              ...(refreshToken ? { refreshToken } : {}),
              rememberPassword,
              effectiveTenantId:
                principal.effective_tenant.id === principal.home_tenant.id
                  ? undefined
                  : principal.effective_tenant.id,
              ...accountMetaFromPrincipal(apiBase, principal),
            }
          : null;

      // Park current session before swapping active snapshot.
      if (previousSnapshot) {
        upsertSavedAuthAccount({
          ...previousSnapshot,
          lastUsedAt: Date.now(),
        });
      }

      writePersistedAuthSnapshot({
        apiBase: target.apiBase,
        managementKey: target.managementKey,
        ...(target.refreshToken ? { refreshToken: target.refreshToken } : {}),
        rememberPassword: target.rememberPassword,
        effectiveTenantId: target.effectiveTenantId,
        accountId: target.accountId,
        accountKey: target.accountKey,
        username: target.username,
        displayName: target.displayName,
        ...(target.expiresAtMs ? { expiresAtMs: target.expiresAtMs } : {}),
        ...(target.refreshExpiresAtMs ? { refreshExpiresAtMs: target.refreshExpiresAtMs } : {}),
      });
      refreshSavedAccounts();
      setIsRestoring(true);
      const ok = await bootstrap();
      if (ok) return true;

      // Target failed: roll back to the parked previous session when possible.
      if (previousSnapshot) {
        writePersistedAuthSnapshot(previousSnapshot);
        refreshSavedAccounts();
        setIsRestoring(true);
        return bootstrap();
      }
      return false;
    },
    [
      accessToken,
      apiBase,
      bootstrap,
      principal,
      refreshSavedAccounts,
      refreshToken,
      rememberPassword,
    ],
  );

  const removeSavedAccount = useCallback(
    (accountKeyOrId: string) => {
      const currentKey = principal ? buildAccountKey(apiBase, principal.user.id) : "";
      if (currentKey && (accountKeyOrId === currentKey || accountKeyOrId === principal?.user.id)) {
        return;
      }
      removeSavedAuthAccount(accountKeyOrId);
      refreshSavedAccounts();
    },
    [apiBase, principal, refreshSavedAccounts],
  );

  const restore = useCallback(async () => {
    setIsRestoring(true);
    await bootstrap();
  }, [bootstrap]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      if (!principal?.platform_admin) return;
      const nextTenant = normalizeTenantOverride(tenantId);
      const previousTenant =
        principal.effective_tenant.id === principal.home_tenant.id
          ? ""
          : principal.effective_tenant.id;
      // Home tenant is represented as no override header.
      const nextOverride = nextTenant && nextTenant !== principal.home_tenant.id ? nextTenant : "";
      configureClient(apiBase, accessToken, nextOverride, refreshToken);
      persistEffectiveTenantOverride(nextOverride);
      // Switch cache bucket immediately so remounted pages never paint prior tenant data.
      syncActiveDataCacheTenant(nextTenant || principal.home_tenant.id, {
        apiBase,
        accountId: principal.user.id,
      });
      try {
        const response = await identityApi.me();
        const effective = response.principal.effective_tenant;
        const confirmedOverride =
          effective.id === response.principal.home_tenant.id ? "" : effective.id;
        // Align storage with what the server actually accepted.
        if (confirmedOverride !== nextOverride) {
          configureClient(apiBase, accessToken, confirmedOverride, refreshToken);
          persistEffectiveTenantOverride(confirmedOverride);
        }
        setPrincipal(response.principal);
        syncActiveDataCacheTenant(effective.id, {
          apiBase,
          accountId: response.principal.user.id,
        });
      } catch {
        configureClient(apiBase, accessToken, previousTenant, refreshToken);
        persistEffectiveTenantOverride(previousTenant);
        syncActiveDataCacheTenant(previousTenant || principal.home_tenant.id, {
          apiBase,
          accountId: principal.user.id,
        });
      }
    },
    [accessToken, apiBase, configureClient, principal, refreshToken],
  );

  const permissions = useMemo(
    () => new Set(principal?.permissions ?? (isLocalPreviewMode() ? ["*"] : [])),
    [principal],
  );
  const can = useCallback(
    (permission: string) =>
      Boolean(principal?.platform_admin || permissions.has("*") || permissions.has(permission)),
    [permissions, principal?.platform_admin],
  );

  const value = useMemo<AuthContextState>(
    () => ({
      state: {
        isAuthenticated,
        isRestoring,
        apiBase,
        managementKey: accessToken,
        rememberPassword,
        serverVersion,
        serverBuildDate,
        principal,
        authFailureCode,
        permissions,
        savedAccounts,
      },
      actions: {
        login,
        logout,
        restore,
        switchTenant,
        beginAddAccount,
        switchAccount,
        removeSavedAccount,
      },
      meta: { managementEndpoint: computeManagementApiBase(apiBase) },
      can,
    }),
    [
      accessToken,
      apiBase,
      authFailureCode,
      beginAddAccount,
      can,
      isAuthenticated,
      isRestoring,
      login,
      logout,
      permissions,
      principal,
      rememberPassword,
      removeSavedAccount,
      restore,
      savedAccounts,
      serverBuildDate,
      serverVersion,
      switchAccount,
      switchTenant,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export const useAuth = (): AuthContextState => {
  const context = use(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const useOptionalAuth = (): AuthContextState | null => use(AuthContext);
