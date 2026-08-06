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

/** Snapshots written before rotation tracking existed are the oldest possible. */
const normalizeRotationSeq = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
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
    ...(normalizeRotationSeq(parsed.rotationSeq)
      ? { rotationSeq: normalizeRotationSeq(parsed.rotationSeq) }
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
    ...(normalizeRotationSeq(snapshot.rotationSeq)
      ? { rotationSeq: normalizeRotationSeq(snapshot.rotationSeq) }
      : {}),
  };
  try {
    target.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — session may still work in-memory */
  }
  clearLegacyEffectiveTenantId();
};

/**
 * Locate the stored record without judging or deleting it.
 *
 * `readPersistedAuthSnapshot` drops expired records, which is right for reads
 * but fatal for the refresh write-back: the record is expired precisely when a
 * refresh just produced the long-lived token that would fix it, and deleting it
 * first turns the write-back into a no-op.
 */
const readRawRecord = (): { storage: Storage; record: PersistedAuthSnapshot } | null => {
  for (const storage of storages()) {
    try {
      const raw = storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) continue;
      const record = JSON.parse(raw) as PersistedAuthSnapshot;
      if (!record.apiBase || !record.managementKey) continue;
      return { storage, record };
    } catch {
      /* Corrupt blob: leave it to readPersistedAuthSnapshot to clean up. */
    }
  }
  return null;
};

/**
 * Read the stored session without the expiry check, and without deleting it.
 *
 * `readPersistedAuthSnapshot` drops any record whose stored expiry has lapsed,
 * which is right for restore but destructive during a refresh: the refresh path
 * re-reads the snapshot to see whether another tab already rotated, and doing
 * that through the pruning reader deletes the very record the rotation is about
 * to write back — the session then survives in memory but vanishes on reload.
 * Callers here are asking "what is stored right now", not "may I resume this".
 */
export const peekPersistedAuthSnapshot = (): AuthSnapshot | null => {
  const found = readRawRecord();
  if (!found) return null;
  const { record } = found;
  return {
    apiBase: normalizeApiBase(record.apiBase),
    managementKey: record.managementKey,
    ...(record.refreshToken ? { refreshToken: record.refreshToken } : {}),
    rememberPassword: Boolean(record.rememberPassword),
    ...(record.effectiveTenantId ? { effectiveTenantId: record.effectiveTenantId } : {}),
    ...(record.accountId ? { accountId: record.accountId } : {}),
    ...(record.username ? { username: record.username } : {}),
    ...(record.displayName ? { displayName: record.displayName } : {}),
    ...(normalizeOptionalMs(record.expiresAtMs) ? { expiresAtMs: record.expiresAtMs } : {}),
    ...(normalizeOptionalMs(record.refreshExpiresAtMs)
      ? { refreshExpiresAtMs: record.refreshExpiresAtMs }
      : {}),
    ...(normalizeRotationSeq(record.rotationSeq)
      ? { rotationSeq: normalizeRotationSeq(record.rotationSeq) }
      : {}),
  };
};

export interface RefreshedTokenPatch {
  managementKey: string;
  refreshToken?: string;
  expiresAtMs?: number;
  refreshExpiresAtMs?: number;
}

/**
 * Write rotated tokens back into the live session and bump `rotationSeq`.
 *
 * Returns the new rotation sequence, or null when there is no session to patch
 * — a no-op is required there so a late refresh cannot resurrect a session the
 * user just signed out of. The record is rewritten into the storage it was
 * found in, keeping the `rememberPassword` medium (local vs session) intact.
 *
 * Expiry fields are taken from the server verbatim: no max() against the old
 * values, because the backend legitimately shortens the refresh window (it is
 * capped by the absolute session deadline) and masking that only moves the
 * eventual logout somewhere harder to diagnose.
 */
export const applyRefreshedTokens = (patch: RefreshedTokenPatch): number | null => {
  const found = readRawRecord();
  if (!found) return null;
  const { storage, record } = found;
  const rotationSeq = normalizeRotationSeq(record.rotationSeq) + 1;
  const next: PersistedAuthSnapshot = {
    ...record,
    managementKey: patch.managementKey,
    // Absent patch fields mean the server did not rotate that value, so the
    // stored one is still current.
    ...(patch.refreshToken ? { refreshToken: patch.refreshToken } : {}),
    ...(normalizeOptionalMs(patch.expiresAtMs) ? { expiresAtMs: patch.expiresAtMs } : {}),
    ...(normalizeOptionalMs(patch.refreshExpiresAtMs)
      ? { refreshExpiresAtMs: patch.refreshExpiresAtMs }
      : {}),
    rotationSeq,
    // The blob retention clock rides along with the session it describes.
    expiresAt: Date.now() + AUTH_PERSIST_TTL_MS,
  };
  try {
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return null;
  }
  return rotationSeq;
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
