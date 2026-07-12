import {
  DEFAULT_CACHE_TENANT_ID,
  getActiveCacheTenantId,
  normalizeCacheTenantId,
} from "./activeTenant";

export type WebStorageKind = "local" | "session";

export type TenantBucketStore<T> = {
  byTenant: Record<string, T>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getStorage = (kind: WebStorageKind): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

const parseJson = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

/**
 * Read a tenant-bucketed store from web storage.
 * Shape: `{ byTenant: { [tenantId]: T } }`.
 * Optionally migrates a legacy unscoped payload into the default tenant once.
 */
export function readTenantBucketStore<T>(options: {
  key: string;
  kind?: WebStorageKind;
  /** Legacy storage key without tenant isolation; migrated into default tenant only. */
  legacyKey?: string;
  /** Parse + validate one tenant bucket. Return null to drop invalid data. */
  parseBucket: (value: unknown) => T | null;
  /** When the current key holds a single unscoped bucket, treat it as default-tenant data. */
  acceptUnscopedCurrent?: boolean;
}): TenantBucketStore<T> {
  const kind = options.kind ?? "local";
  const storage = getStorage(kind);
  if (!storage) return { byTenant: {} };

  try {
    const raw = storage.getItem(options.key);
    const parsed = parseJson(raw);
    if (isRecord(parsed) && isRecord(parsed.byTenant)) {
      const byTenant: Record<string, T> = {};
      for (const [tenantKey, bucket] of Object.entries(parsed.byTenant)) {
        const normalizedKey = normalizeCacheTenantId(tenantKey);
        const parsedBucket = options.parseBucket(bucket);
        if (parsedBucket != null) byTenant[normalizedKey] = parsedBucket;
      }
      return { byTenant };
    }

    if (options.acceptUnscopedCurrent && parsed != null) {
      const single = options.parseBucket(parsed);
      if (single != null) {
        return { byTenant: { [DEFAULT_CACHE_TENANT_ID]: single } };
      }
    }

    if (options.legacyKey) {
      const legacyRaw = storage.getItem(options.legacyKey);
      const legacyParsed = parseJson(legacyRaw);
      if (legacyParsed != null) {
        const legacyBucket = options.parseBucket(legacyParsed);
        if (legacyBucket != null) {
          return { byTenant: { [DEFAULT_CACHE_TENANT_ID]: legacyBucket } };
        }
      }
    }

    return { byTenant: {} };
  } catch {
    return { byTenant: {} };
  }
}

export function writeTenantBucketStore<T>(options: {
  key: string;
  kind?: WebStorageKind;
  store: TenantBucketStore<T>;
  /** Drop these legacy keys after a successful write. */
  legacyKeysToRemove?: string[];
}): void {
  const kind = options.kind ?? "local";
  const storage = getStorage(kind);
  if (!storage) return;
  try {
    storage.setItem(options.key, JSON.stringify(options.store));
    for (const legacy of options.legacyKeysToRemove ?? []) {
      try {
        storage.removeItem(legacy);
      } catch {
        // ignore
      }
    }
  } catch {
    // Quota / private mode: keep in-memory behavior only.
  }
}

export function readTenantBucket<T>(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  legacyKey?: string;
  parseBucket: (value: unknown) => T | null;
  acceptUnscopedCurrent?: boolean;
}): T | null {
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore(options);
  return store.byTenant[tenantKey] ?? null;
}

export function writeTenantBucket<T>(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  bucket: T;
  legacyKey?: string;
  parseBucket: (value: unknown) => T | null;
  acceptUnscopedCurrent?: boolean;
  legacyKeysToRemove?: string[];
  /** Merge with previous bucket for the same tenant before write. */
  merge?: (previous: T | null, next: T) => T;
}): void {
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    legacyKey: options.legacyKey,
    parseBucket: options.parseBucket,
    acceptUnscopedCurrent: options.acceptUnscopedCurrent,
  });
  const previous = store.byTenant[tenantKey] ?? null;
  store.byTenant[tenantKey] = options.merge
    ? options.merge(previous, options.bucket)
    : options.bucket;
  writeTenantBucketStore({
    key: options.key,
    kind: options.kind,
    store,
    legacyKeysToRemove: [
      ...(options.legacyKeysToRemove ?? []),
      ...(options.legacyKey ? [options.legacyKey] : []),
    ],
  });
}

export function updateTenantBucketMapEntry<T>(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  entryKey: string;
  entryValue: T;
  /** Max entries kept per tenant map (LRU-ish: drop oldest insertion order). */
  maxEntries?: number;
  legacyKey?: string;
  legacyKeysToRemove?: string[];
}): void {
  const parseBucket = (value: unknown): Record<string, T> | null => {
    if (!isRecord(value)) return null;
    return value as Record<string, T>;
  };
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    legacyKey: options.legacyKey,
    parseBucket,
    acceptUnscopedCurrent: true,
  });
  const previous = store.byTenant[tenantKey] ?? {};
  const next: Record<string, T> = { ...previous, [options.entryKey]: options.entryValue };
  if (options.maxEntries && options.maxEntries > 0) {
    const keys = Object.keys(next);
    if (keys.length > options.maxEntries) {
      const drop = keys.slice(0, keys.length - options.maxEntries);
      for (const k of drop) delete next[k];
    }
  }
  store.byTenant[tenantKey] = next;
  writeTenantBucketStore({
    key: options.key,
    kind: options.kind,
    store,
    legacyKeysToRemove: [
      ...(options.legacyKeysToRemove ?? []),
      ...(options.legacyKey ? [options.legacyKey] : []),
    ],
  });
}

