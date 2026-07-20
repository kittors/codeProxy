import type { AuthSnapshot } from "../dto/types";
import { AUTH_PERSIST_TTL_MS, AUTH_STORAGE_KEY, normalizeApiBase } from "./constants";

/** Legacy key used before effective tenant was stored inside the auth snapshot. */
export const LEGACY_EFFECTIVE_TENANT_KEY = "code-proxy-effective-tenant";

interface PersistedAuthSnapshot extends AuthSnapshot {
  /** Client retention wall clock for the active snapshot blob. */
  expiresAt: number;
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

const normalizeEffectiveTenantId = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeOptionalMs = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
};

const isTokenExpired = (snapshot: {
  expiresAtMs?: number;
  refreshExpiresAtMs?: number;
}): boolean => {
  const now = Date.now();
  if (snapshot.refreshExpiresAtMs && snapshot.refreshExpiresAtMs <= now) return true;
  if (!snapshot.refreshExpiresAtMs && snapshot.expiresAtMs && snapshot.expiresAtMs <= now) {
    return true;
  }
  return false;
};

const toAuthSnapshot = (parsed: Partial<PersistedAuthSnapshot>): AuthSnapshot | null => {
  if (
    typeof parsed.expiresAt !== "number" ||
    parsed.expiresAt <= Date.now() ||
    !parsed.apiBase ||
    !parsed.managementKey
  ) {
    return null;
  }
  const effectiveTenantId =
    normalizeEffectiveTenantId(parsed.effectiveTenantId) ?? readLegacyEffectiveTenantId();
  const snapshot: AuthSnapshot = {
    apiBase: normalizeApiBase(parsed.apiBase),
    managementKey: parsed.managementKey,
    ...(typeof parsed.refreshToken === "string" && parsed.refreshToken
      ? { refreshToken: parsed.refreshToken }
      : {}),
    rememberPassword: Boolean(parsed.rememberPassword),
    ...(effectiveTenantId ? { effectiveTenantId } : {}),
    ...(normalizeOptionalString(parsed.accountId)
      ? { accountId: normalizeOptionalString(parsed.accountId) }
      : {}),
    ...(normalizeOptionalString(parsed.username)
      ? { username: normalizeOptionalString(parsed.username) }
      : {}),
    ...(normalizeOptionalString(parsed.displayName)
      ? { displayName: normalizeOptionalString(parsed.displayName) }
      : {}),
    ...(normalizeOptionalMs(parsed.expiresAtMs)
      ? { expiresAtMs: normalizeOptionalMs(parsed.expiresAtMs) }
      : {}),
    ...(normalizeOptionalMs(parsed.refreshExpiresAtMs)
      ? { refreshExpiresAtMs: normalizeOptionalMs(parsed.refreshExpiresAtMs) }
      : {}),
  };
  if (isTokenExpired(snapshot)) return null;
  return snapshot;
};

const readLegacyEffectiveTenantId = (): string | undefined => {
  try {
    return normalizeEffectiveTenantId(window.localStorage.getItem(LEGACY_EFFECTIVE_TENANT_KEY));
  } catch {
    return undefined;
  }
};

const clearLegacyEffectiveTenantId = (): void => {
  try {
    window.localStorage.removeItem(LEGACY_EFFECTIVE_TENANT_KEY);
  } catch {
    /* Storage is optional. */
  }
};

export const readPersistedAuthSnapshot = (): AuthSnapshot | null => {
  for (const storage of storages()) {
    try {
      const raw = storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<PersistedAuthSnapshot>;
      const snapshot = toAuthSnapshot(parsed);
      if (!snapshot) {
        storage.removeItem(AUTH_STORAGE_KEY);
        continue;
      }
      return snapshot;
    } catch {
      storage.removeItem(AUTH_STORAGE_KEY);
    }
  }
  return null;
};

export const writePersistedAuthSnapshot = (snapshot: AuthSnapshot): void => {
  const [session, local] = storages();
  // rememberPassword → localStorage (survives browser restart); otherwise session only.
  const target = snapshot.rememberPassword ? (local ?? session) : (session ?? local);
  if (!target) return;
  clearPersistedAuthSnapshot();
  const effectiveTenantId = normalizeEffectiveTenantId(snapshot.effectiveTenantId);
  const payload: PersistedAuthSnapshot = {
    apiBase: snapshot.apiBase,
    managementKey: snapshot.managementKey,
    ...(snapshot.refreshToken ? { refreshToken: snapshot.refreshToken } : {}),
    rememberPassword: snapshot.rememberPassword,
    expiresAt: Date.now() + AUTH_PERSIST_TTL_MS,
    ...(effectiveTenantId ? { effectiveTenantId } : {}),
    ...(normalizeOptionalString(snapshot.accountId)
      ? { accountId: normalizeOptionalString(snapshot.accountId) }
      : {}),
    ...(normalizeOptionalString(snapshot.username)
      ? { username: normalizeOptionalString(snapshot.username) }
      : {}),
    ...(normalizeOptionalString(snapshot.displayName)
      ? { displayName: normalizeOptionalString(snapshot.displayName) }
      : {}),
    ...(normalizeOptionalMs(snapshot.expiresAtMs)
      ? { expiresAtMs: normalizeOptionalMs(snapshot.expiresAtMs) }
      : {}),
    ...(normalizeOptionalMs(snapshot.refreshExpiresAtMs)
      ? { refreshExpiresAtMs: normalizeOptionalMs(snapshot.refreshExpiresAtMs) }
      : {}),
  };
  try {
    target.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — session may still work in-memory */
  }
  clearLegacyEffectiveTenantId();
};

export const clearPersistedAuthSnapshot = (): void => {
  for (const storage of storages()) storage.removeItem(AUTH_STORAGE_KEY);
  clearLegacyEffectiveTenantId();
};

/**
 * Patch only the effective-tenant field of the current auth snapshot.
 * No-op when there is no active snapshot (logged out).
 */
export const updatePersistedEffectiveTenantId = (tenantId: string): void => {
  const current = readPersistedAuthSnapshot();
  if (!current) {
    if (!normalizeEffectiveTenantId(tenantId)) clearLegacyEffectiveTenantId();
    return;
  }
  writePersistedAuthSnapshot({
    ...current,
    effectiveTenantId: normalizeEffectiveTenantId(tenantId),
  });
};
