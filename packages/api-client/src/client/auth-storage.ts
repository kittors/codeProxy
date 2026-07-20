import type { AuthSnapshot, SavedAuthAccount } from "../dto/types";
import {
  AUTH_ACCOUNTS_CHANGED_EVENT,
  AUTH_ACCOUNTS_SESSION_STORAGE_KEY,
  AUTH_ACCOUNTS_STORAGE_KEY,
  AUTH_PERSIST_TTL_MS,
  AUTH_STORAGE_KEY,
  normalizeApiBase,
} from "./constants";

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

const localOnly = (): Storage | null => {
  try {
    if (typeof window !== "undefined") return window.localStorage;
  } catch {
    /* unavailable */
  }
  return null;
};

const sessionOnly = (): Storage | null => {
  try {
    if (typeof window !== "undefined") return window.sessionStorage;
  } catch {
    /* unavailable */
  }
  return null;
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

/** Stable composite key so the same user.id on different apiBase does not collide. */
export const buildAccountKey = (apiBase: string, accountId: string): string => {
  const base = normalizeApiBase(apiBase.trim());
  const id = accountId.trim();
  if (!base || !id) return "";
  return `${base}\0${id}`;
};

export const parseAccountKey = (
  accountKey: string,
): { apiBase: string; accountId: string } | null => {
  const raw = accountKey.trim();
  const sep = raw.indexOf("\0");
  if (sep <= 0 || sep === raw.length - 1) return null;
  return {
    apiBase: normalizeApiBase(raw.slice(0, sep)),
    accountId: raw.slice(sep + 1).trim(),
  };
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

const emitAccountsChanged = (): void => {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_ACCOUNTS_CHANGED_EVENT));
    }
  } catch {
    /* ignore */
  }
};

const resolveAccountKey = (snapshot: {
  apiBase?: string;
  accountId?: string;
  accountKey?: string;
}): string | undefined => {
  const explicit = normalizeOptionalString(snapshot.accountKey);
  if (explicit) return explicit;
  const apiBase = normalizeOptionalString(snapshot.apiBase);
  const accountId = normalizeOptionalString(snapshot.accountId);
  if (!apiBase || !accountId) return undefined;
  return buildAccountKey(apiBase, accountId) || undefined;
};

