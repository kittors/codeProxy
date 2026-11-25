import {
  Children,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEventHandler,
  type MouseEventHandler,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";
import { TooltipBubble, TooltipTriggerContext, type TooltipPlacement } from "../overlays/Tooltip";
import { HUE_BUTTON_ICON, hueForIcon, type Hue } from "../theme/hues";

type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "error"
  | "success"
  | "warning"
  | "ghost"
  | "ghost-danger"
  | "secondary-danger";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const BUTTON_VARIANT_MAP: Record<ButtonVariant, string> = {
  default: "sn-secondary",
  secondary: "sn-secondary",
  tertiary: "sn-tertiary",
  primary: "sn-primary",
  danger: "sn-danger",
  error: "sn-danger",
  success: "sn-success-fill",
  warning: "sn-warning-fill",
  ghost: "sn-ghost",
  "ghost-danger": "sn-ghost-danger",
  "secondary-danger": "sn-danger-soft",
};

const BUTTON_SIZE_MAP: Record<ButtonSize, string> = {
  xs: "sn-xs",
  sm: "sn-sm",
  md: "",
  lg: "sn-lg",
};

/**
 * Flatten Fragments so icon-only detection counts real content nodes.
 */
function flattenButtonChildren(children: ReactNode): ReactNode[] {
  const nodes: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (isValidElement(child) && child.type === Fragment) {
      nodes.push(
        ...flattenButtonChildren((child as ReactElement<{ children?: ReactNode }>).props.children),
      );
      return;
    }
    nodes.push(child);
  });
  return nodes;
}

function isIconOnlyButtonChildren(children: ReactNode): boolean {
  const childNodes = flattenButtonChildren(children);
  return (
    childNodes.length === 1 &&
    typeof childNodes[0] !== "string" &&
    typeof childNodes[0] !== "number"
  );
}

/**
 * Satin 按钮延迟转圈节奏：loading 超过 300ms 才显影转圈，一旦出现至少停留 500ms，
 * 避免快接口闪屏；首次挂载已在 loading 状态时直接显示。
 */
function useSatinBusySpin(active: boolean): boolean {
  const [shown, setShown] = useState(active);
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (active) {
      if (shown) return;
      const timer = window.setTimeout(() => {
        shownAtRef.current = performance.now();
        setShown(true);
      }, 300);
      return () => window.clearTimeout(timer);
    }
    if (!shown) return;
    const remain = Math.max(0, 500 - (performance.now() - shownAtRef.current));
    const timer = window.setTimeout(() => setShown(false), remain);
    return () => window.clearTimeout(timer);
  }, [active, shown]);

  return shown;
}

function buttonIconHue(children: ReactNode): Hue | null {
  for (const child of flattenButtonChildren(children)) {
    const hue = hueForIcon(child);
    if (hue) return hue;
  }
  return null;
}

/**
 * 生成正宗 Satin 按钮类名（.sn-btn + 变体 + 尺寸 + 纯图标按钮 .sn-ibtn）。
 */
export function buttonClassName({
  className,
  iconOnly = false,
  size = "md",
  variant = "default",
  iconHue = null,
}: {
  className?: string;
  iconOnly?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
  iconHue?: Hue | null;
}) {
  const neutral =
    variant === "default" ||
    variant === "secondary" ||
    variant === "tertiary" ||
    variant === "ghost";
  const iconClass = iconHue && neutral ? HUE_BUTTON_ICON[iconHue] : null;

  return [
    "sn-btn",
    BUTTON_VARIANT_MAP[variant],
    BUTTON_SIZE_MAP[size],
    iconOnly ? "sn-ibtn" : null,
    iconClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  children,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  onBlur,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  title,
  tooltip,
  tooltipPlacement = "bottom",
  variant = "default",
  size = "md",
  loading = false,
  done = false,
  type = "button",
  disabled,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tooltip?: ReactNode | false;
    tooltipPlacement?: TooltipPlacement;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Satin 异步等待：保留按钮原宽，超过 300ms 切转圈避免闪动。 */
    loading?: boolean;
    /** Satin 成功瞬时打勾微光反馈。 */
    done?: boolean;
  }
>) {
  const tooltipId = useId();
  const hasTooltipParent = useContext(TooltipTriggerContext);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const iconOnly = isIconOnlyButtonChildren(children);
  const busySpin = useSatinBusySpin(Boolean(loading));
  const showOk = Boolean(done) && !busySpin;
  const hasAsyncState = loading || done || busySpin;

  const tooltipContent = tooltip === false ? null : (tooltip ?? title ?? ariaLabel);
  const hasTooltipContent =
    tooltipContent !== null &&
    tooltipContent !== undefined &&
    (typeof tooltipContent !== "string" || tooltipContent.trim().length > 0);
  const autoAriaLabel =
    !ariaLabel && iconOnly && typeof tooltipContent === "string" && tooltipContent.trim().length > 0
      ? tooltipContent.trim()
      : undefined;
  const shouldShowTooltip =
    !hasTooltipParent && hasTooltipContent && (iconOnly || tooltip !== undefined);
  const shouldSuppressNativeTitle = iconOnly && (shouldShowTooltip || hasTooltipParent);
  const shouldSkipGlobalTooltip = iconOnly && tooltip === false;

  const mergedAriaDescribedBy = [ariaDescribedBy, shouldShowTooltip ? tooltipId : null]
    .filter(Boolean)
    .join(" ");

  const isDisabled = Boolean(disabled || loading || showOk);

  const handleMouseEnter: MouseEventHandler<HTMLButtonElement> = (event) => {
    onMouseEnter?.(event);
    if (shouldShowTooltip) setTooltipOpen(true);
  };
  const handleMouseLeave: MouseEventHandler<HTMLButtonElement> = (event) => {
    onMouseLeave?.(event);
    setTooltipOpen(false);
  };
  const handleFocus: FocusEventHandler<HTMLButtonElement> = (event) => {
    onFocus?.(event);
    if (shouldShowTooltip) setTooltipOpen(true);
  };
  const handleBlur: FocusEventHandler<HTMLButtonElement> = (event) => {
    onBlur?.(event);
    setTooltipOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type={type}
        {...props}
        aria-describedby={mergedAriaDescribedBy || undefined}
        aria-label={ariaLabel ?? autoAriaLabel}
        data-tooltip-managed={shouldShowTooltip || shouldSkipGlobalTooltip ? true : undefined}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={shouldSuppressNativeTitle ? undefined : title}
        disabled={isDisabled}
        aria-busy={loading ? true : props["aria-busy"]}
        className={[
          buttonClassName({ className, iconOnly, size, variant, iconHue: buttonIconHue(children) }),
          busySpin ? "sn-busy" : null,
          showOk ? "sn-ok" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {hasAsyncState ? (
          <>
            <span className="sn-sheen" aria-hidden="true" />
            <span className="sn-label">
              <span className="sn-spin" aria-hidden="true" />
              <svg
                className="sn-tick"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
              <span className="sn-txt">{children}</span>
            </span>
          </>
        ) : (
          children
        )}
      </button>
      <TooltipBubble
        id={tooltipId}
        open={tooltipOpen && shouldShowTooltip}
        content={tooltipContent}
        anchorRef={buttonRef}
        placement={tooltipPlacement}
      />
    </>
  );
}
