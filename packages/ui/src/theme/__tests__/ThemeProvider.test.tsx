import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ThemeToggleButton } from "../ThemeProvider";

const THEME_STORAGE_KEY = "code-proxy-admin-theme";
const THEME_TRANSITION_LOCK_CLASS = "theme-transition-lock";

describe("ThemeProvider", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  function mockSystemTheme(initialMatches: boolean) {
    let matches = initialMatches;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return matches;
          },
          media: query,
          onchange: null,
          addEventListener: (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener);
          },
          removeEventListener: (
            _type: "change",
            listener: (event: MediaQueryListEvent) => void,
          ) => {
            listeners.delete(listener);
          },
          addListener: (listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener);
          },
          removeListener: (listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener);
          },
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    return {
      setMatches(next: boolean) {
        matches = next;
        const event = {
          matches: next,
          media: "(prefers-color-scheme: dark)",
        } as MediaQueryListEvent;
        listeners.forEach((listener) => listener(event));
      },
    };
  }

  test("locks transitions while applying a manual dark mode switch", () => {
    vi.useFakeTimers();
    mockSystemTheme(false);
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });

    render(
      <ThemeProvider>
        <ThemeToggleButton />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement).toHaveClass(THEME_TRANSITION_LOCK_CLASS);
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    act(() => {
      rafCallbacks.shift()?.(0);
      rafCallbacks.shift()?.(16);
    });

    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(document.documentElement).toHaveClass(THEME_TRANSITION_LOCK_CLASS);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.documentElement).not.toHaveClass(THEME_TRANSITION_LOCK_CLASS);
  });

  test("keeps auto mode synced with the system theme", () => {
    const systemTheme = mockSystemTheme(false);

    render(
      <ThemeProvider>
        <ThemeToggleButton />
      </ThemeProvider>,
    );

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("auto");
    expect(document.documentElement.style.colorScheme).toBe("light");

    act(() => {
      systemTheme.setMatches(true);
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("auto");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
