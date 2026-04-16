import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import {
  controlHeightBySize,
  controlPaddingBySize,
  controlSurface,
  controlTextBySize,
  type ControlSize,
} from "@/modules/ui/controlStyles";

type InputVariant = "solid" | "ghost";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  size?: ControlSize;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
}

const VARIANT_STYLES: Record<InputVariant, string> = {
  solid: controlSurface,
  ghost: "bg-transparent text-inherit placeholder:text-inherit placeholder:opacity-60",
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, endAdornment, startAdornment, variant = "solid", size = "default", ...props },
  ref,
) {
  const ariaLabel =
    props["aria-label"] ?? (typeof props.placeholder === "string" ? props.placeholder : undefined);

  const mergedClassName = [
    "w-full text-sm outline-none",
    "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
    "transition",
    controlHeightBySize[size],
    controlTextBySize[size],
    variant === "solid" ? controlPaddingBySize[size] : null,
    VARIANT_STYLES[variant],
    startAdornment ? "pl-9" : null,
    endAdornment ? "pr-10" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!startAdornment && !endAdornment) {
    return <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...props} />;
  }

  return (
    <div className="relative">
      {startAdornment ? (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {startAdornment}
        </div>
      ) : null}
      <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...props} />
      {endAdornment ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{endAdornment}</div>
      ) : null}
    </div>
  );
});
