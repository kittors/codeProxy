import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { cn } from "../utils/selectStyles";
import { resolvePortalContainer } from "../overlays/portalContainer";
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
  scheduleClose: () => void;
  cancelClose: () => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}
const SubMenuContext = createContext<SubMenuContextValue | null>(null);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
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
 * 纯 Satin 下拉菜单（零 Radix 依赖）：
 * 采用 Satin `.sn-menu` / `.sn-item` / `.sn-sep` / `.sn-danger-item` 与统一浮层材质，
 * 完整支持 top/bottom/left/right 四向定位与视口翻转、键盘上下导航、Esc 关闭、受控/非受控与子菜单。
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
  sm: "min-w-28",
  default: "min-w-40",
  lg: "min-w-44",
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
    onCloseAutoFocus: _onCloseAutoFocus,
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
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    resolvedSide: MenuSide;
    end: boolean;
    ready: boolean;
  }>({ top: 0, left: 0, resolvedSide: side, end: align === "end", ready: false });

  const reposition = useCallback(() => {
    const trigger = ctx.triggerRef.current;
    const panel = localRef.current;
    if (!trigger) return;
    const ar = trigger.getBoundingClientRect();
    const pw = panel?.offsetWidth || 180;
    const ph = panel?.offsetHeight || 160;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const pad = collisionPadding;

    let resolvedSide: MenuSide = side;
    let left = 0;
    let top = 0;
    let end = align === "end";

    if (side === "right" || side === "left") {
      if (side === "right" && vw - ar.right - sideOffset < pw && ar.left - sideOffset > vw - ar.right) {
        resolvedSide = "left";
      } else if (side === "left" && ar.left - sideOffset < pw && vw - ar.right > ar.left) {
        resolvedSide = "right";
      }
      left = resolvedSide === "right" ? ar.right + sideOffset : ar.left - sideOffset - pw;
      end = resolvedSide === "left";

      if (align === "end") {
        top = ar.bottom - ph + alignOffset;
      } else if (align === "center") {
        top = ar.top + (ar.height - ph) / 2 + alignOffset;
      } else {
        top = ar.top + alignOffset;
      }
    } else {
      if (side === "bottom" && vh - ar.bottom - sideOffset < ph && ar.top - sideOffset > vh - ar.bottom) {
        resolvedSide = "top";
      } else if (side === "top" && ar.top - sideOffset < ph && vh - ar.bottom > ar.top) {
        resolvedSide = "bottom";
      }
      top = resolvedSide === "top" ? ar.top - sideOffset - ph : ar.bottom + sideOffset;

      if (align === "end") {
        left = ar.right - pw + alignOffset;
      } else if (align === "center") {
        left = ar.left + (ar.width - pw) / 2 + alignOffset;
      } else {
        left = ar.left + alignOffset;
      }
      if (left + pw > vw - pad) {
        end = true;
      }
    }

    if (left + pw > vw - pad) left = Math.max(pad, vw - pw - pad);
    if (left < pad) left = pad;
    if (top + ph > vh - pad) top = Math.max(pad, vh - ph - pad);
    if (top < pad) top = pad;

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      resolvedSide,
      end,
      ready: true,
    });
  }, [align, alignOffset, collisionPadding, ctx.triggerRef, side, sideOffset]);

  useLayoutEffect(() => {
    if (!ctx.open) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [ctx.open, reposition]);

  useEffect(() => {
    const node = localRef.current;
    if (!ctx.open || !node) return;
    const nodes = ctx.menuNodesRef.current;
    nodes.add(node);
    return () => {
      nodes.delete(node);
    };
  }, [ctx.menuNodesRef, ctx.open]);

  useEffect(() => {
    if (!ctx.open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (ctx.triggerRef.current?.contains(target) || localRef.current?.contains(target)) return;
      for (const menuNode of ctx.menuNodesRef.current) {
        if (menuNode.contains(target)) return;
      }
      onPointerDownOutside?.(event);
      ctx.setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscapeKeyDown?.(event);
        event.preventDefault();
        ctx.setOpen(false);
        ctx.triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
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
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ctx, onEscapeKeyDown, onPointerDownOutside]);

  if (!ctx.open) return null;

  const mergedStyle: CSSProperties = {
    position: "fixed",
    top: coords.top,
    left: coords.left,
    right: "auto",
    bottom: "auto",
    zIndex: 9999,
    minWidth: "max-content",
    visibility: coords.ready ? undefined : "hidden",
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
      data-state="open"
      data-side={coords.resolvedSide}
      style={mergedStyle}
      className={cn(
        "sn-menu sn-solid code-proxy-floating-surface outline-none",
        coords.resolvedSide === "top" ? "sn-up" : null,
        coords.end ? "sn-end" : null,
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
  const closeTimerRef = useRef<number | null>(null);

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

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 120);
  }, [cancelClose, setOpen]);

  useEffect(() => cancelClose, [cancelClose]);

  const value = useMemo(
    () => ({ open, setOpen, scheduleClose, cancelClose, triggerRef }),
    [cancelClose, open, scheduleClose, setOpen],
  );

  return (
    <SubMenuContext.Provider value={value}>
      <div
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={scheduleClose}
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
        // 点击子菜单触发器时始终保持展开，避免 mouseenter 刚打开又被 click 取反关闭。
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
        sub?.open ? "sn-hl" : null,
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
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    side: "right" | "left";
    ready: boolean;
  }>({ top: 0, left: 0, side: "right", ready: false });

  const reposition = useCallback(() => {
    const trigger = sub?.triggerRef.current;
    if (!trigger) return;
    const ar = trigger.getBoundingClientRect();
    const panel = localRef.current;
    const pw = panel?.offsetWidth || 180;
    const ph = panel?.offsetHeight || 160;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    let resolvedSide: "right" | "left" = "right";
    let left = ar.right + sideOffset;
    if (left + pw > vw - collisionPadding) {
      resolvedSide = "left";
      left = Math.max(collisionPadding, ar.left - sideOffset - pw);
    }
    let top = ar.top + alignOffset;
    if (top + ph > vh - collisionPadding) {
      top = Math.max(collisionPadding, vh - ph - collisionPadding);
    }
    if (top < collisionPadding) top = collisionPadding;

    setCoords({ top: Math.round(top), left: Math.round(left), side: resolvedSide, ready: true });
  }, [alignOffset, collisionPadding, sideOffset, sub]);

  useLayoutEffect(() => {
    if (!sub?.open) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [reposition, sub?.open]);

  useEffect(() => {
    const node = localRef.current;
    if (!sub?.open || !node || !ctx) return;
    const nodes = ctx.menuNodesRef.current;
    nodes.add(node);
    return () => {
      nodes.delete(node);
    };
  }, [ctx, sub?.open]);

  if (!sub?.open) return null;

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        assignRef(ref, node);
      }}
      role="menu"
      data-state="open"
      data-side={coords.side}
      onMouseEnter={() => sub.cancelClose()}
      onMouseLeave={() => sub.scheduleClose()}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        zIndex: 10000,
        minWidth: "max-content",
        visibility: coords.ready ? undefined : "hidden",
        ...style,
      }}
      className={cn(
        "sn-menu sn-solid code-proxy-floating-surface outline-none",
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
