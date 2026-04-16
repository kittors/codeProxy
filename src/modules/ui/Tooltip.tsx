import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipPlacement = "top" | "right" | "bottom" | "left";

const PLACEMENT_CLASS: Record<TooltipPlacement, string> = {
  top: "left-1/2 -translate-x-1/2 bottom-full mb-2",
  bottom: "left-1/2 -translate-x-1/2 top-full mt-2",
  right: "left-full ml-2 top-1/2 -translate-y-1/2",
  left: "right-full mr-2 top-1/2 -translate-y-1/2",
};

function _TooltipBubble({
  id,
  open,
  content,
  placement,
}: {
  id: string;
  open: boolean;
  content: string;
  placement: TooltipPlacement;
}) {
  return (
    <span
      id={id}
      role="tooltip"
      aria-hidden={!open}
      className={[
        "pointer-events-none absolute z-[99999] w-max max-w-[calc(100vw-2rem)] rounded-2xl border px-3 py-2 text-sm shadow-lg backdrop-blur sm:max-w-80",
        "border-slate-200 bg-white/95 text-slate-900 dark:border-neutral-800 dark:bg-neutral-950/90 dark:text-white",
        "motion-reduce:transition-none motion-safe:transition motion-safe:duration-150",
        open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-2px]",
        PLACEMENT_CLASS[placement],
      ].join(" ")}
    >
      <span className="block break-words">{content}</span>
    </span>
  );
}

/** Fixed-position tooltip rendered via portal — never clipped by overflow containers */
function FixedTooltipBubble({
  id,
  open,
  content,
  anchorRef,
  placement = "top",
}: {
  id: string;
  open: boolean;
  content: ReactNode;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: TooltipPlacement;
}) {
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", opacity: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipHeight = tooltipEl?.offsetHeight ?? 32;
    const tooltipWidth = tooltipEl?.offsetWidth ?? 200;

    let top: number;
    let left: number;

    switch (placement) {
      case "bottom":
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - 8;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + 8;
        break;
      case "top":
      default:
        top = rect.top - tooltipHeight - 8;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    top = Math.max(8, top);

    setStyle({ position: "fixed", top, left, zIndex: 99999, opacity: 1 });
  }, [open, anchorRef, placement]);

  if (!open) return null;

  return createPortal(
    <span
      ref={tooltipRef}
      id={id}
      role="tooltip"
      className="pointer-events-none w-max max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur transition-opacity duration-150 sm:max-w-80 dark:border-neutral-800 dark:bg-neutral-950/90 dark:text-white"
      style={style}
    >
      <span className="block break-words text-slate-900 dark:text-white">{content}</span>
    </span>,
    document.body,
  );
}

export function HoverTooltip({
  content,
  children,
  className,
  disabled = false,
  placement = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  placement?: TooltipPlacement;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    if (!content) return;
    if (typeof content === "string" && !content.trim()) return;
    setOpen(true);
  }, [content, disabled]);

  const hide = useCallback(() => setOpen(false), []);

  return (
    <span
      ref={ref}
      className={["relative inline-flex", className].filter(Boolean).join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={id}
    >
      {children}
      <FixedTooltipBubble
        id={id}
        open={open}
        content={content}
        anchorRef={ref}
        placement={placement}
      />
    </span>
  );
}

export function OverflowTooltip({
  content,
  children,
  className,
  placement = "top",
}: {
  content: string;
  children: ReactNode;
  className?: string;
  placement?: TooltipPlacement;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  const tryShow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!content.trim()) return;
    const isOverflowing = el.scrollWidth > el.clientWidth;
    if (!isOverflowing) return;
    setOpen(true);
  }, [content]);

  const hide = useCallback(() => setOpen(false), []);

  return (
    <span
      ref={ref}
      className={["relative", className].filter(Boolean).join(" ")}
      onMouseEnter={tryShow}
      onMouseLeave={hide}
      onFocus={tryShow}
      onBlur={hide}
      aria-describedby={id}
    >
      {children}
      <FixedTooltipBubble
        id={id}
        open={open}
        content={content}
        anchorRef={ref}
        placement={placement}
      />
    </span>
  );
}
