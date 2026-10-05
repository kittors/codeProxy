import {
  Children,
  Fragment,
  isValidElement,
  useContext,
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
import { Loader2 } from "lucide-react";
import { TooltipBubble, TooltipTriggerContext, type TooltipPlacement } from "../overlays/Tooltip";

type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "error"
  | "success"
  | "warning"
  | "ghost"
  | "ghost-danger"
  | "secondary-danger";
type ButtonSize = "xs" | "sm" | "md";

/**
 * 所有按钮都是胶囊形，带一条 1px 描边位（默认透明），这样有描边的「默认」按钮和实心按钮
 * 放在一起时高度、内容位置完全一致。
 *
 * 只保留按下时的轻微缩小作为触感反馈，去掉了悬停上浮——一排按钮跟着鼠标上下跳，会让
 * 工具栏显得浮躁。键盘焦点统一走全局 :focus-visible 的蓝色描边（styles/index.css），
 * 不再按颜色变体各配一圈光晕。
 */
const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent font-medium transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-soft active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";

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

/**
 * Flatten Fragments so icon-only detection counts real content nodes.
 * Children.toArray keeps a Fragment as one child; spinner+label wrapped in
 * <>...</> would otherwise pick the square icon-only size and clip the label.
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
 * - default：白底 + 细描边，和输入框同一套轮廓，是页面上最常见的次要操作。
 * - primary：墨色实心（深色模式反转成浅色实心），一屏通常只放一个。
 * - error / success / warning：只给确实带后果的操作用，颜色来自重新校准过的状态色阶。
 * - ghost：无底色，悬停才出现浅灰叠层，用在工具栏图标和行内操作。
 * - ghost-danger：同 ghost，但文字与悬停底是红色，给行内的删除这类操作；
 *   不要用 ghost + 追加 text-rose-* 的写法，同属性类的覆盖顺序靠不住。
 * - secondary-danger：default 的描边轮廓 + 红字，给工具栏、批量选择栏里「发起」删除 / 清空
 *   的按钮。实心红（danger / error）只留给确认弹窗里最后那一下，否则页面顶部一颗红色
 *   实心胶囊会比主操作还抢眼。
 * 悬停底色用半透明的 bg-hover 叠层，落在白卡片、灰侧栏、深色弹层上都能看出来。
 */
const BUTTON_VARIANT_CLASSES: Record<Exclude<ButtonVariant, "secondary" | "danger">, string> = {
  default:
    "border-line-strong bg-surface text-ink shadow-xs hover:bg-hover active:bg-selected dark:shadow-none",
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  error:
    "bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 dark:hover:bg-rose-400 dark:active:bg-rose-600",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:active:bg-emerald-600",
  warning:
    "bg-amber-400 text-amber-950 hover:bg-amber-300 active:bg-amber-500",
  ghost:
    "bg-transparent text-ink-2 hover:bg-hover hover:text-ink active:bg-selected",
  "ghost-danger":
    "bg-transparent text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 active:bg-rose-500/15 dark:text-rose-400 dark:hover:text-rose-300",
  "secondary-danger":
    "border-line-strong bg-surface text-rose-600 shadow-xs hover:bg-rose-500/5 active:bg-rose-500/10 dark:text-rose-400 dark:shadow-none dark:hover:bg-rose-500/10",
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
  tooltipPlacement = "bottom",
  variant = "default",
  size = "md",
  loading = false,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tooltip?: ReactNode | false;
    tooltipPlacement?: TooltipPlacement;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** 提交中：插入 spinner 并禁用点击，但保留标签，避免按钮宽度跳动。 */
    loading?: boolean;
  }
>) {
  const tooltipId = useId();
  const hasTooltipParent = useContext(TooltipTriggerContext);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  // loading 时会额外插入 spinner，图标独占判定要按原始 children 算，否则会误判成图标按钮。
  const iconOnly = isIconOnlyButtonChildren(children);

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
        disabled={props.disabled || loading}
        aria-busy={loading ? true : props["aria-busy"]}
        className={buttonClassName({ className, iconOnly, size, variant })}
      >
        {loading ? (
          <Loader2 size={size === "xs" ? 13 : 15} className="shrink-0 animate-spin" aria-hidden />
        ) : null}
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
