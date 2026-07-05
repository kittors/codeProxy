import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@code-proxy/ui";
import { preloadPageRoute } from "@pages/registry";
import { AppShell } from "./AppShell";

vi.mock("@pages/registry", () => ({
  preloadPageRoute: vi.fn(() => Promise.resolve()),
}));

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell>
          <div>Dashboard route</div>
          <LocationEcho />
        </AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("AppShell route progress", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(preloadPageRoute).mockClear();
  });

  test("preloads the target route before navigating from the current page", async () => {
    vi.useFakeTimers();
    let resolvePreload: (() => void) | undefined;
    vi.mocked(preloadPageRoute).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePreload = resolve;
      }),
    );
    renderShell();

    const link = document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    expect(preloadPageRoute).toHaveBeenCalledWith("/ai-providers");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(680);
    });

    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    await act(async () => {
      resolvePreload?.();
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("animates a fixed window-top progress bar during sidebar navigation", async () => {
    vi.useFakeTimers();
    renderShell();

    const link = document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    await act(async () => {
      vi.advanceTimersByTime(680);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("restarts the progress animation on rapid sidebar navigation", async () => {
    vi.useFakeTimers();
    renderShell();

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]')!);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/models"]')!);

    await act(async () => {
      vi.advanceTimersByTime(679);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/models");
  });

  test("lets modified clicks keep the browser's native link behavior", () => {
    vi.useFakeTimers();
    renderShell();

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]')!, {
      ctrlKey: true,
    });

    expect(preloadPageRoute).not.toHaveBeenCalled();
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });
});
