import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ThemeToggleButton } from "../ThemeProvider";

const THEME_STORAGE_KEY = "code-proxy-admin-theme";
const THEME_TRANSITION_LOCK_CLASS = "theme-transition-lock";

describe("ThemeProvider", () => {
  beforeEach(() => {
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

  test("locks transitions while applying a manual dark mode switch", () => {
    vi.useFakeTimers();
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

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark" }));

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
});
