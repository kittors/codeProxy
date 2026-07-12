import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  apiClient,
  clearPersistedAuthSnapshot,
  computeManagementApiBase,
  detectApiBaseFromLocation,
  identityApi,
  IDENTITY_MENUS_UPDATED_EVENT,
  extractApiErrorCode,
  isApiClientError,
  configApi,
  normalizeApiBase,
  readPersistedAuthSnapshot,
  updatePersistedEffectiveTenantId,
  writePersistedAuthSnapshot,
  type ManagementPrincipal,
  type MenuIdentity,
} from "@code-proxy/api-client";
import {
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
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

/**
 * Pin the browser data-cache tenant to the effective management tenant.
 * Data caches (providers, auth-files, pricing, proxy checks, lookup charts)
 * all read getActiveCacheTenantId() so they never reuse another tenant's payload.
 */
const syncActiveDataCacheTenant = (tenantId?: string | null): void => {
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
  menu({
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

export function AuthProvider({ children }: PropsWithChildren) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [apiBase, setApiBase] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [serverBuildDate, setServerBuildDate] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<ManagementPrincipal | null>(null);
  const [authFailureCode, setAuthFailureCode] = useState("");

  const configureClient = useCallback((base: string, token: string, effectiveTenant = "") => {
    apiClient.setConfig({ apiBase: base, managementKey: token });
    const tenantId = normalizeTenantOverride(effectiveTenant);
    // Always replace headers so a previous tenant override cannot leak into home-tenant mode.
    apiClient.setDefaultHeaders(tenantId ? { "X-Effective-Tenant-ID": tenantId } : {});
  }, []);

  // Prefer live principal.effective_tenant for cache keys; fall back to last explicit pin.
  useEffect(() => {
    setCacheTenantResolver(() => principal?.effective_tenant?.id ?? null);
    if (principal?.effective_tenant?.id) {
      setActiveCacheTenantId(principal.effective_tenant.id);
    }
    return () => {
      setCacheTenantResolver(null);
    };
  }, [principal?.effective_tenant?.id]);

  const bootstrap = useCallback(async () => {
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
    setRememberPassword(resolvedRemember);
    configureClient(resolvedBase, resolvedToken, requestedTenant);
    // Pin cache tenant before any page paints from localStorage/sessionStorage.
    syncActiveDataCacheTenant(requestedTenant || DEFAULT_CACHE_TENANT_ID);

    if (!resolvedToken) {
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
      setIsRestoring(false);
      return;
    }
    if (isLocalPreviewMode()) {
      const preview = legacyServicePrincipal();
      setPrincipal(preview);
      syncActiveDataCacheTenant(preview.effective_tenant.id);
      setIsAuthenticated(true);
      setIsRestoring(false);
      return;
    }

    try {
      if (!resolvedToken.startsWith("cps_")) {
        await configApi.getConfig();
        const legacy = legacyServicePrincipal();
        setPrincipal(legacy);
        syncActiveDataCacheTenant(legacy.effective_tenant.id);
        setIsAuthenticated(true);
        return;
      }
      let restoredPrincipal: ManagementPrincipal;
      try {
        restoredPrincipal = (await identityApi.me()).principal;
      } catch (overrideError) {
        // Stale/invalid override can fail Authenticate entirely — retry home tenant
        // before treating the session as dead (matches previous two-step restore).
        if (!requestedTenant) throw overrideError;
        configureClient(resolvedBase, resolvedToken, "");
        syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
        restoredPrincipal = (await identityApi.me()).principal;
      }
      // If the server ignored or could not apply the override, drop the stale value.
      if (requestedTenant && restoredPrincipal.effective_tenant.id !== requestedTenant) {
        configureClient(resolvedBase, resolvedToken, "");
        if (restoredPrincipal.effective_tenant.id !== restoredPrincipal.home_tenant.id) {
          restoredPrincipal = (await identityApi.me()).principal;
        }
      }
      // Sync storage to what the server accepted so refresh keeps the same tenant.
      const confirmedOverride =
        restoredPrincipal.effective_tenant.id === restoredPrincipal.home_tenant.id
          ? ""
          : restoredPrincipal.effective_tenant.id;
      if (confirmedOverride !== requestedTenant) {
        configureClient(resolvedBase, resolvedToken, confirmedOverride);
      }
      persistEffectiveTenantOverride(confirmedOverride);
      setPrincipal(restoredPrincipal);
      syncActiveDataCacheTenant(restoredPrincipal.effective_tenant.id);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
      setAuthFailureCode(isApiClientError(error) ? extractApiErrorCode(error.payload) : "");
      clearPersistedAuthSnapshot();
    } finally {
      setIsRestoring(false);
    }
  }, [configureClient]);

  useEffect(() => void bootstrap(), [bootstrap]);

  useEffect(() => {
    const refreshMenus = () => void bootstrap();
    window.addEventListener(IDENTITY_MENUS_UPDATED_EVENT, refreshMenus);
    return () => window.removeEventListener(IDENTITY_MENUS_UPDATED_EVENT, refreshMenus);
  }, [bootstrap]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      if (isLocalPreviewMode()) return;
      setAuthFailureCode((event as CustomEvent<{ code?: string }>).detail?.code?.trim() ?? "");
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
      clearPersistedAuthSnapshot();
    };
    const handleVersion = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: string; buildDate?: string }>).detail;
      setServerVersion(detail?.version ?? null);
      setServerBuildDate(detail?.buildDate ?? null);
    };
    window.addEventListener("unauthorized", handleUnauthorized);
    window.addEventListener("server-version-update", handleVersion as EventListener);
    return () => {
      window.removeEventListener("unauthorized", handleUnauthorized);
      window.removeEventListener("server-version-update", handleVersion as EventListener);
    };
  }, []);

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
      configureClient(normalizedBase, response.access_token, "");
      setApiBase(normalizedBase);
      setAccessToken(response.access_token);
      setRememberPassword(input.rememberPassword);
      setPrincipal(response.principal);
      syncActiveDataCacheTenant(response.principal.effective_tenant.id);
      setAuthFailureCode("");
      setIsAuthenticated(true);
      writePersistedAuthSnapshot({
        apiBase: normalizedBase,
        managementKey: response.access_token,
        rememberPassword: input.rememberPassword,
        // Explicit empty override so a leftover legacy key cannot re-apply.
        effectiveTenantId: undefined,
      });
      return response.principal;
    },
    [configureClient],
  );

  const logout = useCallback(() => {
    void identityApi.logout().catch(() => undefined);
    setIsAuthenticated(false);
    setAccessToken("");
    setPrincipal(null);
    setAuthFailureCode("");
    configureClient(apiBase, "", "");
    syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
    clearPersistedAuthSnapshot();
  }, [apiBase, configureClient]);

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
      const nextOverride =
        nextTenant && nextTenant !== principal.home_tenant.id ? nextTenant : "";
      configureClient(apiBase, accessToken, nextOverride);
      persistEffectiveTenantOverride(nextOverride);
      // Switch cache bucket immediately so remounted pages never paint prior tenant data.
      syncActiveDataCacheTenant(nextTenant || principal.home_tenant.id);
      try {
        const response = await identityApi.me();
        const effective = response.principal.effective_tenant;
        const confirmedOverride =
          effective.id === response.principal.home_tenant.id ? "" : effective.id;
        // Align storage with what the server actually accepted.
        if (confirmedOverride !== nextOverride) {
          configureClient(apiBase, accessToken, confirmedOverride);
          persistEffectiveTenantOverride(confirmedOverride);
        }
        setPrincipal(response.principal);
        syncActiveDataCacheTenant(effective.id);
      } catch {
        configureClient(apiBase, accessToken, previousTenant);
        persistEffectiveTenantOverride(previousTenant);
        syncActiveDataCacheTenant(previousTenant || principal.home_tenant.id);
      }
    },
    [accessToken, apiBase, configureClient, principal],
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
      },
      actions: { login, logout, restore, switchTenant },
      meta: { managementEndpoint: computeManagementApiBase(apiBase) },
      can,
    }),
    [
      accessToken,
      apiBase,
      authFailureCode,
      can,
      isAuthenticated,
      isRestoring,
      login,
      logout,
      permissions,
      principal,
      rememberPassword,
      restore,
      serverBuildDate,
      serverVersion,
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
