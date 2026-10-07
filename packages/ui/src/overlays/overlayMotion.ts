import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cssEase,
  EASE_IN,
  EASE_OUT,
  EASE_POP,
  OVERLAY_ENTER_MS,
  OVERLAY_EXIT_MS,
  OVERLAY_PANEL_EXIT_MS,
  OVERLAY_TRANSFORM_ENTER_MS,
} from "../utils/motion";

/**
 * 弹窗 / 抽屉的挂载与可见状态（CSS 过渡驱动的覆盖层共用）。
 *
 * - 打开：先挂载，隔两帧再置为可见。只隔一帧时，挂载和「可见」常常落在同一次样式计算里，
 *   浏览器从没见过「隐藏」那一帧，过渡没有起点，面板直接跳出来——抽屉以前就是这样。
 *   一挂载就是打开状态（父组件条件渲染 `<Modal open />`）也照样走进场。
 * - 关闭：先置为不可见，等遮罩褪完（OVERLAY_EXIT_MS）再卸载；期间再次打开会取消卸载。
 */
export function useOverlayPresence(open: boolean) {
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
    }, OVERLAY_EXIT_MS);
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [open]);

  return { mounted, visible };
}

type MotionProps = { className: string; style: CSSProperties };

/**
 * 遮罩：200ms 淡入；退场同样 200ms 但走 ease-in——起步慢，面板（150ms）先走完，
 * 压暗随后才褪去，关闭时不会整块一起闪掉。只压暗、不模糊。
 */
export const overlayBackdropMotion = (visible: boolean): MotionProps => ({
  className: [
    "transition-opacity motion-reduce:transition-none",
    visible ? "opacity-100" : "opacity-0",
  ].join(" "),
  style: {
    transitionDuration: `${visible ? OVERLAY_ENTER_MS : OVERLAY_EXIT_MS}ms`,
    transitionTimingFunction: cssEase(visible ? EASE_OUT : EASE_IN),
  },
});

/**
 * 弹窗面板：进场透明度 200ms 减速淡入，位移 / 缩放用 EASE_POP 走 320ms，从下方 12px、0.96
 * 落到位——一下就出现，再轻轻落稳，不回弹。退场 150ms ease-in，只缩到 0.98、下沉 4px：
 * 关闭要干脆，不必把进场倒放一遍。
 *
 * `closing` 区分「刚挂载、还没可见」（进场起点）与「正在关闭」（退场终点）两种不可见状态。
 *
 * 注意 Tailwind v4 的 translate-* / scale-* 写的是独立的 `translate` / `scale` 属性，不是
 * `transform`：过渡列表里只写 transform 的话，位移和缩放会直接跳变、只剩淡入——旧弹窗就是这样，
 * 看着是「闪一下就到位」。所以这里列的是 [opacity, translate, scale]，与内联的时长、曲线一一对应。
 */
export const overlayPanelMotion = (visible: boolean, closing: boolean): MotionProps => ({
  className: [
    "transition-[opacity,translate,scale] will-change-[opacity,translate,scale]",
    "motion-reduce:transition-none motion-reduce:translate-none motion-reduce:scale-none",
    visible
      ? "translate-y-0 scale-100 opacity-100"
      : closing
        ? "translate-y-1 scale-[0.98] opacity-0"
        : "translate-y-3 scale-[0.96] opacity-0",
  ].join(" "),
  style: visible
    ? {
        transitionDuration: `${OVERLAY_ENTER_MS}ms, ${OVERLAY_TRANSFORM_ENTER_MS}ms, ${OVERLAY_TRANSFORM_ENTER_MS}ms`,
        transitionTimingFunction: `${cssEase(EASE_OUT)}, ${cssEase(EASE_POP)}, ${cssEase(EASE_POP)}`,
      }
    : {
        transitionDuration: `${OVERLAY_PANEL_EXIT_MS}ms`,
        transitionTimingFunction: cssEase(EASE_IN),
      },
});

/**
 * 抽屉面板：从右侧滑入，EASE_POP 走 320ms；退场 200ms ease-in 滑出（面板大、位移长，
 * 比弹窗多给 50ms）。收起时多推出 1rem，把面板与屏幕边缘之间的间距也一起带走，不留一条阴影。
 */
export const drawerPanelMotion = (visible: boolean): MotionProps => ({
  className: [
    "transition-transform will-change-transform motion-reduce:transition-none",
    visible ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
  ].join(" "),
  style: {
    transitionDuration: `${visible ? OVERLAY_TRANSFORM_ENTER_MS : OVERLAY_EXIT_MS}ms`,
    transitionTimingFunction: cssEase(visible ? EASE_POP : EASE_IN),
  },
});

/**
 * framer-motion 版本，给自绘的 framer 弹窗用（initial="hidden" animate="show" exit="exit"）：
 * 与上面 CSS 版同一组时长与曲线，进场起点与退场终点同样分开。
 */
export const overlayBackdropVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: OVERLAY_ENTER_MS / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: OVERLAY_EXIT_MS / 1000, ease: EASE_IN } },
} as const;

export const overlayPanelVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: OVERLAY_TRANSFORM_ENTER_MS / 1000,
      ease: EASE_POP,
      opacity: { duration: OVERLAY_ENTER_MS / 1000, ease: EASE_OUT },
    },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.98,
    transition: { duration: OVERLAY_PANEL_EXIT_MS / 1000, ease: EASE_IN },
  },
} as const;
