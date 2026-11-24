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
 * Satin 开关（.sn-switch）：macOS 手感按压球钮横向拉长、overshoot 弹性切位、跟随 Satin 令牌。
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

  const control = (
    <span className="sn-switch relative inline-flex shrink-0 items-center">
      <input
        id={resolvedId}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className="sn-track pointer-events-none" aria-hidden="true">
        <span className="sn-knob" />
      </span>
    </span>
  );

  if (!hasText) {
    return control;
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
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {control}
    </div>
  );
}
