import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_STORAGE_KEY,
  installChunkLoadRecoveryHandlers,
  isChunkLoadError,
  recoverFromChunkLoadError,
} from "../chunkLoadRecovery";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe("isChunkLoadError", () => {
  test("detects common dynamic import failure messages", () => {
    expect(
      isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js")),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk MonitorPage-abc failed"))).toBe(true);
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "loading" })).toBe(true);
    expect(isChunkLoadError("error loading dynamically imported module")).toBe(true);
  });

  test("ignores unrelated errors", () => {
    expect(isChunkLoadError(new Error("Network Error"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });
});

describe("recoverFromChunkLoadError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("reloads once for chunk errors and records a session marker", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const now = 1_000_000;

    expect(
      recoverFromChunkLoadError(new TypeError("Failed to fetch dynamically imported module"), {
        storage,
        now: () => now,
        reload,
      }),
    ).toBe(true);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBe(String(now));
  });

  test("does not reload non-chunk errors", () => {
    const reload = vi.fn();
    expect(
      recoverFromChunkLoadError(new Error("boom"), {
        storage: memoryStorage(),
        reload,
      }),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test("skips a second reload inside the cooldown window", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const first = 5_000_000;

    recoverFromChunkLoadError(new Error("ChunkLoadError: fail"), {
      storage,
      now: () => first,
      reload,
    });
    const second = recoverFromChunkLoadError(
      new TypeError("Failed to fetch dynamically imported module"),
      {
        storage,
        now: () => first + CHUNK_RELOAD_COOLDOWN_MS - 1,
        reload,
      },
    );

    expect(second).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("allows another reload after the cooldown expires", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const first = 5_000_000;

    recoverFromChunkLoadError(new Error("Importing a module script failed."), {
      storage,
      now: () => first,
      reload,
    });
    const second = recoverFromChunkLoadError(
      new TypeError("Failed to fetch dynamically imported module"),
      {
        storage,
        now: () => first + CHUNK_RELOAD_COOLDOWN_MS,
        reload,
      },
    );

    expect(second).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("installChunkLoadRecoveryHandlers", () => {
  test("recovers from unhandledrejection chunk errors", () => {
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    };
    const reload = vi.fn();
    const dispose = installChunkLoadRecoveryHandlers(target as unknown as Window, {
      storage: memoryStorage(),
      reload,
      now: () => 10,
    });

    const event = {
      reason: new TypeError("Failed to fetch dynamically imported module"),
      preventDefault: vi.fn(),
    };
    listeners.get("unhandledrejection")?.(event as unknown as Event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);

    dispose();
    expect(listeners.size).toBe(0);
  });
});
