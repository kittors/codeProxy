import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { useSatinFloatingLayer } from "../overlays/useSatinFloatingLayer";

/**
 * 表头筛选、筛选区分面、视图设置共用的 Satin 原生浮层：
 * - 定位与防溢出直连 Satin `computeFloating`；
 * - 外部点击 / Esc / 平级互斥直连 Satin `dismiss.js` 浮层栈；
 * - 双向弹性微动效使用 Satin `.sn-pop.sn-open` / `.sn-up` 原生过渡与 `@starting-style`；
 * - 经 `resolvePortalContainer(anchor)` 挂载，自动兼容原生 `<dialog>` Top Layer。
 */

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
  const anchorRef = useRef<HTMLElement | null>(anchor);
  if (anchor) anchorRef.current = anchor;

  const floating = useSatinFloatingLayer({
    open,
    anchorRef,
    panelRef,
    placement: "bottom",
    align,
    gap: 6,
    margin: 8,
    onClose: () => onClose(),
  });

  // 打开后把焦点放进浮层；关闭时还给锚点（锚点还在文档里才还）。
  useEffect(() => {
    if (!open || !floating.mounted) return undefined;
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
  }, [anchor, floating.mounted, open]);

  if (typeof document === "undefined" || !floating.mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      aria-hidden={floating.isOpen ? undefined : true}
      data-grid-popover=""
      data-state={floating.isOpen ? "open" : "closed"}
      className={[
        "sn-pop !z-[1000] border border-[var(--sn-line)] [--cp-backdrop:var(--sn-overlay)]",
        floating.up ? "sn-up" : "",
        floating.isOpen ? "sn-open" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        top: floating.top,
        left: floating.left,
        transformOrigin: floating.origin,
      }}
    >
      {children}
    </div>,
    resolvePortalContainer(anchorRef.current),
  );
}
