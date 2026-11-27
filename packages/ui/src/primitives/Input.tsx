import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import type { ControlSize } from "../utils/controlStyles";

type InputVariant = "solid" | "ghost";
export type TextInputSize = ControlSize | "xl";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  size?: TextInputSize;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  /** Explicit invalid visual; also reacts to aria-invalid from FormField. */
  invalid?: boolean;
}

const SIZE_CLASS: Record<TextInputSize, string> = {
  sm: "sn-sm",
  default: "",
  lg: "sn-lg",
  xl: "sn-xl",
};

/** 匹配应作用在外层 `.sn-ib` 包装容器上的布局/尺寸/定位类（含响应式与 `!` 前缀）。 */
const WRAPPER_TOKEN_RE =
  /^(?:[a-z0-9@[\]-]+:)*!?(?:w-|min-w-|max-w-|m[xytrblse]?-|-m[xytrblse]?-|flex(?:$|-(?:1|auto|initial|none|grow|shrink))|grow(?:-|$)|shrink(?:-|$)|basis-|self-|justify-self-|place-self-|order-|col-|row-|static$|relative$|absolute$|fixed$|sticky$|inset-|top-|right-|bottom-|left-|start-|end-|z-|hidden$|block$|inline-block$|inline-flex$|inline-grid$|grid$)/;

/** 不带响应式前缀的显式宽度类（例如 `w-48` / `!w-40`），出现时外层不再强加 `w-full`。 */
const BARE_WIDTH_TOKEN_RE = /^!?w-/;

/** 仅匹配会直接压扁前后缀内边距的裸水平 padding 类。 */
const HORIZONTAL_PADDING_RE = /^!?px-/;
const START_PADDING_RE = /^!?p[ls]-/;
const END_PADDING_RE = /^!?p[re]-/;

function splitInputClasses(
  className: string | undefined,
  hasStart: boolean,
  hasEnd: boolean,
): { wrapperClasses: string[]; inputClasses: string[]; hasExplicitWidth: boolean } {
  const wrapperClasses: string[] = [];
  const inputClasses: string[] = [];
  let hasExplicitWidth = false;

  if (!className) {
    return { wrapperClasses, inputClasses, hasExplicitWidth };
  }

  for (const token of className.split(/\s+/)) {
    if (!token) continue;
    if (WRAPPER_TOKEN_RE.test(token)) {
      wrapperClasses.push(token);
      if (BARE_WIDTH_TOKEN_RE.test(token)) hasExplicitWidth = true;
      continue;
    }
    // 带前后缀时拦截调用方手写的裸 px-*/pl-*/pr-*，避免工具层 padding 压过
    // @layer satin 的 .sn-ib.sn-has-pre/.sn-has-post 留白导致文字与图标重叠。
    if ((hasStart || hasEnd) && HORIZONTAL_PADDING_RE.test(token)) continue;
    if (hasStart && START_PADDING_RE.test(token)) continue;
    if (hasEnd && END_PADDING_RE.test(token)) continue;
    inputClasses.push(token);
  }

  return { wrapperClasses, inputClasses, hasExplicitWidth };
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    className,
    endAdornment,
    startAdornment,
    variant = "solid",
    size = "default",
    invalid,
    ...props
  },
  ref,
) {
  const ariaLabel =
    props["aria-label"] ??
    (!props.id && !props["aria-labelledby"] && typeof props.placeholder === "string"
      ? props.placeholder
      : undefined);

  const ariaInvalid = props["aria-invalid"];
  const isInvalid = invalid === true || ariaInvalid === true || ariaInvalid === "true";

  const inputProps = {
    ...props,
    "aria-invalid": isInvalid ? true : props["aria-invalid"],
  };

  if (!startAdornment && !endAdornment) {
    const mergedClassName =
      variant === "ghost"
        ? [
            "w-full bg-transparent text-sm text-inherit outline-none placeholder:text-inherit placeholder:opacity-60",
            className,
          ]
            .filter(Boolean)
            .join(" ")
        : ["sn-input", SIZE_CLASS[size], className].filter(Boolean).join(" ");

    return <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...inputProps} />;
  }

  const { wrapperClasses, inputClasses, hasExplicitWidth } = splitInputClasses(
    className,
    Boolean(startAdornment),
    Boolean(endAdornment),
  );

  const innerClassName =
    variant === "ghost"
      ? [
          "w-full bg-transparent text-sm text-inherit outline-none placeholder:text-inherit placeholder:opacity-60",
          ...inputClasses,
        ]
          .filter(Boolean)
          .join(" ")
      : ["sn-input w-full", SIZE_CLASS[size], ...inputClasses].filter(Boolean).join(" ");

  return (
    <span
      className={[
        "sn-ib min-w-0",
        hasExplicitWidth ? null : "w-full",
        startAdornment ? "sn-has-pre" : null,
        endAdornment ? "sn-has-post" : null,
        ...wrapperClasses,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {startAdornment ? (
        <span className="sn-pre inline-flex items-center justify-center">{startAdornment}</span>
      ) : null}
      <input ref={ref} className={innerClassName} aria-label={ariaLabel} {...inputProps} />
      {endAdornment ? (
        <span className="sn-post inline-flex items-center justify-center">{endAdornment}</span>
      ) : null}
    </span>
  );
});
