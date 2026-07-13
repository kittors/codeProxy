/**
 * Deploy switches replace hashed SPA chunks under a new release symlink.
 * Tabs still running the previous shell then fail dynamic import() with 404.
 * Recover once via hard reload so the browser picks up the new manage.html.
 */

export const CHUNK_RELOAD_STORAGE_KEY = "code-proxy-chunk-reload";

/** Ignore a second automatic reload within this window (prevents loops). */
export const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Loading chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
  /Unable to preload CSS/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (error == null) return false;

  if (typeof error === "string") {
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error));
  }

  if (typeof error !== "object") return false;

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    stack?: unknown;
  };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const stack = typeof candidate.stack === "string" ? candidate.stack : "";
  const haystack = `${name}\n${message}\n${stack}`;

  if (name === "ChunkLoadError") return true;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(haystack));
}

function readReloadMarker(storage: Storage): number | null {
  try {
    const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function writeReloadMarker(storage: Storage, now: number): void {
  try {
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // private mode / quota — still attempt reload without persistence
  }
}

export type ChunkReloadController = {
  storage?: Storage | null;
  now?: () => number;
  reload?: () => void;
  cooldownMs?: number;
};

/**
 * If `error` looks like a stale-chunk failure, hard-reload once.
 * Returns true when a reload was triggered (caller should stop UI work).
 */
export function recoverFromChunkLoadError(
  error: unknown,
  controller: ChunkReloadController = {},
): boolean {
  if (!isChunkLoadError(error)) return false;

  const storage =
    controller.storage === undefined
      ? typeof sessionStorage !== "undefined"
        ? sessionStorage
        : null
      : controller.storage;
  const now = controller.now?.() ?? Date.now();
  const cooldownMs = controller.cooldownMs ?? CHUNK_RELOAD_COOLDOWN_MS;
  const reload =
    controller.reload ??
    (() => {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    });

  if (storage) {
    const previous = readReloadMarker(storage);
    if (previous != null && now - previous < cooldownMs) {
      return false;
    }
    writeReloadMarker(storage, now);
  }

  reload();
  return true;
}

/** Install once at app entry so unhandled dynamic-import rejections also recover. */
export function installChunkLoadRecoveryHandlers(
  target: Pick<Window, "addEventListener" | "removeEventListener"> = typeof window !==
  "undefined"
    ? window
    : (undefined as never),
  controller: ChunkReloadController = {},
): () => void {
  if (!target?.addEventListener) return () => undefined;

  const onRejection = (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (!isChunkLoadError(reason)) return;
    if (typeof (event as PromiseRejectionEvent).preventDefault === "function") {
      (event as PromiseRejectionEvent).preventDefault();
    }
    recoverFromChunkLoadError(reason, controller);
  };

  const onError = (event: Event) => {
    const message = (event as ErrorEvent).message;
    const error = (event as ErrorEvent).error ?? message;
    if (!isChunkLoadError(error) && !isChunkLoadError(message)) return;
    recoverFromChunkLoadError(error ?? message, controller);
  };

  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("error", onError);
  return () => {
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("error", onError);
  };
}
