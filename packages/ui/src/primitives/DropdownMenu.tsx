import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactElement,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { useSatinFloatingLayer } from "../overlays/useSatinFloatingLayer";
import { cn } from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";

type MenuSide = "top" | "right" | "bottom" | "left";

interface DropdownContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  size: ControlSize;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  /** 追踪所有挂在 Portal 里的菜单节点（主菜单 + 子菜单），防止点击子菜单被误判为外部点击。 */
  menuNodesRef: React.MutableRefObject<Set<HTMLElement>>;
}

const DropdownMenuContext = createContext<DropdownContextValue | null>(null);

interface RadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}
const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

interface SubMenuContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  scheduleClose: (pointer?: { x: number; y: number }) => void;
  cancelClose: () => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
}
const SubMenuContext = createContext<SubMenuContextValue | null>(null);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

/** Satin `overlay.js` 同款安全三角区命中判定：指针斜向滑往子菜单时不误关子菜单。 */
function pointInTriangle(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const sign = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

export interface DropdownMenuRootProps extends PropsWithChildren {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  dir?: "ltr" | "rtl";
  /** Shared visual size for menu content and items. */
  size?: ControlSize;
}

/**
 * 纯 Satin 原生驱动的下拉菜单：
 * - 定位与防溢出直连 Satin `computeFloating`（智能避让顶栏、上下左右自动翻转、变换原点对准锚点）；
 * - 浮层关闭与平级互斥直连 Satin `dismiss.js` 全局浮层栈（捕获阶段外部点击、Esc 后进先出、窗口失焦收起）；
 * - 双向弹性开合与子菜单滑出采用 Satin `.sn-menu.sn-float.sn-open` / `.sn-sub` 原生过渡与安全三角区保护。
 */
function Root({
  size = "default",
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: DropdownMenuRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const menuNodesRef = useRef<Set<HTMLElement>>(new Set());

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const value = useMemo<DropdownContextValue>(
    () => ({ open, setOpen, size, triggerRef, contentRef, menuNodesRef }),
    [open, setOpen, size],
  );

  return <DropdownMenuContext.Provider value={value}>{children}</DropdownMenuContext.Provider>;
}

const Trigger = forwardRef<
  HTMLElement,
  PropsWithChildren<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      asChild?: boolean;
    }
  >
>(function DropdownMenuTrigger({ asChild = false, children, onClick, onKeyDown, ...props }, ref) {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) throw new Error("DropdownMenu.Trigger must be used within DropdownMenu.Root");

  const handleToggle = (event: React.MouseEvent<HTMLElement>) => {
    onClick?.(event as React.MouseEvent<HTMLButtonElement>);
    if (event.defaultPrevented) return;
    ctx.setOpen(!ctx.open);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event as React.KeyboardEvent<HTMLButtonElement>);
    if (event.defaultPrevented) return;
    if (event.key === "ArrowDown" && !ctx.open) {
      event.preventDefault();
      ctx.setOpen(true);
    }
  };

  if (asChild && isValidElement(children)) {
    const child = Children.only(children) as ReactElement<Record<string, unknown>>;
    const childOnClick = child.props.onClick as ((e: React.MouseEvent<HTMLElement>) => void) | undefined;
    const childOnKeyDown = child.props.onKeyDown as
      | ((e: React.KeyboardEvent<HTMLElement>) => void)
      | undefined;
    const childRef = (child.props as { ref?: Ref<HTMLElement> }).ref;
    return cloneElement(child, {
      ...props,
      ref: (node: HTMLElement | null) => {
        ctx.triggerRef.current = node;
        assignRef(ref, node);
        assignRef(childRef, node);
      },
      "aria-haspopup": "menu",
      "aria-expanded": ctx.open,
      "data-state": ctx.open ? "open" : "closed",
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        childOnClick?.(event);
        handleToggle(event);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        childOnKeyDown?.(event);
        handleKeyDown(event);
      },
    });
  }

  return (
    <button
      ref={(node) => {
        ctx.triggerRef.current = node;
        assignRef(ref, node);
      }}
      type="button"
      aria-haspopup="menu"
      aria-expanded={ctx.open}
      data-state={ctx.open ? "open" : "closed"}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </button>
  );
});

