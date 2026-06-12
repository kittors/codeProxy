import type { AuthSnapshot } from "../dto/types";
import { AUTH_PERSIST_TTL_MS, AUTH_STORAGE_KEY, normalizeApiBase } from "./constants";

interface PersistedAuthSnapshot extends AuthSnapshot {
  expiresAt: number;
}

const getStorage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const readPersistedAuthSnapshot = (): AuthSnapshot | null => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedAuthSnapshot>;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    if (!parsed.apiBase || !parsed.managementKey) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return {
      apiBase: normalizeApiBase(parsed.apiBase),
      managementKey: parsed.managementKey,
      rememberPassword: Boolean(parsed.rememberPassword),
    };
  } catch {
    storage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const writePersistedAuthSnapshot = (snapshot: AuthSnapshot): void => {
  const storage = getStorage();
  if (!storage) return;

  const payload: PersistedAuthSnapshot = {
    ...snapshot,
    expiresAt: Date.now() + AUTH_PERSIST_TTL_MS,
  };
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
};

export const clearPersistedAuthSnapshot = (): void => {
  getStorage()?.removeItem(AUTH_STORAGE_KEY);
};
