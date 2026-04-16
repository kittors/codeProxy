import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AUTH_STORAGE_KEY } from "@/lib/constants";
import {
  computeManagementApiBase,
  detectApiBaseFromLocation,
  normalizeApiBase,
} from "@/lib/connection";
import { apiClient } from "@/lib/http/client";
import { configApi } from "@/lib/http/apis";
import type { AuthSnapshot } from "@/lib/http/types";

const AUTH_PERSIST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface AuthContextState {
  state: {
    isAuthenticated: boolean;
    isRestoring: boolean;
    apiBase: string;
    managementKey: string;
    rememberPassword: boolean;
    serverVersion: string | null;
    serverBuildDate: string | null;
  };
  actions: {
    login: (input: {
      apiBase: string;
      managementKey: string;
      rememberPassword: boolean;
    }) => Promise<void>;
    logout: () => void;
    restore: () => Promise<void>;
  };
  meta: {
    managementEndpoint: string;
  };
}

const AuthContext = createContext<AuthContextState | null>(null);

interface PersistedAuthSnapshot extends AuthSnapshot {
  expiresAt: number;
}

const readAuthSnapshot = (): AuthSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedAuthSnapshot>;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    if (!parsed.apiBase || !parsed.managementKey) {
      return null;
    }
    return {
      apiBase: normalizeApiBase(parsed.apiBase),
      managementKey: parsed.managementKey,
      rememberPassword: Boolean(parsed.rememberPassword),
    };
  } catch {
    return null;
  }
};

const writeAuthSnapshot = (snapshot: AuthSnapshot): void => {
  const payload: PersistedAuthSnapshot = {
    ...snapshot,
    expiresAt: Date.now() + AUTH_PERSIST_TTL_MS,
  };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
};

const clearAuthSnapshot = (): void => {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [apiBase, setApiBase] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [serverBuildDate, setServerBuildDate] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    const fallbackBase = detectApiBaseFromLocation();
    const snapshot = readAuthSnapshot();

    const resolvedBase = snapshot?.apiBase ?? fallbackBase;
    const resolvedKey = snapshot?.managementKey ?? "";
    const resolvedRemember = snapshot?.rememberPassword ?? false;

    setApiBase(resolvedBase);
    setManagementKey(resolvedKey);
    setRememberPassword(resolvedRemember);

    apiClient.setConfig({
      apiBase: resolvedBase,
      managementKey: resolvedKey,
    });

    if (!resolvedKey) {
      setIsAuthenticated(false);
      setIsRestoring(false);
      return;
    }

    try {
      await configApi.getConfig();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
      clearAuthSnapshot();
    } finally {
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      clearAuthSnapshot();
    };

    const handleVersion = (event: Event) => {
      const customEvent = event as CustomEvent<{
        version?: string | null;
        buildDate?: string | null;
      }>;
      setServerVersion(customEvent.detail?.version ?? null);
      setServerBuildDate(customEvent.detail?.buildDate ?? null);
    };

    window.addEventListener("unauthorized", handleUnauthorized);
    window.addEventListener("server-version-update", handleVersion as EventListener);

    return () => {
      window.removeEventListener("unauthorized", handleUnauthorized);
      window.removeEventListener("server-version-update", handleVersion as EventListener);
    };
  }, []);

  const login = useCallback(
    async (input: { apiBase: string; managementKey: string; rememberPassword: boolean }) => {
      const normalizedBase = normalizeApiBase(input.apiBase);
      const trimmedKey = input.managementKey.trim();

      apiClient.setConfig({
        apiBase: normalizedBase,
        managementKey: trimmedKey,
      });

      await configApi.getConfig();

      setApiBase(normalizedBase);
      setManagementKey(trimmedKey);
      setRememberPassword(input.rememberPassword);
      setIsAuthenticated(true);

      if (input.rememberPassword) {
        writeAuthSnapshot({
          apiBase: normalizedBase,
          managementKey: trimmedKey,
          rememberPassword: true,
        });
      } else {
        clearAuthSnapshot();
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setManagementKey("");
    clearAuthSnapshot();
  }, []);

  const restore = useCallback(async () => {
    setIsRestoring(true);
    await bootstrap();
  }, [bootstrap]);

  const value = useMemo<AuthContextState>(
    () => ({
      state: {
        isAuthenticated,
        isRestoring,
        apiBase,
        managementKey,
        rememberPassword,
        serverVersion,
        serverBuildDate,
      },
      actions: {
        login,
        logout,
        restore,
      },
      meta: {
        managementEndpoint: computeManagementApiBase(apiBase),
      },
    }),
    [
      isAuthenticated,
      isRestoring,
      apiBase,
      managementKey,
      rememberPassword,
      serverVersion,
      serverBuildDate,
      login,
      logout,
      restore,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export const useAuth = (): AuthContextState => {
  const context = use(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
