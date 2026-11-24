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

const SATIN_CHECK_PATH = "M2.5 6.2l2.4 2.4 4.6-5";
const SATIN_OVERSHOOT = "cubic-bezier(.34,1.56,.64,1)";

/**
 * Satin 复选框：使用 Satin `.sn-check` + `.sn-box`（一笔画 SVG 对勾 + 半选横杠 + 弹性回弹微动效）。
 * 用 span.sn-check-solo 包装以避免外部已有 <label> 时产生非法嵌套，且保持 ref 指向原生 checkbox。
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, className, indeterminate = false, onCheckedChange, ...props },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <span
      className={[
        "sn-check sn-check-solo relative inline-flex shrink-0 items-center justify-center",
        indeterminate ? "sn-mixed" : checked ? "sn-on" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={innerRef}
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate ? "mixed" : checked}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => {
          const next = event.currentTarget.checked;
          if (
            next &&
            boxRef.current &&
            typeof boxRef.current.animate === "function" &&
            !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
          ) {
            boxRef.current.animate(
              [
                { scale: "1", easing: SATIN_OVERSHOOT },
                { scale: "0.88", offset: 0.4, easing: SATIN_OVERSHOOT },
                { scale: "1" },
              ],
              { duration: 260 },
            );
          }
          onCheckedChange?.(next);
        }}
        {...props}
      />
      <span ref={boxRef} className="sn-box pointer-events-none" aria-hidden="true">
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={SATIN_CHECK_PATH} />
        </svg>
        <span className="sn-bar" />
      </span>
    </span>
  );
});
