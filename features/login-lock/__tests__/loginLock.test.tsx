import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  formatLockCountdown,
  isFailureForUsername,
  LoginLockMessage,
  useLoginLockCountdown,
} from "..";

function Countdown({ lockedUntil }: { lockedUntil?: number }) {
  const seconds = useLoginLockCountdown(lockedUntil);
  return <output>{seconds}</output>;
}

describe("useLoginLockCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T09:47:35Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("counts the lock down once a second and stops at zero", () => {
    render(<Countdown lockedUntil={Date.now() + 3_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("3");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("2");

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("0");
    // The interval clears itself once the lock lapses instead of ticking forever.
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a new lock shows its own remaining time on the first render", () => {
    const { rerender } = render(<Countdown />);
    expect(screen.getByRole("status")).toHaveTextContent("0");

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    // Ten minutes after mount a five-minute lock arrives: the first frame must
    // read 300, not a figure computed from the mount time.
    rerender(<Countdown lockedUntil={Date.now() + 300_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("300");
  });
});

describe("formatLockCountdown", () => {
  test.each([
    [0, "0:00"],
    [1, "0:01"],
    [59, "0:59"],
    [60, "1:00"],
    [272, "4:32"],
    [3_600, "60:00"],
    [59.2, "1:00"],
  ])("%s seconds → %s", (seconds, expected) => {
    expect(formatLockCountdown(seconds)).toBe(expected);
  });
});

describe("isFailureForUsername", () => {
  test("locks and attempt counts belong to the account that was tried", () => {
    const failure = { message: "locked", lockedUntil: 1, username: "admin" };
    expect(isFailureForUsername(failure, "  Admin ")).toBe(true);
    expect(isFailureForUsername(failure, "operator")).toBe(false);
    expect(isFailureForUsername(null, "admin")).toBe(false);
    // Without an account (a lock on the address, say) it applies to everyone.
    expect(isFailureForUsername({ message: "locked", lockedUntil: 1 }, "anyone")).toBe(true);
  });
});

describe("LoginLockMessage", () => {
  const t = (key: string, options?: Record<string, unknown>) =>
    `${key} ${String(options?.time ?? "")}`.trim();

  test("without an announcement it is just the current countdown", () => {
    render(<LoginLockMessage t={t} seconds={95} />);
    expect(screen.getByText("login.locked_notice 1:35")).not.toHaveAttribute("aria-hidden");
  });

  test("inside a live region it announces only the fixed sentence", () => {
    render(
      <div role="alert">
        <LoginLockMessage t={t} seconds={95} announcement="Try again in 2 minutes." />
      </div>,
    );
    const visible = screen.getByText("login.locked_notice 1:35");
    // The ticking text must stay out of the live region, or a screen reader
    // would be interrupted every second.
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Try again in 2 minutes.");
  });
});
