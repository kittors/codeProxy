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
  clearPersistedAuthSnapshot,
  computeManagementApiBase,
  detectApiBaseFromLocation,
  identityApi,
  IDENTITY_MENUS_UPDATED_EVENT,
  extractApiErrorCode,
  isApiClientError,
  configApi,
  normalizeApiBase,
  peekPersistedAuthSnapshot,
  publishSignedOut,
  readPersistedAuthSnapshot,
  subscribeAuthBroadcast,
  updatePersistedEffectiveTenantId,
  writePersistedAuthSnapshot,
  type ManagementPrincipal,
} from "@code-proxy/api-client";
import { legacyServicePrincipal } from "./legacyServiceMenus";
import { shouldAdoptRotation } from "./authRotation";
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
  rotationSeq?: number;
}) => {
  const principal = input.principal;
  writePersistedAuthSnapshot({
    apiBase: input.apiBase,
    managementKey: input.managementKey,
    ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
    rememberPassword: input.rememberPassword,
    effectiveTenantId: input.effectiveTenantId,
    ...(principal
      ? {
          accountId: principal.user.id,
          username: principal.user.username,
          displayName: principal.user.display_name || principal.user.username,
        }
      : {}),
    ...(input.expiresAtMs ? { expiresAtMs: input.expiresAtMs } : {}),
    ...(input.refreshExpiresAtMs ? { refreshExpiresAtMs: input.refreshExpiresAtMs } : {}),
    ...(input.rotationSeq ? { rotationSeq: input.rotationSeq } : {}),
  });
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
  // Monotonic op id so a slower bootstrap cannot overwrite a newer login.
  const bootstrapOpRef = useRef(0);
  // Highest rotation sequence applied here, so a broadcast that predates this
  // tab's own refresh cannot walk the session backwards to an older token.
  const rotationSeqRef = useRef(0);

  /**
   * Replace credentials. Omitting a token keeps whatever the client currently
   * holds, which matters because the client rotates tokens on its own: React
   * state here can lag a refresh by a render, and passing that stale value back
   * would undo the rotation.
   */
  const configureCredentials = useCallback(
    (base: string, token?: string, nextRefresh?: string | null) => {
      apiClient.setConfig({
        apiBase: base,
        ...(token !== undefined ? { managementKey: token } : {}),
        ...(nextRefresh !== undefined ? { refreshToken: nextRefresh ?? "" } : {}),
      });
    },
    [],
  );

  /**
   * Replace the effective-tenant header only.
   *
   * Kept separate from credentials because switching tenant is not switching
   * account: it must not bump the client's auth generation (that would cancel an
   * in-flight refresh) and must not touch tokens. Cross-tenant data separation
   * is handled by the cache bucketing in syncActiveDataCacheTenant plus the
   * principal reload in switchTenant, not by resetting auth.
   */
  const configureTenant = useCallback((effectiveTenant: string) => {
    apiClient.setTenantOverride(normalizeTenantOverride(effectiveTenant));
  }, []);

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
    rotationSeqRef.current = snapshot?.rotationSeq ?? 0;
    configureCredentials(resolvedBase, resolvedToken, snapshot?.refreshToken ?? "");
    configureTenant(requestedTenant);
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
        configureTenant("");
        syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID);
        restoredPrincipal = (await identityApi.me()).principal;
      }
      if (!isCurrent()) return false;
      // If the server ignored or could not apply the override, drop the stale value.
      if (requestedTenant && restoredPrincipal.effective_tenant.id !== requestedTenant) {
        configureTenant("");
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
        configureTenant(confirmedOverride);
      }
      persistEffectiveTenantOverride(confirmedOverride);
      setPrincipal(restoredPrincipal);
      syncActiveDataCacheTenant(restoredPrincipal.effective_tenant.id, {
        apiBase: resolvedBase,
        accountId: restoredPrincipal.user.id,
      });
      setIsAuthenticated(true);
      setAuthFailureCode("");
      // Re-read instead of writing back what this bootstrap started with. The
      // /me call above can 401 and trigger a refresh, and the client persists
      // the rotated pair itself; replaying the opening values here would roll
      // that rotation back, so the next page load would present a token the
      // server has already retired — a sign-out with no user action behind it.
      const persisted = peekPersistedAuthSnapshot();
      persistSession({
        apiBase: resolvedBase,
        managementKey: persisted?.managementKey || resolvedToken,
        refreshToken: persisted?.refreshToken ?? snapshot?.refreshToken,
        rememberPassword: resolvedRemember,
        effectiveTenantId: confirmedOverride || undefined,
        principal: restoredPrincipal,
        expiresAtMs: persisted?.expiresAtMs ?? snapshot?.expiresAtMs,
        refreshExpiresAtMs: persisted?.refreshExpiresAtMs ?? snapshot?.refreshExpiresAtMs,
        rotationSeq: persisted?.rotationSeq ?? snapshot?.rotationSeq,
      });
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
        clearPersistedAuthSnapshot();
      }
      return false;
    } finally {
      if (isCurrent()) setIsRestoring(false);
    }
  }, [configureCredentials, configureTenant]);

  useEffect(() => void bootstrap(), [bootstrap]);

  // Cross-tab coordination. Without it, the tab that loses a concurrent refresh
  // keeps replaying a refresh token the winner already rotated away, and gets
  // signed out — the "it logged me out while I was working" report, reproduced
  // by nothing more exotic than having the panel open twice.
  useEffect(
    () =>
      subscribeAuthBroadcast((message) => {
        if (isLocalPreviewMode()) return;
        if (message.type === "signed-out") {
          // Mirror handleUnauthorized's cleanup, minus the re-broadcast that
          // would bounce the message back to the tab that sent it.
          setAuthFailureCode(message.code);
          setIsAuthenticated(false);
          setPrincipal(null);
          clearPersistedAuthSnapshot();
          return;
        }
        if (
          !shouldAdoptRotation({
            currentAccountId: principal?.user.id,
            message,
            localRotationSeq: rotationSeqRef.current,
          })
        ) {
          return;
        }
        // The broadcast carries no token by design; the shared snapshot is the
        // only channel for the credential itself. A tab whose session lives in
        // sessionStorage cannot see the winner's snapshot at all, and that is
        // fine: it refreshes on its own and the server's grace window accepts it.
        const snapshot = peekPersistedAuthSnapshot();
        if (!snapshot?.managementKey) return;
        rotationSeqRef.current = message.rotationSeq;
        apiClient.adoptRotatedTokens(snapshot.managementKey, snapshot.refreshToken ?? "");
        setAccessToken(snapshot.managementKey);
        setRefreshToken(snapshot.refreshToken ?? "");
      }),
    [principal?.user.id],
  );

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
      // Deliberately no configureCredentials call: the client raised this because
      // it already shut its own gate, and re-configuring would reopen it with an
      // empty key. Transient refresh failures no longer land here, so reaching
      // this point means the session really is gone.
      setAuthFailureCode(code);
      setIsAuthenticated(false);
      setPrincipal(null);
      syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase });
      clearPersistedAuthSnapshot();
      publishSignedOut(code || "session_invalid");
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
          rotationSeq?: number;
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
      // Own rotations advance the watermark too, so a broadcast describing the
      // rotation this tab just performed is not re-applied.
      if (typeof detail?.rotationSeq === "number" && detail.rotationSeq > rotationSeqRef.current) {
        rotationSeqRef.current = detail.rotationSeq;
      }
    };
    window.addEventListener("unauthorized", handleUnauthorized);
    window.addEventListener("server-version-update", handleVersion as EventListener);
    window.addEventListener("auth-token-refreshed", handleTokenRefreshed as EventListener);
    return () => {
      window.removeEventListener("unauthorized", handleUnauthorized);
      window.removeEventListener("server-version-update", handleVersion as EventListener);
      window.removeEventListener("auth-token-refreshed", handleTokenRefreshed as EventListener);
    };
  }, [accessToken, apiBase, bootstrap, principal, refreshToken]);

  const login = useCallback(
    async (input: {
      apiBase: string;
      username: string;
      password: string;
      rememberPassword: boolean;
    }) => {
      const normalizedBase = normalizeApiBase(input.apiBase);
      // Login always starts on the home tenant; do not carry a previous override.
      configureCredentials(normalizedBase, "", null);
      configureTenant("");
      const response = await identityApi.login({
        username: input.username.trim(),
        password: input.password,
        remember_me: input.rememberPassword,
      });
      configureCredentials(normalizedBase, response.access_token, response.refresh_token ?? "");
      configureTenant("");
      setApiBase(normalizedBase);
      setAccessToken(response.access_token);
      setRefreshToken(response.refresh_token ?? "");
      rotationSeqRef.current = 1;
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
        rotationSeq: 1,
      });
      return response.principal;
    },
    [configureCredentials, configureTenant],
  );

  // Order matters here, and it is the reverse of what reads naturally.
  //
  // Clearing React state first re-renders the tree synchronously, and effects
  // keyed on managementKey (the system-stats socket among them) run during that
  // render. If the client still accepted requests at that point, those effects
  // would fire a burst of credential-less calls at the management API — which is
  // exactly what used to fill the server's throttle bucket and lock the user out
  // of logging back in. So: revoke, shut the gate, tell other tabs, drop the
  // snapshot, and only then touch state.
  const logout = useCallback(() => {
    // The client builds headers synchronously before its first await, so this
    // still carries the live token.
    void identityApi.logout().catch(() => undefined);
    configureCredentials(apiBase, "", null);
    configureTenant("");
    publishSignedOut("user_logout");
    clearPersistedAuthSnapshot();
    setIsAuthenticated(false);
    setAccessToken("");
    setRefreshToken("");
    setPrincipal(null);
    setAuthFailureCode("");
    syncActiveDataCacheTenant(DEFAULT_CACHE_TENANT_ID, { apiBase });
  }, [apiBase, configureCredentials, configureTenant]);

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
      configureTenant(nextOverride);
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
          configureTenant(confirmedOverride);
          persistEffectiveTenantOverride(confirmedOverride);
        }
        setPrincipal(response.principal);
        syncActiveDataCacheTenant(effective.id, {
          apiBase,
          accountId: response.principal.user.id,
        });
      } catch {
        configureTenant(previousTenant);
        persistEffectiveTenantOverride(previousTenant);
        syncActiveDataCacheTenant(previousTenant || principal.home_tenant.id, {
          apiBase,
          accountId: principal.user.id,
        });
      }
    },
    [apiBase, configureTenant, principal],
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
      actions: {
        login,
        logout,
        restore,
        switchTenant,
      },
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
