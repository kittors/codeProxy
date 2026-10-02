import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "onChange" | "type"
> {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const checkboxClassName =
  "h-4 w-4 rounded border-slate-300 text-slate-950 accent-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:accent-white dark:focus-visible:ring-white/20";

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked,
    className,
    indeterminate = false,
    onCheckedChange,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const isInvalid = ariaInvalid === true || ariaInvalid === "true";

  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={innerRef}
      type="checkbox"
      className={[
        checkboxClassName,
        isInvalid
          ? "ring-1 ring-rose-500/55 focus-visible:ring-rose-500/70 dark:ring-rose-400/55 dark:focus-visible:ring-rose-400/70"
          : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      checked={checked}
      aria-checked={indeterminate ? "mixed" : checked}
      aria-invalid={isInvalid ? true : ariaInvalid}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  );
});
