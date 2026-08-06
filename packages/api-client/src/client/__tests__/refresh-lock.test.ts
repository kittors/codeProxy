import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { REFRESH_LOCK_STORAGE_KEY, withRefreshLock } from "../refresh-lock";
import { REFRESH_LOCK_TTL_MS } from "../constants";

const neverWaited = async (): Promise<string | null> => null;

/** Minimal Storage whose writes fail, mimicking private mode / exhausted quota. */
const unwritableStorage = (): Storage =>
  ({
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  }) as unknown as Storage;

describe("withRefreshLock", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(navigator, "locks");
  });

  test("uses the localStorage claim when Web Locks is unavailable (jsdom default)", async () => {
    const result = await withRefreshLock(async () => "value", neverWaited);

    expect(result).toEqual({ mode: "storage", acquired: true, value: "value" });
    // The claim must not outlive the critical section.
    expect(localStorage.getItem(REFRESH_LOCK_STORAGE_KEY)).toBeNull();
  });

  // F2: two tabs hitting 401 at the same instant must produce ONE refresh call.
  test("a concurrent caller adopts the winner's result instead of refreshing again", async () => {
    let fetchCount = 0;
    let rotated: string | null = null;
    const fn = async (): Promise<string> => {
      fetchCount += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      rotated = "cps_a2";
      return rotated;
    };
    const onWaited = async (): Promise<string | null> => rotated;

    const [winner, loser] = await Promise.all([
      withRefreshLock(fn, onWaited),
      withRefreshLock(fn, onWaited),
    ]);

    expect(fetchCount).toBe(1);
    expect(winner).toEqual({ mode: "storage", acquired: true, value: "cps_a2" });
    expect(loser).toEqual({ mode: "storage", acquired: false, value: "cps_a2" });
  });

  test("a claim older than the TTL is preempted", async () => {
    localStorage.setItem(
      REFRESH_LOCK_STORAGE_KEY,
      JSON.stringify({ owner: "dead-tab", acquiredAt: Date.now() - REFRESH_LOCK_TTL_MS - 1 }),
    );

    const result = await withRefreshLock(async () => "value", neverWaited);

    expect(result.acquired).toBe(true);
    expect(result.value).toBe("value");
  });

  test("a throwing critical section still releases the claim", async () => {
    await expect(
      withRefreshLock(async () => {
        throw new Error("refresh exploded");
      }, neverWaited),
    ).rejects.toThrow("refresh exploded");

    expect(localStorage.getItem(REFRESH_LOCK_STORAGE_KEY)).toBeNull();
  });

  test("unwritable storage degrades to in-process and still runs the work once", async () => {
    let calls = 0;
    const result = await withRefreshLock(
      async () => {
        calls += 1;
        return "value";
      },
      neverWaited,
      { storage: unwritableStorage(), locks: null },
    );

    expect(result).toEqual({ mode: "in-process", acquired: true, value: "value" });
    expect(calls).toBe(1);
  });

  test("Web Locks is used when the API exists, without consulting isSecureContext", async () => {
    const request = vi.fn(
      async (_name: string, _options: LockOptions, callback: (lock: unknown) => unknown) =>
        await callback({ name: _name, mode: "exclusive" }),
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request } as unknown as LockManager,
    });

    const result = await withRefreshLock(async () => "value", neverWaited);

    expect(result).toEqual({ mode: "web-locks", acquired: true, value: "value" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]).toEqual({ ifAvailable: true });
    // The storage fallback must not have been touched.
    expect(localStorage.getItem(REFRESH_LOCK_STORAGE_KEY)).toBeNull();
  });
});
