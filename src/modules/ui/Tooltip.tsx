import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type TooltipPlacement = "top" | "right" | "bottom" | "left";

type TooltipPosition = {
  left: number;
  placement: TooltipPlacement;
  top: number;
};

type GlobalTooltipState = {
  anchor: HTMLElement;
  content: string;
  placement?: TooltipPlacement;
};

const TOOLTIP_OFFSET = 8;
const VIEWPORT_PADDING = 8;
const FALLBACK_PLACEMENTS: TooltipPlacement[] = ["bottom", "right", "left", "top"];

export const TooltipTriggerContext = createContext(false);

function isEmptyTooltipContent(content: ReactNode) {
  return content === null || content === undefined || content === false || content === "";
}

function parseTooltipPlacement(value: string | null): TooltipPlacement | undefined {
  if (value === "top" || value === "right" || value === "bottom" || value === "left") {
    return value;
  }
  return undefined;
}

function resolveIconButtonTooltip(target: EventTarget | null): GlobalTooltipState | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement)) return null;
  if (button.closest("[data-tooltip-managed='true']")) return null;

  const hasVisibleText = (button.textContent ?? "").trim().length > 0;
  if (hasVisibleText) return null;

  const content =
    button.getAttribute("data-tooltip") ||
    button.getAttribute("aria-label") ||
    button.getAttribute("title") ||
    "";
  const trimmedContent = content.trim();
  if (!trimmedContent) return null;

  return {
    anchor: button,
    content: trimmedContent,
    placement: parseTooltipPlacement(button.getAttribute("data-tooltip-placement")),
  };
}

function hideNativeTitle(button: HTMLElement) {
  const title = button.getAttribute("title");
  if (!title) return;
  button.dataset.tooltipNativeTitle = title;
  button.removeAttribute("title");
}

function restoreNativeTitle(button: HTMLElement | null | undefined) {
  if (!button?.dataset.tooltipNativeTitle) return;
  button.setAttribute("title", button.dataset.tooltipNativeTitle);
  delete button.dataset.tooltipNativeTitle;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.max(min, Math.min(value, max));
}

function getPlacementOrder(preferred: TooltipPlacement) {
  return [
    preferred,
    ...FALLBACK_PLACEMENTS.filter((placement) => placement !== preferred),
  ] satisfies TooltipPlacement[];
}

function getPlacementPosition(
  rect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
  placement: TooltipPlacement,
): TooltipPosition {
  switch (placement) {
    case "bottom":
      return {
        placement,
        top: rect.bottom + TOOLTIP_OFFSET,
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
      };
    case "left":
      return {
        placement,
        top: rect.top + rect.height / 2 - tooltipHeight / 2,
        left: rect.left - tooltipWidth - TOOLTIP_OFFSET,
      };
    case "top":
      return {
        placement,
        top: rect.top - tooltipHeight - TOOLTIP_OFFSET,
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
      };
    case "right":
    default:
      return {
        placement,
        top: rect.top + rect.height / 2 - tooltipHeight / 2,
        left: rect.right + TOOLTIP_OFFSET,
      };
  }
}

function fitsViewport(
  position: TooltipPosition,
  tooltipWidth: number,
  tooltipHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return (
    position.left >= VIEWPORT_PADDING &&
    position.top >= VIEWPORT_PADDING &&
    position.left + tooltipWidth <= viewportWidth - VIEWPORT_PADDING &&
    position.top + tooltipHeight <= viewportHeight - VIEWPORT_PADDING
  );
}

