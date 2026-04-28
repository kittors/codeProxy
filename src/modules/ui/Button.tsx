import {
  Children,
  useContext,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEventHandler,
  type MouseEventHandler,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { TooltipBubble, TooltipTriggerContext, type TooltipPlacement } from "@/modules/ui/Tooltip";

type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "error"
  | "success"
  | "warning"
  | "ghost";
type ButtonSize = "xs" | "sm" | "md";

const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 font-semibold shadow-none transition-all duration-150 ease-out active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-45";

const BUTTON_SIZE_CLASSES: Record<ButtonSize, { iconOnly: string; text: string }> = {
  xs: {
    iconOnly: "h-7 w-7 px-0 text-xs",
    text: "h-8 px-2.5 text-xs",
  },
  sm: {
    iconOnly: "h-8 w-8 px-0 text-sm",
    text: "h-9 px-3 text-sm",
  },
  md: {
    iconOnly: "h-9 w-9 px-0 text-sm",
    text: "h-10 px-4 text-sm",
  },
};

const BUTTON_VARIANT_CLASSES: Record<Exclude<ButtonVariant, "secondary" | "danger">, string> = {
  default:
    "bg-[#EBEBEC] text-[#18181B] hover:bg-[#E4E4E7] active:bg-[#D4D4D8] focus-visible:ring-black/10 dark:bg-[#27272A] dark:text-white dark:hover:bg-[#303036] dark:active:bg-[#3F3F46] dark:focus-visible:ring-white/15",
  primary:
    "bg-[#18181B] text-white hover:bg-[#27272A] active:bg-[#09090B] focus-visible:ring-black/20 dark:bg-white dark:text-[#18181B] dark:hover:bg-[#E4E4E7] dark:active:bg-[#D4D4D8] dark:focus-visible:ring-white/15",
  error:
    "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 focus-visible:ring-rose-400/35 dark:bg-rose-500 dark:hover:bg-rose-400 dark:active:bg-rose-600 dark:focus-visible:ring-rose-300/20",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 focus-visible:ring-emerald-400/35 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:active:bg-emerald-600 dark:focus-visible:ring-emerald-300/20",
  warning:
    "bg-amber-400 text-amber-950 hover:bg-amber-300 active:bg-amber-500 focus-visible:ring-amber-400/35 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300 dark:active:bg-amber-500 dark:focus-visible:ring-amber-300/25",
  ghost:
    "bg-transparent text-[#3F3F46] hover:bg-[#EBEBEC] hover:text-[#18181B] active:bg-[#E4E4E7] focus-visible:ring-black/10 dark:text-[#D4D4D8] dark:hover:bg-[#27272A] dark:hover:text-white dark:active:bg-[#303036] dark:focus-visible:ring-white/15",
};

export function buttonClassName({
  className,
  iconOnly = false,
  size = "md",
  variant = "default",
}: {
  className?: string;
  iconOnly?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const resolvedVariant =
    variant === "secondary" ? "default" : variant === "danger" ? "error" : variant;
  const sizeClass = iconOnly ? BUTTON_SIZE_CLASSES[size].iconOnly : BUTTON_SIZE_CLASSES[size].text;

  return [BUTTON_BASE_CLASS, sizeClass, BUTTON_VARIANT_CLASSES[resolvedVariant], className]
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
  tooltipPlacement = "right",
  variant = "default",
  size = "md",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tooltip?: ReactNode | false;
    tooltipPlacement?: TooltipPlacement;
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>) {
  const tooltipId = useId();
  const hasTooltipParent = useContext(TooltipTriggerContext);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const childNodes = Children.toArray(children);
  const iconOnly =
    childNodes.length === 1 &&
    typeof childNodes[0] !== "string" &&
    typeof childNodes[0] !== "number";

  const tooltipContent = tooltip === false ? null : (tooltip ?? title ?? ariaLabel);
  const hasTooltipContent =
    tooltipContent !== null &&
    tooltipContent !== undefined &&
    (typeof tooltipContent !== "string" || tooltipContent.trim().length > 0);
  const autoAriaLabel =
    !ariaLabel && iconOnly && typeof tooltipContent === "string" ? tooltipContent : undefined;
  const shouldShowTooltip = iconOnly && !hasTooltipParent && hasTooltipContent;
  const shouldSuppressNativeTitle = iconOnly && (shouldShowTooltip || hasTooltipParent);
  const shouldSkipGlobalTooltip = iconOnly && tooltip === false;
  const mergedAriaDescribedBy = [ariaDescribedBy, shouldShowTooltip ? tooltipId : null]
    .filter(Boolean)
    .join(" ");

  const showTooltip = () => {
    if (!shouldShowTooltip) return;
    setTooltipOpen(true);
  };
  const hideTooltip = () => setTooltipOpen(false);

  const handleMouseEnter: MouseEventHandler<HTMLButtonElement> = (event) => {
    onMouseEnter?.(event);
    showTooltip();
  };
  const handleMouseLeave: MouseEventHandler<HTMLButtonElement> = (event) => {
    onMouseLeave?.(event);
    hideTooltip();
  };
  const handleFocus: FocusEventHandler<HTMLButtonElement> = (event) => {
    onFocus?.(event);
    showTooltip();
  };
  const handleBlur: FocusEventHandler<HTMLButtonElement> = (event) => {
    onBlur?.(event);
    hideTooltip();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        {...props}
        aria-describedby={mergedAriaDescribedBy || undefined}
        aria-label={ariaLabel ?? autoAriaLabel}
        data-tooltip-managed={shouldShowTooltip || shouldSkipGlobalTooltip ? true : undefined}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={shouldSuppressNativeTitle ? undefined : title}
        className={buttonClassName({ className, iconOnly, size, variant })}
      >
        {children}
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
