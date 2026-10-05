import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";
import "./Checkbox.css";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "onChange" | "type"
> {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** 外观在 Checkbox.css 里（自绘方框 + mask 对勾）；尺寸留在工具类上，调用方可以覆盖。 */
const checkboxClassName = "cp-checkbox h-4 w-4 shrink-0";

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, className, indeterminate = false, onCheckedChange, ...props },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);

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
      className={[checkboxClassName, className].filter(Boolean).join(" ")}
      checked={checked}
      aria-checked={indeterminate ? "mixed" : checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  );
});
