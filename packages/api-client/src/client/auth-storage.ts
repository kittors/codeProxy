import type { AuthSnapshot } from "../dto/types";
import { AUTH_PERSIST_TTL_MS, AUTH_STORAGE_KEY, normalizeApiBase } from "./constants";

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
      return {
        apiBase: normalizeApiBase(parsed.apiBase),
        managementKey: parsed.managementKey,
        rememberPassword: Boolean(parsed.rememberPassword),
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
  target.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ ...snapshot, expiresAt: Date.now() + AUTH_PERSIST_TTL_MS }),
  );
};

export const clearPersistedAuthSnapshot = (): void => {
  for (const storage of storages()) storage.removeItem(AUTH_STORAGE_KEY);
};
