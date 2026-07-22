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

const INVALID_SOLID =
  "border-rose-400 hover:border-rose-500 focus-visible:border-rose-500 dark:border-rose-500/70 dark:hover:border-rose-400 dark:focus-visible:border-rose-400";

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
    props["aria-label"] ?? (typeof props.placeholder === "string" ? props.placeholder : undefined);

  const ariaInvalid = props["aria-invalid"];
  const isInvalid =
    invalid === true ||
    ariaInvalid === true ||
    ariaInvalid === "true" ||
    ariaInvalid === "";

  const mergedClassName = [
    "w-full text-sm outline-none",
    "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
    "transition",
    controlHeightBySize[size],
    controlTextBySize[size],
    variant === "solid" ? controlPaddingBySize[size] : null,
    VARIANT_STYLES[variant],
    variant === "solid" && isInvalid ? INVALID_SOLID : null,
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