function resolveTooltipPosition({
  placement,
  rect,
  tooltipHeight,
  tooltipWidth,
  viewportHeight,
  viewportWidth,
}: {
  placement: TooltipPlacement;
  rect: DOMRect;
  tooltipHeight: number;
  tooltipWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const candidates = getPlacementOrder(placement).map((nextPlacement) =>
    getPlacementPosition(rect, tooltipWidth, tooltipHeight, nextPlacement),
  );
  const selected =
    candidates.find((candidate) =>
      fitsViewport(candidate, tooltipWidth, tooltipHeight, viewportWidth, viewportHeight),
    ) ?? candidates[0];

  return {
    ...selected,
    left: clamp(selected.left, VIEWPORT_PADDING, viewportWidth - tooltipWidth - VIEWPORT_PADDING),
    top: clamp(selected.top, VIEWPORT_PADDING, viewportHeight - tooltipHeight - VIEWPORT_PADDING),
  };
}

/** Fixed-position tooltip rendered via portal — never clipped by overflow containers */
export function TooltipBubble({
  id,
  open,
  content,
  anchorElement,
  anchorRef,
  placement = "bottom",
}: {
  id: string;
  open: boolean;
  content: ReactNode;
  anchorElement?: HTMLElement | null;
  anchorRef?: React.RefObject<HTMLElement | null>;
  placement?: TooltipPlacement;
}) {
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", opacity: 0 });

  const updatePosition = useCallback(() => {
    const anchor = anchorElement ?? anchorRef?.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipHeight = tooltipEl?.offsetHeight ?? 32;
    const tooltipWidth = tooltipEl?.offsetWidth ?? 200;
    const {
      left,
      top,
      placement: resolvedPlacement,
    } = resolveTooltipPosition({
      placement,
      rect,
      tooltipHeight,
      tooltipWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });

    setStyle({
      position: "fixed",
      top,
      left,
      zIndex: 99999,
      opacity: 1,
      ["--tooltip-placement" as string]: resolvedPlacement,
    });
  }, [anchorElement, anchorRef, placement]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition, content]);

  if (!open) return null;

  return createPortal(
    <span
      ref={tooltipRef}
      id={id}
      role="tooltip"
      className="pointer-events-none w-max max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur transition-opacity duration-150 sm:max-w-80 dark:border-neutral-800 dark:bg-neutral-950/90 dark:text-white"
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
  placement = "bottom",
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
  const hasContent = !isEmptyTooltipContent(content);

  const show = useCallback(() => {
    if (disabled) return;
    if (!hasContent) return;
    if (typeof content === "string" && !content.trim()) return;
    setOpen(true);
  }, [content, disabled, hasContent]);

  const hide = useCallback(() => setOpen(false), []);

  return (
    <span
      ref={ref}
      data-tooltip-managed="true"
      className={["relative inline-flex", className].filter(Boolean).join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={!disabled && hasContent ? id : undefined}
    >
      <TooltipTriggerContext.Provider value={true}>{children}</TooltipTriggerContext.Provider>
      <TooltipBubble id={id} open={open} content={content} anchorRef={ref} placement={placement} />
    </span>
  );
}

export function OverflowTooltip({
  content,
  children,
  className,
  placement = "bottom",
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
      data-tooltip-managed="true"
      className={["relative", className].filter(Boolean).join(" ")}
      onMouseEnter={tryShow}
      onMouseLeave={hide}
      onFocus={tryShow}
      onBlur={hide}
      aria-describedby={id}
    >
      {children}
      <TooltipBubble id={id} open={open} content={content} anchorRef={ref} placement={placement} />
    </span>
  );
}

export function GlobalIconButtonTooltip({
  placement = "bottom",
}: {
  placement?: TooltipPlacement;
}) {
  const id = useId();
  const activeRef = useRef<GlobalTooltipState | null>(null);
  const [active, setActive] = useState<GlobalTooltipState | null>(null);

  const hide = useCallback((relatedTarget?: EventTarget | null) => {
    const current = activeRef.current;
    if (!current) return;
    if (relatedTarget instanceof Node && current.anchor.contains(relatedTarget)) return;

    restoreNativeTitle(current.anchor);
    activeRef.current = null;
    setActive(null);
  }, []);

  const show = useCallback((target: EventTarget | null) => {
    const next = resolveIconButtonTooltip(target);
    if (!next) return;

    if (activeRef.current?.anchor !== next.anchor) {
      restoreNativeTitle(activeRef.current?.anchor);
    }
    hideNativeTitle(next.anchor);
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    const handleMouseOver = (event: MouseEvent) => show(event.target);
    const handleMouseOut = (event: MouseEvent) => hide(event.relatedTarget);
    const handleFocusIn = (event: FocusEvent) => show(event.target);
    const handleFocusOut = (event: FocusEvent) => hide(event.relatedTarget);

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      restoreNativeTitle(activeRef.current?.anchor);
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, [hide, show]);

  return (
    <TooltipBubble
      id={id}
      open={Boolean(active)}
      content={active?.content ?? ""}
      anchorElement={active?.anchor}
      placement={active?.placement ?? placement}
    />
  );
}
