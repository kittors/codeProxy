import { REFRESH_LOCK_POLL_MS, REFRESH_LOCK_TTL_MS, REFRESH_LOCK_WAIT_MS } from "./constants";

export const REFRESH_LOCK_NAME = "code-proxy-admin-auth-refresh";
export const REFRESH_LOCK_STORAGE_KEY = "code-proxy-admin-auth-refresh-lock";

/** Probe key: writing the real lock key to test writability would take the lock. */
const REFRESH_LOCK_PROBE_KEY = `${REFRESH_LOCK_STORAGE_KEY}-probe`;

export type LockMode = "web-locks" | "storage" | "in-process";

export interface LockResult<T> {
  mode: LockMode;
  /** false when the value came from a peer, or when the wait budget expired. */
  acquired: boolean;
  value: T;
}

export interface RefreshLockDeps {
  now?: () => number;
  storage?: Storage | null;
  locks?: LockManager | null;
}

/** Distinguishes "the lock was taken" from a legitimate `undefined`/`null` result. */
const LOCK_MISS = Symbol("refresh-lock-miss");

const TAB_ID = ((): string => {
  try {
    return globalThis.crypto?.randomUUID?.() ?? String(Math.random());
  } catch {
    return String(Math.random());
  }
})();

interface StoredLock {
  owner: string;
  acquiredAt: number;
}

/**
 * Feature-detect the Web Locks API itself.
 *
 * `isSecureContext` is deliberately not used as a proxy: it is `undefined` under
 * jsdom and the admin panel is routinely served over plain http on a LAN or
 * Docker host, so gating on it would disagree with both real deployments and the
 * test environment.
 */
const detectLockManager = (): LockManager | null => {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  return typeof locks?.request === "function" ? locks : null;
};

/**
 * The lock always lives in localStorage, independent of where the auth snapshot
 * is stored: a sessionStorage lock is per-tab and would fail to serialise
 * exactly the tabs this lock exists for (`rememberPassword: false` sessions).
 */
const detectLockStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Private mode and exhausted quota throw on write. Probing once up front keeps
 * that failure out of the critical section, where it would be indistinguishable
 * from `fn` itself throwing.
 */
const isStorageWritable = (storage: Storage): boolean => {
  try {
    storage.setItem(REFRESH_LOCK_PROBE_KEY, "1");
    storage.removeItem(REFRESH_LOCK_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
};

const readStoredLock = (storage: Storage): StoredLock | null => {
  try {
    const raw = storage.getItem(REFRESH_LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLock>;
    if (typeof parsed.owner !== "string" || typeof parsed.acquiredAt !== "number") return null;
    return { owner: parsed.owner, acquiredAt: parsed.acquiredAt };
  } catch {
    return null;
  }
};

/**
 * Claim the lock, or report that a live holder owns it.
 *
 * A holder older than the TTL is treated as abandoned: a tab closed mid-refresh
 * never runs its release, and without preemption every other tab would wedge.
 * Ownership is not re-entrant — a second concurrent refresh in this same tab
 * must queue, exactly like one in another tab.
 */
const tryClaimStoredLock = (storage: Storage, now: number): StoredLock | null => {
  const held = readStoredLock(storage);
  if (held && now - held.acquiredAt <= REFRESH_LOCK_TTL_MS) return null;
  const token: StoredLock = { owner: TAB_ID, acquiredAt: now };
  try {
    storage.setItem(REFRESH_LOCK_STORAGE_KEY, JSON.stringify(token));
  } catch {
    return null;
  }
  return token;
};

const holdsStoredLock = (storage: Storage, token: StoredLock): boolean => {
  const held = readStoredLock(storage);
  return held?.owner === token.owner && held.acquiredAt === token.acquiredAt;
};

/** Release only our own claim, so a preempting peer's lock is never deleted. */
const releaseStoredLock = (storage: Storage, token: StoredLock): void => {
  try {
    if (holdsStoredLock(storage, token)) storage.removeItem(REFRESH_LOCK_STORAGE_KEY);
  } catch {
    /* Storage may have become unavailable mid-flight; the TTL covers this. */
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runWithStoredLock = async <T>(
  storage: Storage,
  fn: () => Promise<T>,
  now: () => number,
): Promise<T | typeof LOCK_MISS> => {
  const token = tryClaimStoredLock(storage, now());
  if (!token) return LOCK_MISS;
  // localStorage has no compare-and-swap: two tabs writing in the same instant
  // both see a free slot and converge on the last writer. Yield one tick and
  // re-read so the overwritten tab discovers it actually lost.
  await Promise.resolve();
  if (!holdsStoredLock(storage, token)) return LOCK_MISS;
  try {
    return await fn();
  } finally {
    releaseStoredLock(storage, token);
  }
};

const runWithWebLock = async <T>(
  locks: LockManager,
  fn: () => Promise<T>,
): Promise<T | typeof LOCK_MISS> => {
  // `ifAvailable` instead of a blocking request: the caller needs to poll
  // `onWaited` while another tab holds the lock, and Web Locks offers no hook
  // into the queue.
  const result: unknown = await locks.request(
    REFRESH_LOCK_NAME,
    { ifAvailable: true },
    async (lock) => (lock ? await fn() : LOCK_MISS),
  );
  return result as T | typeof LOCK_MISS;
};

/**
 * Run `fn` under a cross-tab exclusive lock, degrading through three levels:
 * Web Locks → a TTL'd localStorage claim → no coordination at all.
 *
 * While a peer holds the lock, `onWaited` is polled; returning a non-null value
 * adopts the peer's result and skips `fn` entirely. If the wait budget expires,
 * `fn` runs unlocked rather than failing — the backend refresh grace window is
 * sized for exactly that case (REFRESH_LOCK_WAIT_MS + REFRESH_TOTAL_BUDGET_MS <
 * BACKEND_REFRESH_GRACE_MS), so a duplicate rotation is tolerated instead of
 * tripping reuse detection.
 */
export async function withRefreshLock<T>(
  fn: () => Promise<T>,
  onWaited: () => Promise<T | null>,
  deps: RefreshLockDeps = {},
): Promise<LockResult<T>> {
  const now = deps.now ?? (() => Date.now());
  const locks = deps.locks !== undefined ? deps.locks : detectLockManager();
  const storage = deps.storage !== undefined ? deps.storage : detectLockStorage();

  let mode: LockMode = "in-process";
  let tryRun: () => Promise<T | typeof LOCK_MISS> = async () => await fn();
  if (locks) {
    mode = "web-locks";
    tryRun = () => runWithWebLock(locks, fn);
  } else if (storage && isStorageWritable(storage)) {
    mode = "storage";
    tryRun = () => runWithStoredLock(storage, fn, now);
  }

  const first = await tryRun();
  if (first !== LOCK_MISS) return { mode, acquired: true, value: first };

  const deadline = now() + REFRESH_LOCK_WAIT_MS;
  while (now() < deadline) {
    await sleep(REFRESH_LOCK_POLL_MS);
    const peerValue = await onWaited();
    if (peerValue !== null) return { mode, acquired: false, value: peerValue };
    const retry = await tryRun();
    if (retry !== LOCK_MISS) return { mode, acquired: true, value: retry };
  }
  return { mode, acquired: false, value: await fn() };
}
