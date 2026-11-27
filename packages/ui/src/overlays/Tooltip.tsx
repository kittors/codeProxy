import {
  createContext,
  createElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { computeFloating, hideTip, showTip, tipTarget } from "satin-ui";
import { resolvePortalContainer } from "./portalContainer";

export type TooltipPlacement = "top" | "right" | "bottom" | "left";

type GlobalTooltipState = {
  anchor: HTMLElement;
  content: string;
  placement?: TooltipPlacement;
};

export const TooltipTriggerContext = createContext(false);

function isEmptyTooltipContent(content: ReactNode) {
  return content === null || content === undefined || content === false || content === "";
}

function isPlainTooltipText(content: ReactNode): content is string | number {
  return typeof content === "string" || typeof content === "number";
}

function parseTooltipPlacement(value: string | null): TooltipPlacement | undefined {
  if (value === "top" || value === "right" || value === "bottom" || value === "left") {
    return value;
  }
  return undefined;
}

function resolveIconButtonTooltip(target: EventTarget | null): GlobalTooltipState | null {
  if (!(target instanceof Element)) return null;
  // 按钮默认参与；链接只在显式写了 data-tooltip 时参与（侧边栏图标栏里的单页分区是链接）。
  const button = target.closest("button, a[data-tooltip]");
  if (!(button instanceof HTMLButtonElement || button instanceof HTMLAnchorElement)) return null;
  if (button.closest("[data-tooltip-managed='true']")) return null;
  // 已采用 Satin 原生 data-tip 的元素交由 Satin installTooltips() 原生延迟/暖机管线接管，不重复触发。
  if (button.hasAttribute("data-tip")) return null;

  // 有可见文字的按钮不弹提示，显式写了 data-tooltip 的例外（例如侧边栏收起态淡出文字）。
  const explicitTooltip = button.getAttribute("data-tooltip");
  const hasVisibleText = (button.textContent ?? "").trim().length > 0;
  if (hasVisibleText && !explicitTooltip) return null;
  // 里面什么都没有的空按钮（弹窗、抽屉的整屏遮罩）不是图标按钮。
  if (!explicitTooltip && button.childElementCount === 0) return null;

  const content =
    explicitTooltip ||
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

// scrollWidth/clientWidth 会四舍五入到整数，188.4px 落在 188px 盒里会报 1px 假溢出。
const OVERFLOW_TOLERANCE_PX = 1;

function isElementOverflowing(element: HTMLElement) {
  return (
    element.scrollWidth - element.clientWidth > OVERFLOW_TOLERANCE_PX ||
    element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE_PX
  );
}

export function hasOverflowingContent(element: HTMLElement) {
  if (isElementOverflowing(element)) return true;

  for (const child of element.querySelectorAll("*")) {
    if (child instanceof HTMLElement && isElementOverflowing(child)) return true;
  }

  return false;
}

/**
 * 富内容 Tooltip 浮层（用于 JSX 表格明细 / 标签组等非纯文本内容）：
 * 直接由 Satin 原生 `computeFloating` 智能定位引擎 + `.sn-tip.sn-wrap.sn-on` 样式与微动效驱动，
 * 并通过 `resolvePortalContainer` 自动兼容原生 `<dialog>` Top Layer。
 */
function SatinRichTooltip({
  id,
  open,
  content,
  anchorElement,
  anchorRef,
  interactive = false,
  onMouseEnter,
  onMouseLeave,
  placement = "bottom",
}: {
  id: string;
  open: boolean;
  content: ReactNode;
  anchorElement?: HTMLElement | null;
  anchorRef?: React.RefObject<HTMLElement | null>;
  interactive?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  placement?: TooltipPlacement;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    origin: string;
    below: boolean;
    right: boolean;
    leftSide: boolean;
    ready: boolean;
  }>({
    left: 0,
    top: 0,
    origin: "50% 0",
    below: true,
    right: false,
    leftSide: false,
    ready: false,
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorElement ?? anchorRef?.current;
    const panel = tooltipRef.current;
    if (!anchor || !panel) return;
    const next = computeFloating(panel, anchor, {
      placement,
      align: "center",
      gap: 8,
      margin: 8,
    });
    const nextOrigin = `${next.ox}px ${next.oy}px`;
    const nextBelow = !next.side && !next.up;
    const nextRight = next.side === "right";
    const nextLeftSide = next.side === "left";
    setPos((prev) =>
      prev.ready &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.origin === nextOrigin &&
      prev.below === nextBelow &&
      prev.right === nextRight &&
      prev.leftSide === nextLeftSide
        ? prev
        : {
            left: next.left,
            top: next.top,
            origin: nextOrigin,
            below: nextBelow,
            right: nextRight,
            leftSide: nextLeftSide,
            ready: true,
          },
    );
  }, [anchorElement, anchorRef, placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPos((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("satin-reposition", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("satin-reposition", updatePosition);
    };
  }, [open, updatePosition, content]);

  if (!open) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      role="tooltip"
      className={[
        "sn-tip sn-wrap !z-[10050] !px-2.5 !py-1.5",
        interactive ? "!pointer-events-auto select-text" : "",
        pos.below ? "sn-below" : "",
        pos.right ? "sn-right" : "",
        pos.leftSide ? "sn-left" : "",
        pos.ready ? "sn-on" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: pos.left,
        top: pos.top,
        transformOrigin: pos.origin,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="block whitespace-pre-line break-words [overflow-wrap:anywhere]">
        {content}
      </span>
    </div>,
    resolvePortalContainer(anchorElement ?? anchorRef?.current),
  );
}

/**
 * 统一 Tooltip 气泡：
 * - 纯文本直接复用 Satin 全局唯一 `#sn-tip`（Popover Top Layer + `showTip`/`hideTip`）；
 * - 富 JSX 内容使用 Satin `computeFloating` + `.sn-tip` 渲染，零自研定位算法。
 */
export function TooltipBubble({
  id,
  open,
  content,
  anchorElement,
  anchorRef,
  interactive = false,
  onMouseEnter,
  onMouseLeave,
  placement = "bottom",
}: {
  id: string;
  open: boolean;
  content: ReactNode;
  anchorElement?: HTMLElement | null;
  anchorRef?: React.RefObject<HTMLElement | null>;
  interactive?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  placement?: TooltipPlacement;
}) {
  const useNativeTextTip = !interactive && isPlainTooltipText(content);
  const textContent = useNativeTextTip ? String(content).trim() : "";

  useLayoutEffect(() => {
    if (!useNativeTextTip) return undefined;
    const anchor = anchorElement ?? anchorRef?.current;
    if (!open || !anchor || !textContent) {
      if (anchor && tipTarget() === anchor) hideTip();
      return undefined;
    }
    showTip(anchor, textContent, { side: placement });
    return () => {
      if (tipTarget() === anchor) hideTip();
    };
  }, [anchorElement, anchorRef, open, placement, textContent, useNativeTextTip]);

  if (useNativeTextTip) return null;

  return (
    <SatinRichTooltip
      id={id}
      open={open}
      content={content}
      anchorElement={anchorElement}
      anchorRef={anchorRef}
      interactive={interactive}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      placement={placement}
    />
  );
}

/**
 * 提示气泡里成组展示的小标签（模型名、渠道名、路由路径），对齐 Satin `.sn-tip` 深底高对比反色材质。
 */
export function TooltipChip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md bg-white/14 px-2 py-0.5 text-xs text-[var(--sn-tip-fg)]",
        mono ? "font-mono" : "",
      ].join(" ")}
    >
      {children}
    </span>
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
  const isPlain = isPlainTooltipText(content);

  const show = useCallback(() => {
    if (disabled || !hasContent) return;
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
      aria-describedby={!disabled && hasContent && !isPlain && open ? id : undefined}
    >
      <TooltipTriggerContext.Provider value={true}>{children}</TooltipTriggerContext.Provider>
      <TooltipBubble id={id} open={open} content={content} anchorRef={ref} placement={placement} />
    </span>
  );
}

export function OverflowTooltip({
  as = "span",
  content,
  children,
  className,
  placement = "bottom",
  ...triggerProps
}: {
  as?: "div" | "span";
  content: string;
  children: ReactNode;
  className?: string;
  placement?: TooltipPlacement;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "content">) {
  const ref = useRef<HTMLElement | null>(null);
  const shownAnchorRef = useRef<HTMLElement | null>(null);

  const tryShow = useCallback(() => {
    const el = ref.current;
    if (!el || !content.trim()) return;
    if (!hasOverflowingContent(el)) return;
    shownAnchorRef.current = el;
    showTip(el, content, { side: placement });
  }, [content, placement]);

  const hide = useCallback(() => {
    const el = shownAnchorRef.current ?? ref.current;
    if (!el || tipTarget() === el) hideTip();
    shownAnchorRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      const el = shownAnchorRef.current ?? ref.current;
      if (el && tipTarget() === el) hideTip();
      shownAnchorRef.current = null;
    };
  }, []);

  return createElement(
    as,
    {
      ...triggerProps,
      ref,
      "data-tooltip-managed": "true",
      className: ["relative", className].filter(Boolean).join(" "),
      onMouseEnter: tryShow,
      onMouseLeave: hide,
      onFocus: tryShow,
      onBlur: hide,
    },
    children,
  );
}

/**
 * 全局纯图标按钮与 `data-tooltip` 提示桥接器：
 * 零 React DOM / Portal，全部直接委托 Satin 原生 `showTip` / `hideTip` 全局 `#sn-tip` 顶层容器。
 */
export function GlobalIconButtonTooltip({
  placement = "bottom",
}: {
  placement?: TooltipPlacement;
}) {
  const activeRef = useRef<GlobalTooltipState | null>(null);
  const pointerInteractionRef = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);

  const dismiss = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    observerRef.current?.disconnect();
    observerRef.current = null;
    restoreNativeTitle(current.anchor);
    if (tipTarget() === current.anchor) hideTip();
    activeRef.current = null;
  }, []);

  const hide = useCallback(
    (relatedTarget?: EventTarget | null) => {
      const current = activeRef.current;
      if (!current) return;
      if (relatedTarget instanceof Node && current.anchor.contains(relatedTarget)) return;
      dismiss();
    },
    [dismiss],
  );

  const show = useCallback(
    (target: EventTarget | null) => {
      const next = resolveIconButtonTooltip(target);
      if (!next) return;

      if (activeRef.current?.anchor !== next.anchor) {
        observerRef.current?.disconnect();
        observerRef.current = null;
        restoreNativeTitle(activeRef.current?.anchor);
      }
      hideNativeTitle(next.anchor);
      activeRef.current = next;
      showTip(next.anchor, next.content, { side: next.placement ?? placement });

      if (typeof MutationObserver !== "undefined") {
        const anchor = next.anchor;
        const observer = new MutationObserver(() => {
          const current = activeRef.current;
          if (!current || current.anchor !== anchor) return;
          const content = (
            anchor.getAttribute("data-tooltip") ||
            anchor.getAttribute("aria-label") ||
            anchor.dataset.tooltipNativeTitle ||
            ""
          ).trim();
          if (!content) {
            dismiss();
            return;
          }
          if (content === current.content) return;
          activeRef.current = { ...current, content };
          showTip(anchor, content, { side: current.placement ?? placement });
        });
        observer.observe(anchor, {
          attributes: true,
          attributeFilter: ["aria-label", "data-tooltip"],
        });
        observerRef.current = observer;
      }
    },
    [dismiss, placement],
  );

  useEffect(() => {
    const handleMouseOver = (event: MouseEvent) => show(event.target);
    const handleMouseOut = (event: MouseEvent) => hide(event.relatedTarget);
    const handleFocusIn = (event: FocusEvent) => {
      if (pointerInteractionRef.current) return;
      show(event.target);
    };
    const handleFocusOut = (event: FocusEvent) => hide(event.relatedTarget);
    const handlePointerDown = () => {
      pointerInteractionRef.current = true;
      dismiss();
    };
    const handleKeyDown = () => {
      pointerInteractionRef.current = false;
    };

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      dismiss();
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [dismiss, hide, show]);

  return null;
}
