import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import {
  controlHeightBySize,
  controlPaddingBySize,
  controlSurface,
  controlTextBySize,
  type ControlSize,
} from "../utils/controlStyles";

type InputVariant = "solid" | "ghost";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  size?: ControlSize;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  /** Explicit invalid visual; also reacts to aria-invalid from FormField. */
  invalid?: boolean;
}

const VARIANT_STYLES: Record<InputVariant, string> = {
  solid: controlSurface,
  ghost: "bg-transparent text-inherit placeholder:text-inherit placeholder:opacity-60",
};

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
  // 没有标签可依附时才拿 placeholder 兜底当名称（搜索框这类独立输入框）。有 id（FormField 会
  // 用 `<label for>` 指过来）或 aria-labelledby 时不能兜底：aria-label 的优先级高于 label，
  // 读屏会把「例如：香港住宅 IP」这种示例读成字段名，可见的标签反而被盖掉。
  const ariaLabel =
    props["aria-label"] ??
    (!props.id && !props["aria-labelledby"] && typeof props.placeholder === "string"
      ? props.placeholder
      : undefined);

  const ariaInvalid = props["aria-invalid"];
  const isInvalid =
    invalid === true || ariaInvalid === true || ariaInvalid === "true";

  const mergedClassName = [
    "w-full text-sm outline-none",
    "focus:outline-none focus-visible:outline-none",
    controlHeightBySize[size],
    controlTextBySize[size],
    variant === "solid" ? controlPaddingBySize[size] : null,
    // 无效态的红色描边由 controlSurface 里的 aria-[invalid=true] 变体负责，下面会把
    // invalid 属性同步成 aria-invalid，这里不再条件拼接类名。
    VARIANT_STYLES[variant],
    startAdornment ? "pl-9" : null,
    endAdornment ? "pr-10" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inputProps = {
    ...props,
    "aria-invalid": isInvalid ? true : props["aria-invalid"],
  };

  if (!startAdornment && !endAdornment) {
    return <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...inputProps} />;
  }

  return (
    <div className="relative">
      {startAdornment ? (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {startAdornment}
        </div>
      ) : null}
      <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...inputProps} />
      {endAdornment ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{endAdornment}</div>
      ) : null}
    </div>
  );
});
