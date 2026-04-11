import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

type InputVariant = "solid" | "ghost";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  endAdornment?: ReactNode;
}

const VARIANT_STYLES: Record<InputVariant, string> = {
  solid:
    "h-9 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 shadow-sm placeholder:text-slate-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100 dark:placeholder:text-neutral-500",
  ghost: "bg-transparent text-inherit placeholder:text-inherit placeholder:opacity-60",
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, endAdornment, variant = "solid", ...props },
  ref,
) {
  const ariaLabel =
    props["aria-label"] ?? (typeof props.placeholder === "string" ? props.placeholder : undefined);

  const mergedClassName = [
    "w-full text-sm outline-none",
    "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
    "transition",
    VARIANT_STYLES[variant],
    endAdornment ? "pr-10" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!endAdornment) {
    return <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...props} />;
  }

  return (
    <div className="relative">
      <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...props} />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">{endAdornment}</div>
    </div>
  );
});
