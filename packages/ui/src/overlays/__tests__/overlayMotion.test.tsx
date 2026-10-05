import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Drawer } from "../Drawer";
import { Modal } from "../Modal";
import { OVERLAY_EXIT_MS } from "../../utils/motion";

/** 走完「挂载 → 隔两帧 → 可见」：两次 requestAnimationFrame。 */
const flushTwoFrames = () => {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
};

describe("overlay presence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a modal mounted already open still plays its entrance", () => {
    render(
      <Modal open title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );

    const panel = screen.getByRole("dialog");
    // 进场起点：在下方、略小、透明。
    expect(panel).toHaveClass("opacity-0", "translate-y-3", "scale-[0.96]");

    flushTwoFrames();
    expect(panel).toHaveClass("opacity-100", "translate-y-0", "scale-100");
    expect(panel.style.transitionTimingFunction).toContain("cubic-bezier(0.16, 1, 0.3, 1)");
  });

  test("closing fades the panel out first and unmounts after the backdrop", () => {
    const { rerender } = render(
      <Modal open title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    flushTwoFrames();

    rerender(
      <Modal open={false} title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    const panel = screen.getByRole("dialog");
    // 退场终点比进场起点收敛：只缩到 0.98、下沉一点。
    expect(panel).toHaveClass("opacity-0", "translate-y-1", "scale-[0.98]");
    expect(panel.style.transitionDuration).toBe("150ms");
    expect(screen.getByText("Rename")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS - 1);
    });
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("reopening during the exit keeps the modal mounted", () => {
    const { rerender } = render(
      <Modal open title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    flushTwoFrames();
    rerender(
      <Modal open={false} title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS / 2);
    });
    rerender(
      <Modal open title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS);
    });
    flushTwoFrames();
    expect(screen.getByRole("dialog")).toHaveClass("opacity-100");
  });

  test("the drawer slides in from off-screen instead of popping in", () => {
    const { rerender } = render(
      <Drawer open={false} title="Details" onClose={() => undefined}>
        body
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <Drawer open title="Details" onClose={() => undefined}>
        body
      </Drawer>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveClass("translate-x-[calc(100%+1rem)]");

    flushTwoFrames();
    expect(panel).toHaveClass("translate-x-0");
  });
});
