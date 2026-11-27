import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayPresence } from "../overlays/overlayMotion";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { POPOVER_EXIT_MS } from "../utils/motion";

/**
 * 表头筛选、筛选区分面、视图设置共用的 Satin 浮层（零 framer-motion）。
 *
 * - 使用 Satin 原生 `.sn-pop` / `.sn-open` / `.sn-up` 双向弹性微动效（160ms 淡入、220ms `--sn-ease-out-strong` 落位）；
 * - 经 `resolvePortalContainer(anchor)` 挂载，普通页面挂到 `document.body`，位于原生 `<dialog>` 弹窗内时自动挂进
 *   Top Layer 宿主，永远不被表格滚动视口裁切，也不被 `<dialog>` 遮挡；
 * - 打开时把焦点移进浮层（优先 `data-autofocus`），关闭时还给触发按钮；Esc 与点外部关闭。
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
  const { mounted, visible } = useOverlayPresence(open, POPOVER_EXIT_MS);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastAnchorRef = useRef<HTMLElement | null>(anchor);
  if (anchor) lastAnchorRef.current = anchor;
  const activeAnchor = anchor ?? lastAnchorRef.current;

  const [position, setPosition] = useState<{
    top: number;
    left: number;
    origin: string;
    up: boolean;
  } | null>(null);

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
    const up = !fitsBelow;
    setPosition((prev) =>
      prev && prev.top === top && prev.left === left && prev.origin === origin && prev.up === up
        ? prev
        : { top, left, origin, up },
    );
  }, [align, anchor]);

  useLayoutEffect(() => {
    // 关闭时不清位置：退场动画期间浮层还在原处淡出，清掉会让它闪到屏幕外。
    if (!open || !mounted) return undefined;
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
  }, [mounted, open, updatePosition]);

  // 打开后把焦点放进浮层；关闭时还给锚点（锚点还在文档里才还）。
  useEffect(() => {
    if (!open || !mounted) return undefined;
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
  }, [anchor, mounted, open]);

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
      event.preventDefault();
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

  if (typeof document === "undefined" || !mounted) return null;

  const isShown = visible && open && Boolean(position);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      data-grid-popover=""
      data-state={isShown ? "open" : "closed"}
      className={[
        "sn-pop !z-[1000] border border-[var(--sn-line)] [--cp-backdrop:var(--sn-overlay)]",
        position?.up ? "sn-up" : "",
        isShown ? "sn-open" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        transformOrigin: position?.origin ?? "top left",
      }}
    >
      {children}
    </div>,
    resolvePortalContainer(activeAnchor),
  );
}
