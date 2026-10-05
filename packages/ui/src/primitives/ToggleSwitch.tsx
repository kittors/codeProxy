import { useId, type ReactNode } from "react";

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

/**
 * 开关：40×24（按设计稿尺寸，随根字号缩放），开启时轨道填强调色。
 *
 * 滑块用回弹曲线移动；按住时滑块横向拉长一截、松手再弹回，模仿原生开关的按压手感。
 * 开启态拉长时要同步少移一点（translate-x-3 而不是 4），右边缘才不会冲出轨道。
 * 深色模式下强调色是浅色，开启态的滑块反过来用深色，保证对比。
 * 键盘焦点用全局 :focus-visible 描边，不再单独配光晕。
 */
export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  ariaLabel,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: ToggleSwitchProps) {
  const generatedId = useId();
  const resolvedId = id ?? generatedId;
  const hasText = Boolean(label || description);

  const button = (
    <button
      id={resolvedId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={[
        "group relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors duration-250 ease-soft",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-accent" : "bg-line-strong dark:bg-white/15",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white",
          "shadow-[0_2px_5px_rgb(0_0_0/0.16),0_0_0_0.5px_rgb(0_0_0/0.04)]",
          "transition-[translate,width] duration-[380ms] ease-spring group-active:w-6",
          checked ? "translate-x-4 group-active:translate-x-3 dark:bg-accent-fg" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );

  if (!hasText) {
    return button;
  }

  return (
    <div
      className={
        description
          ? "flex items-start justify-between gap-4"
          : "flex items-center justify-between gap-4"
      }
    >
      <div className="min-w-0">
        {label ? (
          <label htmlFor={resolvedId} className="block text-sm font-medium text-ink">
            {label}
          </label>
        ) : null}
        {description ? <p className="mt-0.5 text-sm text-ink-2">{description}</p> : null}
      </div>
      {button}
    </div>
  );
}