function Portal({
  children,
  container,
}: PropsWithChildren<{ container?: HTMLElement | null; forceMount?: boolean }>) {
  const ctx = useContext(DropdownMenuContext);
  if (typeof document === "undefined") return null;
  return createPortal(children, container ?? resolvePortalContainer(ctx?.triggerRef.current));
}

const Group = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function DropdownMenuGroup(
  props,
  ref,
) {
  return <div ref={ref} role="group" {...props} />;
});

function ItemIndicator({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <span className={cn("sn-chk inline-flex items-center", className)}>{children}</span>;
}

const CONTENT_SIZE_CLASS: Record<ControlSize, string> = {
  sm: "!min-w-28",
  default: "!min-w-40",
  lg: "!min-w-44",
};

const ITEM_SIZE_CLASS: Record<ControlSize, string> = {
  sm: "!h-7 !text-xs",
  default: "!h-8 !text-sm",
  lg: "!h-9 !text-sm",
};

interface ContentProps extends HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  side?: MenuSide;
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
}

const Content = forwardRef<HTMLDivElement, ContentProps>(function DropdownMenuContent(
  {
    className,
    style,
    align = "start",
    side = "bottom",
    sideOffset = 6,
    alignOffset = 0,
    collisionPadding = 8,
    onCloseAutoFocus,
    onEscapeKeyDown,
    onPointerDownOutside,
    children,
    ...props
  },
  ref,
) {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) throw new Error("DropdownMenu.Content must be used within DropdownMenu.Root");

  const localRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);

  const floating = useSatinFloatingLayer({
    open: ctx.open,
    anchorRef: ctx.triggerRef,
    panelRef: localRef,
    placement: side,
    align,
    gap: sideOffset,
    margin: collisionPadding,
    extraInsideNodesRef: ctx.menuNodesRef,
    onClose: (reason) => {
      if (reason === "escape") {
        onEscapeKeyDown?.(new KeyboardEvent("keydown", { key: "Escape" }));
      } else if (reason === "outside") {
        onPointerDownOutside?.(new Event("pointerdown"));
      }
      ctx.setOpen(false);
    },
  });

  // 关闭时尊重 onCloseAutoFocus（例如门户账号切换时鼠标点击不闪现焦点环）。
  useEffect(() => {
    if (ctx.open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const focusEvent = new Event("closeAutoFocus", { cancelable: true });
    onCloseAutoFocus?.(focusEvent);
    if (!focusEvent.defaultPrevented && ctx.triggerRef.current?.isConnected) {
      const panel = localRef.current;
      if (panel?.contains(document.activeElement) || document.activeElement === document.body) {
        ctx.triggerRef.current.focus({ preventScroll: true });
      }
    }
  }, [ctx.open, ctx.triggerRef, onCloseAutoFocus]);

  useEffect(() => {
    const node = localRef.current;
    if (!ctx.open || !node) return;
    const nodes = ctx.menuNodesRef.current;
    nodes.add(node);
    return () => {
      nodes.delete(node);
    };
  }, [ctx.menuNodesRef, ctx.open]);

  // 菜单内方向键与 Home / End 键盘导航。
  useEffect(() => {
    if (!ctx.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }
      const panel = localRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])',
        ),
      );
      if (items.length === 0) return;
      event.preventDefault();
      if (event.key === "Home") {
        items[0]?.focus();
        return;
      }
      if (event.key === "End") {
        items[items.length - 1]?.focus();
        return;
      }
      const cur = items.indexOf(document.activeElement as HTMLElement);
      const nextIdx =
        event.key === "ArrowDown"
          ? (cur + 1 + items.length) % items.length
          : (cur - 1 + items.length) % items.length;
      items[nextIdx]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ctx.open]);

  if (!floating.mounted) return null;

  const left = floating.left + (side === "top" || side === "bottom" ? alignOffset : 0);
  const top = floating.top + (side === "left" || side === "right" ? alignOffset : 0);
  const mergedStyle: CSSProperties = {
    top,
    left,
    transformOrigin: floating.origin,
    ...style,
  };

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        ctx.contentRef.current = node;
        assignRef(ref, node);
      }}
      role="menu"
      aria-hidden={floating.isOpen ? undefined : true}
      data-state={floating.isOpen ? "open" : "closed"}
      data-side={floating.side}
      style={mergedStyle}
      className={cn(
        "sn-menu sn-float sn-solid outline-none",
        floating.isOpen ? "sn-open" : null,
        floating.up ? "sn-up" : null,
        floating.end ? "sn-end" : null,
        CONTENT_SIZE_CLASS[ctx.size],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

type MenuItemTone = "default" | "danger";

interface ItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  tone?: MenuItemTone;
  disabled?: boolean;
  textValue?: string;
  onSelect?: (event: Event) => void;
}

const Item = forwardRef<HTMLDivElement, ItemProps>(function DropdownMenuItem(
  { className, tone = "default", disabled = false, onSelect, onClick, onKeyDown, children, ...props },
  ref,
) {
  const ctx = useContext(DropdownMenuContext);

  const activate = (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    const synthetic = new Event("select", { cancelable: true });
    onSelect?.(synthetic);
    if (!synthetic.defaultPrevented && !event.defaultPrevented) {
      ctx?.setOpen(false);
    }
  };

  return (
    <div
      ref={ref}
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? "" : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
        activate(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(event);
        }
      }}
      className={cn(
        "sn-item w-full select-none outline-none hover:bg-[var(--sn-b-ghost-hover)] focus:bg-[var(--sn-b-ghost-hover)]",
        tone === "danger" ? "sn-danger-item" : null,
        disabled ? "sn-is-off pointer-events-none opacity-45" : null,
        ctx ? ITEM_SIZE_CLASS[ctx.size] : ITEM_SIZE_CLASS.default,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

const Separator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DropdownMenuSeparator({ className, ...props }, ref) {
    return <div ref={ref} role="separator" className={cn("sn-sep", className)} {...props} />;
  },
);

function Sub({
  open: controlledOpen,
  onOpenChange,
  children,
}: PropsWithChildren<{ open?: boolean; onOpenChange?: (open: boolean) => void }>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      cancelClose();
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [cancelClose, isControlled, onOpenChange],
  );

  const scheduleClose = useCallback(
    (pointer?: { x: number; y: number }) => {
      cancelClose();
      let delay = 140;
      const panel = panelRef.current;
      const prev = lastPointerRef.current;
      if (pointer && prev && panel) {
        const rect = panel.getBoundingClientRect();
        const edgeX = panel.classList.contains("sn-left") ? rect.right : rect.left;
        if (
          pointInTriangle(
            pointer,
            prev,
            { x: edgeX, y: rect.top - 8 },
            { x: edgeX, y: rect.bottom + 8 },
          )
        ) {
          // 指针在 Satin 安全三角区内朝子菜单移动，给足 400ms 缓冲窗口不误关。
          delay = 400;
        }
      }
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setOpen(false);
      }, delay);
    },
    [cancelClose, setOpen],
  );

  useEffect(() => cancelClose, [cancelClose]);

  const value = useMemo<SubMenuContextValue>(
    () => ({ open, setOpen, scheduleClose, cancelClose, triggerRef, panelRef }),
    [cancelClose, open, scheduleClose, setOpen],
  );

  return (
    <SubMenuContext.Provider value={value}>
      <div
        className="relative"
        onMouseMove={(event) => {
          lastPointerRef.current = { x: event.clientX, y: event.clientY };
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={(event) => scheduleClose({ x: event.clientX, y: event.clientY })}
      >
        {children}
      </div>
    </SubMenuContext.Provider>
  );
}

const SubTrigger = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>(function DropdownMenuSubTrigger({ className, disabled, onClick, onKeyDown, children, ...props }, ref) {
  const ctx = useContext(DropdownMenuContext);
  const sub = useContext(SubMenuContext);
  return (
    <div
      ref={(node) => {
        if (sub) sub.triggerRef.current = node;
        assignRef(ref, node);
      }}
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={sub?.open ?? false}
      data-state={sub?.open ? "open" : "closed"}
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={() => {
        if (!disabled) sub?.setOpen(true);
      }}
      onClick={(event) => {
        if (disabled) return;
        onClick?.(event);
        sub?.setOpen(true);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (disabled) return;
        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          sub?.setOpen(true);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          sub?.setOpen(false);
        }
      }}
      className={cn(
        "sn-item w-full select-none outline-none hover:bg-[var(--sn-b-ghost-hover)] focus:bg-[var(--sn-b-ghost-hover)]",
        sub?.open ? "sn-sub-open sn-hl" : null,
        ctx ? ITEM_SIZE_CLASS[ctx.size] : ITEM_SIZE_CLASS.default,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

const SubContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { sideOffset?: number; alignOffset?: number; collisionPadding?: number }
>(function DropdownMenuSubContent(
  { className, style, sideOffset = 4, alignOffset = -4, collisionPadding = 8, children, ...props },
  ref,
) {
  const ctx = useContext(DropdownMenuContext);
  const sub = useContext(SubMenuContext);
  const localRef = useRef<HTMLDivElement | null>(null);
  const fallbackAnchorRef = useRef<HTMLElement | null>(null);

  const floating = useSatinFloatingLayer({
    open: Boolean(sub?.open),
    anchorRef: sub?.triggerRef ?? fallbackAnchorRef,
    panelRef: localRef,
    placement: "right",
    align: "start",
    gap: sideOffset,
    margin: collisionPadding,
    dismissable: false,
  });

  useEffect(() => {
    const node = localRef.current;
    if (!sub?.open || !node || !ctx) return;
    const nodes = ctx.menuNodesRef.current;
    nodes.add(node);
    return () => {
      nodes.delete(node);
    };
  }, [ctx, sub?.open]);

  if (!floating.mounted) return null;

  const isLeft = floating.side === "left";

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        if (sub) sub.panelRef.current = node;
        assignRef(ref, node);
      }}
      role="menu"
      aria-hidden={floating.isOpen ? undefined : true}
      data-state={floating.isOpen ? "open" : "closed"}
      data-side={floating.side}
      onMouseEnter={() => sub?.cancelClose()}
      onMouseLeave={(event) => sub?.scheduleClose({ x: event.clientX, y: event.clientY })}
      style={{
        top: floating.top + alignOffset,
        left: floating.left,
        zIndex: 10000,
        ...style,
      }}
      className={cn(
        "sn-menu sn-float sn-sub sn-solid outline-none",
        floating.isOpen ? "sn-open" : null,
        isLeft ? "sn-left" : null,
        ctx ? CONTENT_SIZE_CLASS[ctx.size] : CONTENT_SIZE_CLASS.default,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

function RadioGroup({
  value,
  onValueChange,
  children,
}: PropsWithChildren<{ value?: string; onValueChange?: (value: string) => void }>) {
  const ctx = useMemo(() => ({ value, onValueChange }), [onValueChange, value]);
  return (
    <RadioGroupContext.Provider value={ctx}>
      <div role="group">{children}</div>
    </RadioGroupContext.Provider>
  );
}

const RadioItem = forwardRef<
  HTMLDivElement,
  Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> & {
    value: string;
    disabled?: boolean;
    onSelect?: (event: Event) => void;
  }
>(function DropdownMenuRadioItem(
  { value, disabled = false, className, onSelect, onClick, onKeyDown, children, ...props },
  ref,
) {
  const ctx = useContext(DropdownMenuContext);
  const radio = useContext(RadioGroupContext);
  const checked = radio?.value === value;

  const activate = (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    const synthetic = new Event("select", { cancelable: true });
    onSelect?.(synthetic);
    radio?.onValueChange?.(value);
    if (!synthetic.defaultPrevented && !event.defaultPrevented) {
      ctx?.setOpen(false);
    }
  };

  return (
    <div
      ref={ref}
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        if (disabled) return;
        onClick?.(event);
        activate(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(event);
        }
      }}
      className={cn(
        "sn-item relative w-full select-none outline-none hover:bg-[var(--sn-b-ghost-hover)] focus:bg-[var(--sn-b-ghost-hover)]",
        checked ? "sn-sel font-medium" : null,
        disabled ? "sn-is-off pointer-events-none opacity-45" : null,
        ctx ? ITEM_SIZE_CLASS[ctx.size] : ITEM_SIZE_CLASS.default,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const DropdownMenu = {
  Root,
  Trigger,
  Portal,
  Content,
  Group,
  Item,
  ItemIndicator,
  Separator,
  Sub,
  SubTrigger,
  SubContent,
  RadioGroup,
  RadioItem,
};
