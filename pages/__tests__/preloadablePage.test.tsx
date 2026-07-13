import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { preloadablePage } from "../preloadablePage";
import * as recovery from "../chunkLoadRecovery";

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