export function readTenantBucketMapEntry<T>(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  entryKey: string;
  legacyKey?: string;
  isEntry?: (value: unknown) => value is T;
}): T | null {
  const parseBucket = (value: unknown): Record<string, T> | null => {
    if (!isRecord(value)) return null;
    return value as Record<string, T>;
  };
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    legacyKey: options.legacyKey,
    parseBucket,
    acceptUnscopedCurrent: true,
  });
  const bucket = store.byTenant[tenantKey];
  if (!bucket) return null;
  const entry = bucket[options.entryKey];
  if (entry === undefined) return null;
  if (options.isEntry && !options.isEntry(entry)) return null;
  return entry;
}

export function clearTenantBucketMap(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
}): void {
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    parseBucket: (value) => (isRecord(value) ? (value as Record<string, unknown>) : null),
  });
  delete store.byTenant[tenantKey];
  writeTenantBucketStore({
    key: options.key,
    kind: options.kind,
    store,
  });
}

/**
 * TTL-aware per-slot cache under a tenant bucket.
 * Used by providers page: each provider tab is a slot with its own timestamp.
 */
export type TtlSlotEntry<T> = {
  data: T;
  timestamp: number;
};

export function readTenantTtlSlot<T>(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  slot: string;
  ttlMs: number;
  /** Prefix used by legacy unscoped keys: `${legacyPrefix}${slot}`. */
  legacyPrefix?: string;
}): T | null {
  const now = Date.now();
  const parseSlot = (value: unknown): TtlSlotEntry<T> | null => {
    if (!isRecord(value)) return null;
    const timestamp = Number(value.timestamp);
    if (!Number.isFinite(timestamp)) return null;
    if (now - timestamp > options.ttlMs) return null;
    if (!("data" in value)) return null;
    return { data: value.data as T, timestamp };
  };

  const parseBucket = (value: unknown): Record<string, TtlSlotEntry<T>> | null => {
    if (!isRecord(value)) return null;
    // Single-slot legacy shape stored under providers-page:cache:${slot}
    if ("data" in value && "timestamp" in value) {
      const slotEntry = parseSlot(value);
      return slotEntry ? { [options.slot]: slotEntry } : {};
    }
    const out: Record<string, TtlSlotEntry<T>> = {};
    for (const [slot, raw] of Object.entries(value)) {
      const entry = parseSlot(raw);
      if (entry) out[slot] = entry;
    }
    return out;
  };

  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    parseBucket,
  });

  const fromStore = store.byTenant[tenantKey]?.[options.slot];
  if (fromStore) return fromStore.data;

  // One-shot migration from unscoped per-slot keys into default tenant only.
  if (options.legacyPrefix && tenantKey === DEFAULT_CACHE_TENANT_ID) {
    const storage = getStorage(options.kind ?? "local");
    if (!storage) return null;
    try {
      const legacyRaw = storage.getItem(`${options.legacyPrefix}${options.slot}`);
      const legacyEntry = parseSlot(parseJson(legacyRaw));
      if (!legacyEntry) return null;
      // Promote into the new store so subsequent reads stay tenant-scoped.
      writeTenantTtlSlot({
        key: options.key,
        kind: options.kind,
        tenantId: tenantKey,
        slot: options.slot,
        data: legacyEntry.data,
        ttlMs: options.ttlMs,
        legacyPrefix: options.legacyPrefix,
      });
      return legacyEntry.data;
    } catch {
      return null;
    }
  }

  return null;
}

export function writeTenantTtlSlot<T>(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  slot: string;
  data: T;
  ttlMs: number;
  legacyPrefix?: string;
}): void {
  const parseBucket = (value: unknown): Record<string, TtlSlotEntry<T>> | null => {
    if (!isRecord(value)) return null;
    if ("data" in value && "timestamp" in value) {
      return { [options.slot]: value as TtlSlotEntry<T> };
    }
    return value as Record<string, TtlSlotEntry<T>>;
  };
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    parseBucket,
  });
  const previous = store.byTenant[tenantKey] ?? {};
  // Drop expired slots while writing.
  const now = Date.now();
  const next: Record<string, TtlSlotEntry<T>> = {};
  for (const [slot, entry] of Object.entries(previous)) {
    if (
      entry &&
      typeof entry === "object" &&
      Number.isFinite(entry.timestamp) &&
      now - entry.timestamp <= options.ttlMs
    ) {
      next[slot] = entry;
    }
  }
  next[options.slot] = { data: options.data, timestamp: now };
  store.byTenant[tenantKey] = next;

  const legacyKeysToRemove: string[] = [];
  if (options.legacyPrefix) {
    legacyKeysToRemove.push(`${options.legacyPrefix}${options.slot}`);
  }

  writeTenantBucketStore({
    key: options.key,
    kind: options.kind,
    store,
    legacyKeysToRemove,
  });
}

export function removeTenantTtlSlot(options: {
  key: string;
  kind?: WebStorageKind;
  tenantId?: string | null;
  slot: string;
  legacyPrefix?: string;
}): void {
  const parseBucket = (value: unknown): Record<string, TtlSlotEntry<unknown>> | null => {
    if (!isRecord(value)) return null;
    return value as Record<string, TtlSlotEntry<unknown>>;
  };
  const tenantKey = normalizeCacheTenantId(
    options.tenantId ?? getActiveCacheTenantId(),
  );
  const store = readTenantBucketStore({
    key: options.key,
    kind: options.kind,
    parseBucket,
  });
  const previous = store.byTenant[tenantKey];
  if (previous) {
    delete previous[options.slot];
    if (Object.keys(previous).length === 0) delete store.byTenant[tenantKey];
    else store.byTenant[tenantKey] = previous;
  }
  writeTenantBucketStore({
    key: options.key,
    kind: options.kind,
    store,
    legacyKeysToRemove: options.legacyPrefix
      ? [`${options.legacyPrefix}${options.slot}`]
      : undefined,
  });
}
