import type { AuthSnapshot } from "../dto/types";
import { AUTH_PERSIST_TTL_MS, AUTH_STORAGE_KEY, normalizeApiBase } from "./constants";

/** Legacy key used before effective tenant was stored inside the auth snapshot. */
export const LEGACY_EFFECTIVE_TENANT_KEY = "code-proxy-effective-tenant";

interface PersistedAuthSnapshot extends AuthSnapshot {
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
      if (
        typeof parsed.expiresAt !== "number" ||
        parsed.expiresAt <= Date.now() ||
        !parsed.apiBase ||
        !parsed.managementKey
      ) {
        storage.removeItem(AUTH_STORAGE_KEY);
        continue;
      }
      // Prefer the value stored with the session; fall back to the pre-migration key once.
      const effectiveTenantId =
        normalizeEffectiveTenantId(parsed.effectiveTenantId) ?? readLegacyEffectiveTenantId();
      return {
        apiBase: normalizeApiBase(parsed.apiBase),
        managementKey: parsed.managementKey,
        rememberPassword: Boolean(parsed.rememberPassword),
        ...(effectiveTenantId ? { effectiveTenantId } : {}),
      };
    } catch {
      storage.removeItem(AUTH_STORAGE_KEY);
    }
  }
  return null;
};

export const writePersistedAuthSnapshot = (snapshot: AuthSnapshot): void => {
  const [session, local] = storages();
  const target = snapshot.rememberPassword ? local : session;
  if (!target) return;
  clearPersistedAuthSnapshot();
  const effectiveTenantId = normalizeEffectiveTenantId(snapshot.effectiveTenantId);
  const payload: PersistedAuthSnapshot = {
    apiBase: snapshot.apiBase,
    managementKey: snapshot.managementKey,
    rememberPassword: snapshot.rememberPassword,
    expiresAt: Date.now() + AUTH_PERSIST_TTL_MS,
    ...(effectiveTenantId ? { effectiveTenantId } : {}),
  };
  target.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  // Drop the legacy key after a successful write so we do not keep two sources of truth.
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
    // Still clear any leftover override when the session is gone.
    if (!normalizeEffectiveTenantId(tenantId)) clearLegacyEffectiveTenantId();
    return;
  }
  writePersistedAuthSnapshot({
    ...current,
    effectiveTenantId: normalizeEffectiveTenantId(tenantId),
  });
};
