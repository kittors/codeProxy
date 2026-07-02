import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@code-proxy/ui";
import { AppShell } from "./AppShell";

function renderShell() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell>
          <div>Dashboard route</div>
        </AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("AppShell route progress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("animates a fixed window-top progress bar during sidebar navigation", () => {
    vi.useFakeTimers();
    renderShell();

    const link = document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(680);
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("restarts the progress animation on rapid sidebar navigation", () => {
    vi.useFakeTimers();
    renderShell();

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]')!);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/models"]')!);

    act(() => {
      vi.advanceTimersByTime(679);
    });

    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
  });
});
