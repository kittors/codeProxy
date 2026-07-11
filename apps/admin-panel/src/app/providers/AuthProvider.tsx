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
  extractApiErrorCode,
  isApiClientError,
  configApi,
  normalizeApiBase,
  readPersistedAuthSnapshot,
  writePersistedAuthSnapshot,
  type ManagementPrincipal,
} from "@code-proxy/api-client";

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
const EFFECTIVE_TENANT_KEY = "code-proxy-effective-tenant";

const isLocalPreviewMode = () =>
  import.meta.env.DEV &&
  ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).get("preview") === "1";

const readEffectiveTenant = () => {
  try {
    return localStorage.getItem(EFFECTIVE_TENANT_KEY) ?? "";
  } catch {
    return "";
  }
};

const setEffectiveTenant = (tenantId: string) => {
  try {
    if (tenantId) localStorage.setItem(EFFECTIVE_TENANT_KEY, tenantId);
    else localStorage.removeItem(EFFECTIVE_TENANT_KEY);
  } catch {
    // Storage is optional; server authorization remains authoritative.
  }
};

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

  const configureClient = useCallback((base: string, token: string, effectiveTenant?: string) => {
    apiClient.setConfig({ apiBase: base, managementKey: token });
    const tenantId = effectiveTenant ?? readEffectiveTenant();
    apiClient.setDefaultHeaders(tenantId ? { "X-Effective-Tenant-ID": tenantId } : {});
  }, []);

  const bootstrap = useCallback(async () => {
    const fallbackBase = detectApiBaseFromLocation();
    const snapshot = readPersistedAuthSnapshot();
    const resolvedBase = snapshot?.apiBase ?? fallbackBase;
    const resolvedToken = snapshot?.managementKey ?? "";
    const resolvedRemember = snapshot?.rememberPassword ?? false;

    setApiBase(resolvedBase);
    setAccessToken(resolvedToken);
    setRememberPassword(resolvedRemember);
    const requestedTenant = readEffectiveTenant();
    configureClient(resolvedBase, resolvedToken, "");

    if (!resolvedToken) {
      setIsAuthenticated(false);
      setPrincipal(null);
      setIsRestoring(false);
      return;
    }
    if (isLocalPreviewMode()) {
      setPrincipal(legacyServicePrincipal());
      setIsAuthenticated(true);
      setIsRestoring(false);
      return;
    }

    try {
      if (!resolvedToken.startsWith("cps_")) {
        await configApi.getConfig();
        setPrincipal(legacyServicePrincipal());
        setIsAuthenticated(true);
        return;
      }
      const response = await identityApi.me();
      let restoredPrincipal = response.principal;
      if (
        restoredPrincipal.platform_admin &&
        requestedTenant &&
        requestedTenant !== restoredPrincipal.home_tenant.id
      ) {
        setEffectiveTenant(requestedTenant);
        configureClient(resolvedBase, resolvedToken, requestedTenant);
        try {
          restoredPrincipal = (await identityApi.me()).principal;
        } catch {
          setEffectiveTenant("");
          configureClient(resolvedBase, resolvedToken, "");
        }
      } else {
        setEffectiveTenant("");
      }
      setPrincipal(restoredPrincipal);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
      setPrincipal(null);
      setAuthFailureCode(isApiClientError(error) ? extractApiErrorCode(error.payload) : "");
      setEffectiveTenant("");
      clearPersistedAuthSnapshot();
    } finally {
      setIsRestoring(false);
    }
  }, [configureClient]);

  useEffect(() => void bootstrap(), [bootstrap]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      if (isLocalPreviewMode()) return;
      setAuthFailureCode((event as CustomEvent<{ code?: string }>).detail?.code?.trim() ?? "");
      setIsAuthenticated(false);
      setPrincipal(null);
      setEffectiveTenant("");
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
      setEffectiveTenant("");
      configureClient(normalizedBase, "", "");
      const response = await identityApi.login({
        username: input.username.trim(),
        password: input.password,
        remember_me: input.rememberPassword,
      });
      configureClient(normalizedBase, response.access_token);
      setApiBase(normalizedBase);
      setAccessToken(response.access_token);
      setRememberPassword(input.rememberPassword);
      setPrincipal(response.principal);
      setAuthFailureCode("");
      setIsAuthenticated(true);
      writePersistedAuthSnapshot({
        apiBase: normalizedBase,
        managementKey: response.access_token,
        rememberPassword: input.rememberPassword,
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
    setEffectiveTenant("");
    clearPersistedAuthSnapshot();
  }, []);

  const restore = useCallback(async () => {
    setIsRestoring(true);
    await bootstrap();
  }, [bootstrap]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      if (!principal?.platform_admin) return;
      const previousTenant =
        principal.effective_tenant.id === principal.home_tenant.id
          ? ""
          : principal.effective_tenant.id;
      setEffectiveTenant(tenantId);
      configureClient(apiBase, accessToken, tenantId);
      try {
        const response = await identityApi.me();
        setPrincipal(response.principal);
      } catch {
        setEffectiveTenant(previousTenant);
        configureClient(apiBase, accessToken, previousTenant);
      }
    },
    [accessToken, apiBase, configureClient, principal?.platform_admin],
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
