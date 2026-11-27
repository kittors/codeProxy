import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DRAWER_EXIT_MS, OVERLAY_EXIT_MS } from "../../utils/motion";
import { Drawer } from "../Drawer";
import { Modal } from "../Modal";

/** 走完「挂载 → 隔两帧 → 可见」：两次 requestAnimationFrame（对齐 Satin twoFrames）。 */
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

  test("a modal mounted already open uses native <dialog.sn-dlg> and plays Satin twoFrames WAAPI entrance", () => {
    const animateSpy = vi.spyOn(Element.prototype, "animate");
    render(
      <Modal open title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );

    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveClass("sn-dlg", "cp-modal-panel");
    expect(dialog.open).toBe(true);
    // 进场起点：挂载后以透明态等待两帧，避免 showModal 重算吞掉首帧。
    expect(dialog).toHaveAttribute("data-state", "entering");
    expect(dialog).not.toHaveClass("sn-shown");

    flushTwoFrames();
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog).toHaveClass("sn-shown");
    // 验证 Satin 权威 WAAPI 缩放（300ms cubic-bezier(0.22, 1, 0.36, 1)）与淡入（140ms cubic-bezier(0, 0, 0.58, 1)）。
    expect(animateSpy).toHaveBeenCalledWith(
      [{ transform: "scale(0.96)" }, { transform: "none" }],
      expect.objectContaining({ duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }),
    );
    expect(animateSpy).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      expect.objectContaining({ duration: 140, easing: "cubic-bezier(0, 0, 0.58, 1)" }),
    );
    animateSpy.mockRestore();
  });

  test("closing plays Satin 180ms exit animation, removes sn-shown, and unmounts after OVERLAY_EXIT_MS", () => {
    const animateSpy = vi.spyOn(Element.prototype, "animate");
    const { rerender } = render(
      <Modal open title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    flushTwoFrames();
    animateSpy.mockClear();

    rerender(
      <Modal open={false} title="Rename" onClose={() => undefined}>
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-state", "closing");
    expect(dialog).not.toHaveClass("sn-shown");
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(animateSpy).toHaveBeenCalledWith(
      [{ transform: "none" }, { transform: "scale(0.97)" }],
      expect.objectContaining({
        duration: 180,
        easing: "cubic-bezier(0.42, 0, 1, 1)",
        fill: "forwards",
      }),
    );

    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS - 1);
    });
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    animateSpy.mockRestore();
  });

  test("reopening during the exit keeps the modal mounted and restores open state", () => {
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
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog).toHaveClass("sn-shown");
  });

  test("the drawer uses Satin .sn-drawer and slides in after two frames, unmounting after DRAWER_EXIT_MS", () => {
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
    expect(panel).toHaveClass("sn-drawer", "cp-drawer-panel");
    expect(panel).not.toHaveClass("sn-open");

    flushTwoFrames();
    expect(panel).toHaveClass("sn-open");

    rerender(
      <Drawer open={false} title="Details" onClose={() => undefined}>
        body
      </Drawer>,
    );
    expect(panel).not.toHaveClass("sn-open");
    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS - 1);
    });
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
