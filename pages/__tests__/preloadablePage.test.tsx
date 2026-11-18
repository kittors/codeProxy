import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense, type ComponentType } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { pendingPageLoad, preloadablePage } from "../preloadablePage";
import * as recovery from "../chunkLoadRecovery";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("preloadablePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("loads the page module and renders it", async () => {
    const { Page, preload } = preloadablePage(async () => ({
      default: () => <div>loaded-page</div>,
    }));

    await act(async () => {
      await preload();
    });

    render(
      <Suspense fallback={<div>loading</div>}>
        <Page />
      </Suspense>,
    );

    expect(screen.getByText("loaded-page")).toBeInTheDocument();
  });

  test("clears a failed load so a later preload can retry", async () => {
    const recover = vi.spyOn(recovery, "recoverFromChunkLoadError").mockReturnValue(false);
    let attempts = 0;
    const { Page, preload } = preloadablePage(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError("Failed to fetch dynamically imported module");
      }
      return { default: () => <div>recovered-page</div> };
    });

    await expect(preload()).rejects.toThrow(/dynamically imported module/);
    expect(recover).toHaveBeenCalledTimes(1);

    await act(async () => {
      await preload();
    });

    render(
      <Suspense fallback={<div>loading</div>}>
        <Page />
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getByText("recovered-page")).toBeInTheDocument();
    });
    expect(attempts).toBe(2);
  });
});

describe("pendingPageLoad", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("starts the load and hands out one promise to wait on until the code is in", async () => {
    const module = deferred<{ default: ComponentType }>();
    const load = vi.fn(() => module.promise);
    const { preload } = preloadablePage(load);

    const pending = pendingPageLoad(preload);
    expect(pending).toBeInstanceOf(Promise);
    expect(pendingPageLoad(preload)).toBe(pending);
    expect(load).toHaveBeenCalledTimes(1);

    module.resolve({ default: () => <div>page</div> });
    await expect(pending).resolves.toBeUndefined();
    expect(pendingPageLoad(preload)).toBeNull();
  });

  test("settles instead of rejecting when the load fails, then stops holding the page back", async () => {
    vi.spyOn(recovery, "recoverFromChunkLoadError").mockReturnValue(false);
    const module = deferred<{ default: ComponentType }>();
    const { preload } = preloadablePage(() => module.promise);

    const pending = pendingPageLoad(preload);
    module.reject(new TypeError("Failed to fetch dynamically imported module"));
    await expect(pending).resolves.toBeUndefined();
    // 失败后照常渲染，由 Page 重新抛出加载、走原来的失败处理
    expect(pendingPageLoad(preload)).toBeNull();
  });

  test("ignores preload functions that preloadablePage did not create", () => {
    expect(pendingPageLoad(() => Promise.resolve())).toBeNull();
    expect(pendingPageLoad(undefined)).toBeNull();
  });
});
