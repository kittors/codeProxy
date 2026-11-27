import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cssEase,
  DRAWER_ENTER_MS,
  DRAWER_EXIT_MS,
  EASE_IN,
  EASE_OPEN,
  EASE_OUT,
  EASE_POP,
  OVERLAY_BACKDROP_ENTER_MS,
  OVERLAY_ENTER_MS,
  OVERLAY_EXIT_MS,
  OVERLAY_PANEL_EXIT_MS,
  OVERLAY_TRANSFORM_ENTER_MS,
} from "../utils/motion";

/**
 * 弹窗 / 抽屉 / 预览层的挂载与可见状态（遵循 Satin `twoFrames` 两帧起播规范）：
 *
 * - 打开：先挂载，隔两帧再置为可见，避免 showModal / 首帧布局重算吃掉动画开头；
 * - 关闭：先置为不可见，等退场动画播完（默认 `OVERLAY_EXIT_MS = 180ms`，抽屉传 `DRAWER_EXIT_MS = 220ms`）再卸载；
 *   期间再次打开会立即取消卸载定时器。
 */
export function useOverlayPresence(open: boolean, exitMs = OVERLAY_EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setMounted(true);
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        if (raf2) window.cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setMounted(false);
      timeoutRef.current = null;
    }, exitMs);
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [exitMs, open]);

  return { mounted, visible };
}

type MotionProps = { className: string; style: CSSProperties };

/**
 * Satin 遮罩过渡：200ms `--sn-ease-out` 淡入，180ms `--sn-ease-in` 与面板同节奏收起（只压暗、不模糊）。
 */
export const overlayBackdropMotion = (visible: boolean): MotionProps => ({
  className: [
    "transition-opacity motion-reduce:transition-none",
    visible ? "opacity-100" : "opacity-0",
  ].join(" "),
  style: {
    transitionDuration: `${visible ? OVERLAY_BACKDROP_ENTER_MS : OVERLAY_EXIT_MS}ms`,
    transitionTimingFunction: cssEase(visible ? EASE_OUT : EASE_IN),
  },
});

/**
 * Satin 弹窗面板过渡（供非 `<dialog>` 场景使用，时长与曲线严格对齐 `overlay.js`）：
 * 进场透明度 140ms `--sn-ease-out`，缩放 300ms `--sn-ease-out-strong`（0.96 -> 1）；
 * 退场 180ms `--sn-ease-in`（1 -> 0.97）。
 */
export const overlayPanelMotion = (visible: boolean, closing: boolean): MotionProps => ({
  className: [
    "transition-[opacity,scale] will-change-[opacity,scale]",
    "motion-reduce:transition-none motion-reduce:scale-none",
    visible
      ? "scale-100 opacity-100"
      : closing
        ? "scale-[0.97] opacity-0"
        : "scale-[0.96] opacity-0",
  ].join(" "),
  style: visible
    ? {
        transitionDuration: `${OVERLAY_ENTER_MS}ms, ${OVERLAY_TRANSFORM_ENTER_MS}ms`,
        transitionTimingFunction: `${cssEase(EASE_OUT)}, ${cssEase(EASE_POP)}`,
      }
    : {
        transitionDuration: `${OVERLAY_PANEL_EXIT_MS}ms`,
        transitionTimingFunction: cssEase(EASE_IN),
      },
});

/**
 * Satin 抽屉面板过渡（严格对齐 `overlay.css` `.sn-drawer`）：
 * 进场 320ms `--sn-ease-open` 从右侧滑入，退场 220ms `--sn-ease-in` 滑出。
 */
export const drawerPanelMotion = (visible: boolean): MotionProps => ({
  className: [
    "transition-transform will-change-transform motion-reduce:transition-none",
    visible ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
  ].join(" "),
  style: {
    transitionDuration: `${visible ? DRAWER_ENTER_MS : DRAWER_EXIT_MS}ms`,
    transitionTimingFunction: cssEase(visible ? EASE_OPEN : EASE_IN),
  },
});
