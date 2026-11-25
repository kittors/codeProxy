import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { popoverEnterTransition, popoverExitTransition } from "../utils/motion";

/**
 * 表头筛选、筛选区分面、视图设置共用的浮层。
 *
 * 一律 portal 到 body：表格视口有滚动、遮罩和 overflow 裁剪，浮层放在里面会被裁掉
 * （见计划 104 引用的「浮层一律 portal」）。定位读锚点的 getBoundingClientRect，
 * 下方放不下就翻到上方，左右夹在视口内；表格横向滚动、窗口缩放时跟着锚点走。
 * 打开时把焦点移进浮层（优先 data-autofocus），关闭时还给触发按钮；Esc 与点外部关闭。
 */

const GAP = 6;
const VIEWPORT_PADDING = 8;

export interface GridPopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  /** 对齐锚点的左边还是右边。 */
  align?: "start" | "end";
  label: string;
  className?: string;
  children: ReactNode;
}

export function GridPopover({
  anchor,
  open,
  onClose,
  align = "start",
  label,
  className,
  children,
}: GridPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; origin: string } | null>(
    null,
  );
  const reduceMotion = useReducedMotion();

  const updatePosition = useCallback(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const below = rect.bottom + GAP;
    const fitsBelow = below + height <= viewportHeight - VIEWPORT_PADDING;
    const top = fitsBelow ? below : Math.max(VIEWPORT_PADDING, rect.top - GAP - height);
    const preferredLeft = align === "end" ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, preferredLeft),
      Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING),
    );
    const originX = align === "end" ? "right" : "left";
    const origin = `${fitsBelow ? "top" : "bottom"} ${originX}`;
    setPosition((prev) =>
      prev && prev.top === top && prev.left === left && prev.origin === origin
        ? prev
        : { top, left, origin },
    );
  }, [align, anchor]);

  useLayoutEffect(() => {
    // 关闭时不清位置：退场动画期间浮层还在原处淡出，清掉会让它闪到屏幕外。
    if (!open) return undefined;
    updatePosition();
    const panel = panelRef.current;
    const observer =
      typeof ResizeObserver === "undefined" || !panel ? null : new ResizeObserver(updatePosition);
    if (panel) observer?.observe(panel);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  // 打开后把焦点放进浮层；关闭时还给锚点（锚点还在文档里才还）。
  useEffect(() => {
    if (!open) return undefined;
    // 打开期间面板节点不变（退场动画时也还在），在这里取一次，清理时用同一个节点判断焦点。
    const panel = panelRef.current;
    const frame = window.requestAnimationFrame(() => {
      if (!panel || panel.contains(document.activeElement)) return;
      const target =
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.querySelector<HTMLElement>(
          "input, button:not([disabled]), [tabindex]:not([tabindex='-1'])",
        );
      target?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (anchor?.isConnected && panel?.contains(document.activeElement)) {
        anchor.focus({ preventScroll: true });
      }
    };
  }, [anchor, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor, onClose, open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="grid-popover"
          ref={panelRef}
          role="dialog"
          aria-label={label}
          data-grid-popover=""
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: popoverEnterTransition }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: popoverExitTransition }
              : { opacity: 0, scale: 0.98, y: -2, transition: popoverExitTransition }
          }
          className={[
            "fixed z-[1000] rounded-[var(--sn-r-lg)] border border-[var(--sn-line)] bg-[var(--sn-overlay)] text-[var(--sn-label)] shadow-[var(--sn-e1)]",
            "[--cp-backdrop:var(--sn-overlay)]",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            transformOrigin: position?.origin ?? "top left",
            visibility: position ? "visible" : "hidden",
          }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