const isTokenExpired = (snapshot: {
  expiresAtMs?: number;
  refreshExpiresAtMs?: number;
}): boolean => {
  const now = Date.now();
  // Prefer refresh expiry when present; fall back to access expiry.
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
  const accountId = normalizeOptionalString(parsed.accountId);
  const apiBase = normalizeApiBase(parsed.apiBase);
  const accountKey = resolveAccountKey({
    apiBase,
    accountId,
    accountKey: parsed.accountKey,
  });
  const snapshot: AuthSnapshot = {
    apiBase,
    managementKey: parsed.managementKey,
    ...(typeof parsed.refreshToken === "string" && parsed.refreshToken
      ? { refreshToken: parsed.refreshToken }
      : {}),
    rememberPassword: Boolean(parsed.rememberPassword),
    ...(effectiveTenantId ? { effectiveTenantId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(accountKey ? { accountKey } : {}),
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

export const readPersistedAuthSnapshot = (): AuthSnapshot | null => {
  // Prefer session (per-tab active) so multi-tab does not share one active account.
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
  // Active snapshot is always per-tab (sessionStorage) to avoid multi-tab hijack.
  // rememberPassword only controls whether the vault entry is durable (local).
  const target = session ?? (snapshot.rememberPassword ? local : null);
  if (!target) return;
  clearPersistedAuthSnapshot();
  const effectiveTenantId = normalizeEffectiveTenantId(snapshot.effectiveTenantId);
  const accountId = normalizeOptionalString(snapshot.accountId);
  const accountKey = resolveAccountKey(snapshot);
  const payload: PersistedAuthSnapshot = {
    apiBase: snapshot.apiBase,
    managementKey: snapshot.managementKey,
    ...(snapshot.refreshToken ? { refreshToken: snapshot.refreshToken } : {}),
    rememberPassword: snapshot.rememberPassword,
    expiresAt: Date.now() + AUTH_PERSIST_TTL_MS,
    ...(effectiveTenantId ? { effectiveTenantId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(accountKey ? { accountKey } : {}),
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
  if (accountId && accountKey) {
    upsertSavedAuthAccount({
      ...payload,
      accountId,
      accountKey,
      username: payload.username ?? accountId,
      displayName: payload.displayName ?? payload.username ?? accountId,
      lastUsedAt: Date.now(),
    });
  }
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

const isSavedAccount = (value: unknown): value is SavedAuthAccount => {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SavedAuthAccount>;
  return Boolean(
    (normalizeOptionalString(row.accountKey) ||
      (normalizeOptionalString(row.accountId) && normalizeOptionalString(row.apiBase))) &&
      normalizeOptionalString(row.apiBase) &&
      normalizeOptionalString(row.managementKey) &&
      normalizeOptionalString(row.username),
  );
};

const readVaultFrom = (storage: Storage | null, key: string): SavedAuthAccount[] => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const kept: SavedAuthAccount[] = [];
    let dirty = false;
    for (const row of parsed) {
      if (!isSavedAccount(row)) {
        dirty = true;
        continue;
      }
      const apiBase = normalizeApiBase(row.apiBase);
      const accountId = (row.accountId || parseAccountKey(row.accountKey ?? "")?.accountId || "").trim();
      const accountKey =
        resolveAccountKey({ apiBase, accountId, accountKey: row.accountKey }) ?? "";
      if (!accountId || !accountKey) {
        dirty = true;
        continue;
      }
      const entry: SavedAuthAccount = {
        accountId,
        accountKey,
        apiBase,
        managementKey: row.managementKey,
        ...(row.refreshToken ? { refreshToken: row.refreshToken } : {}),
        rememberPassword: Boolean(row.rememberPassword),
        ...(normalizeEffectiveTenantId(row.effectiveTenantId)
          ? { effectiveTenantId: normalizeEffectiveTenantId(row.effectiveTenantId) }
          : {}),
        username: row.username.trim(),
        displayName: (row.displayName || row.username).trim(),
        lastUsedAt: typeof row.lastUsedAt === "number" ? row.lastUsedAt : 0,
        ...(normalizeOptionalMs(row.expiresAtMs)
          ? { expiresAtMs: normalizeOptionalMs(row.expiresAtMs) }
          : {}),
        ...(normalizeOptionalMs(row.refreshExpiresAtMs)
          ? { refreshExpiresAtMs: normalizeOptionalMs(row.refreshExpiresAtMs) }
          : {}),
      };
      if (isTokenExpired(entry)) {
        dirty = true;
        continue;
      }
      // Drop entries whose retention would have expired if lastUsedAt is ancient.
      if (entry.lastUsedAt > 0 && entry.lastUsedAt + AUTH_PERSIST_TTL_MS < now) {
        dirty = true;
        continue;
      }
      kept.push(entry);
    }
    if (dirty) {
      if (kept.length === 0) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(kept));
    }
    return kept;
  } catch {
    return [];
  }
};

const writeVaultTo = (storage: Storage | null, key: string, accounts: SavedAuthAccount[]): void => {
  if (!storage) return;
  try {
    if (accounts.length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
};

export const listSavedAuthAccounts = (): SavedAuthAccount[] => {
  const local = readVaultFrom(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY);
  const session = readVaultFrom(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY);
  const byKey = new Map<string, SavedAuthAccount>();
  for (const row of [...local, ...session]) {
    const prev = byKey.get(row.accountKey);
    if (!prev || row.lastUsedAt >= prev.lastUsedAt) byKey.set(row.accountKey, row);
  }
  return [...byKey.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
};

export const upsertSavedAuthAccount = (account: SavedAuthAccount): void => {
  const accountId = normalizeOptionalString(account.accountId);
  const managementKey = normalizeOptionalString(account.managementKey);
  const apiBase = normalizeOptionalString(account.apiBase);
  const username = normalizeOptionalString(account.username);
  if (!accountId || !managementKey || !apiBase || !username) return;
  const accountKey =
    resolveAccountKey({ apiBase, accountId, accountKey: account.accountKey }) ??
    buildAccountKey(apiBase, accountId);
  if (!accountKey) return;
  if (isTokenExpired(account)) {
    removeSavedAuthAccount(accountKey);
    return;
  }
  const next: SavedAuthAccount = {
    accountId,
    accountKey,
    apiBase: normalizeApiBase(apiBase),
    managementKey,
    ...(account.refreshToken ? { refreshToken: account.refreshToken } : {}),
    rememberPassword: Boolean(account.rememberPassword),
    ...(normalizeEffectiveTenantId(account.effectiveTenantId)
      ? { effectiveTenantId: normalizeEffectiveTenantId(account.effectiveTenantId) }
      : {}),
    username,
    displayName: normalizeOptionalString(account.displayName) ?? username,
    lastUsedAt: typeof account.lastUsedAt === "number" ? account.lastUsedAt : Date.now(),
    ...(normalizeOptionalMs(account.expiresAtMs)
      ? { expiresAtMs: normalizeOptionalMs(account.expiresAtMs) }
      : {}),
    ...(normalizeOptionalMs(account.refreshExpiresAtMs)
      ? { refreshExpiresAtMs: normalizeOptionalMs(account.refreshExpiresAtMs) }
      : {}),
  };
  // Remembered → local vault; non-remembered → session vault only (tab-scoped).
  if (next.rememberPassword) {
    const local = readVaultFrom(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY).filter(
      (row) => row.accountKey !== accountKey,
    );
    writeVaultTo(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY, [next, ...local]);
    // Drop any session-only copy so we do not keep two sources of truth.
    const session = readVaultFrom(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY).filter(
      (row) => row.accountKey !== accountKey,
    );
    writeVaultTo(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY, session);
  } else {
    const session = readVaultFrom(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY).filter(
      (row) => row.accountKey !== accountKey,
    );
    writeVaultTo(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY, [next, ...session]);
    const local = readVaultFrom(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY).filter(
      (row) => row.accountKey !== accountKey,
    );
    writeVaultTo(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY, local);
  }
  emitAccountsChanged();
};

/** Accepts accountKey or legacy accountId (matches first entry). */
export const removeSavedAuthAccount = (accountKeyOrId: string): void => {
  const key = normalizeOptionalString(accountKeyOrId);
  if (!key) return;
  const match = (row: SavedAuthAccount) => row.accountKey === key || row.accountId === key;
  writeVaultTo(
    localOnly(),
    AUTH_ACCOUNTS_STORAGE_KEY,
    readVaultFrom(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY).filter((row) => !match(row)),
  );
  writeVaultTo(
    sessionOnly(),
    AUTH_ACCOUNTS_SESSION_STORAGE_KEY,
    readVaultFrom(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY).filter((row) => !match(row)),
  );
  emitAccountsChanged();
};

export const clearSavedAuthAccounts = (): void => {
  writeVaultTo(localOnly(), AUTH_ACCOUNTS_STORAGE_KEY, []);
  writeVaultTo(sessionOnly(), AUTH_ACCOUNTS_SESSION_STORAGE_KEY, []);
  emitAccountsChanged();
};

export const getSavedAuthAccount = (accountKeyOrId: string): SavedAuthAccount | null => {
  const key = normalizeOptionalString(accountKeyOrId);
  if (!key) return null;
  return (
    listSavedAuthAccounts().find((row) => row.accountKey === key || row.accountId === key) ?? null
  );
};
