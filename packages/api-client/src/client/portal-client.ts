import { detectApiBaseFromLocation, normalizeApiBase, REQUEST_TIMEOUT_MS } from "./constants";

export { detectApiBaseFromLocation };
import { ApiClientError, extractApiErrorMessage } from "./errors";

export const PORTAL_AUTH_STORAGE_KEY = "code-proxy-portal-auth";

export interface PortalAuthSnapshot {
  apiBase: string;
  accessToken: string;
  refreshToken: string;
  remember: boolean;
  expiresAt: number;
  user?: {
    id: string;
    username: string;
    display_name: string;
  };
}

const storages = (): Storage[] => {
  const items: Storage[] = [];
  try {
    if (typeof window !== "undefined") items.push(window.sessionStorage, window.localStorage);
  } catch {
    /* unavailable */
  }
  return items;
};

export const readPortalAuth = (): PortalAuthSnapshot | null => {
  for (const storage of storages()) {
    try {
      const raw = storage.getItem(PORTAL_AUTH_STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PortalAuthSnapshot;
      if (!parsed.accessToken || !parsed.apiBase) {
        storage.removeItem(PORTAL_AUTH_STORAGE_KEY);
        continue;
      }
      return {
        ...parsed,
        apiBase: normalizeApiBase(parsed.apiBase),
      };
    } catch {
      storage.removeItem(PORTAL_AUTH_STORAGE_KEY);
    }
  }
  return null;
};

export const writePortalAuth = (snapshot: PortalAuthSnapshot): void => {
  const [session, local] = storages();
  const target = snapshot.remember ? local : session;
  if (!target) return;
  clearPortalAuth();
  target.setItem(
    PORTAL_AUTH_STORAGE_KEY,
    JSON.stringify({
      ...snapshot,
      apiBase: normalizeApiBase(snapshot.apiBase),
    }),
  );
};

export const clearPortalAuth = (): void => {
  for (const storage of storages()) storage.removeItem(PORTAL_AUTH_STORAGE_KEY);
};

const parseJsonOrText = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
};

interface PortalRequestOptions {
  signal?: AbortSignal;
}

export class PortalApiClient {
  private accessToken = "";
  private refreshToken = "";
  private apiBase = detectApiBaseFromLocation();
  private refreshing: Promise<boolean> | null = null;

  loadFromStorage(): PortalAuthSnapshot | null {
    const snap = readPortalAuth();
    if (snap) {
      this.apiBase = snap.apiBase;
      this.accessToken = snap.accessToken;
      this.refreshToken = snap.refreshToken;
    }
    return snap;
  }

  setSession(snap: PortalAuthSnapshot): void {
    this.apiBase = normalizeApiBase(snap.apiBase);
    this.accessToken = snap.accessToken;
    this.refreshToken = snap.refreshToken;
    writePortalAuth(snap);
  }

  clearSession(): void {
    this.accessToken = "";
    this.refreshToken = "";
    clearPortalAuth();
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  private url(path: string): string {
    const base = this.apiBase || detectApiBaseFromLocation();
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const response = await fetch(this.url("/v0/portal/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: this.refreshToken }),
        });
        const payload = (await parseJsonOrText(response)) as {
          access_token?: string;
          refresh_token?: string;
          expires_at?: string;
        };
        if (!response.ok || !payload?.access_token) {
          this.clearSession();
          return false;
        }
        this.accessToken = payload.access_token;
        if (payload.refresh_token) this.refreshToken = payload.refresh_token;
        const existing = readPortalAuth();
        writePortalAuth({
          apiBase: this.apiBase,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          remember: existing?.remember ?? true,
          expiresAt: payload.expires_at
            ? Date.parse(payload.expires_at)
            : Date.now() + 12 * 3600 * 1000,
          user: existing?.user,
        });
        return true;
      } catch {
        this.clearSession();
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
    options?: PortalRequestOptions,
  ): Promise<T> {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (options?.signal?.aborted) controller.abort();
    else options?.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(this.url(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 401 && !retried && this.refreshToken) {
        const ok = await this.tryRefresh();
        if (ok) return this.request<T>(method, path, body, true, options);
      }
      if (response.status === 204) return undefined as T;
      const payload = await parseJsonOrText(response);
      if (!response.ok) {
        throw new ApiClientError({
          message: extractApiErrorMessage(payload, `Request failed (${response.status})`),
          status: response.status,
          statusText: response.statusText,
          url: this.url(path),
          method,
          data: payload ?? null,
        });
      }
      return payload as T;
    } finally {
      globalThis.clearTimeout(timer);
      options?.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  get<T>(path: string, options?: PortalRequestOptions) {
    return this.request<T>("GET", path, undefined, false, options);
  }
  post<T>(path: string, body?: unknown, options?: PortalRequestOptions) {
    return this.request<T>("POST", path, body, false, options);
  }
  put<T>(path: string, body?: unknown, options?: PortalRequestOptions) {
    return this.request<T>("PUT", path, body, false, options);
  }
  patch<T>(path: string, body?: unknown, options?: PortalRequestOptions) {
    return this.request<T>("PATCH", path, body, false, options);
  }
  delete<T>(path: string, options?: PortalRequestOptions) {
    return this.request<T>("DELETE", path, undefined, false, options);
  }
}

export const portalClient = new PortalApiClient();
