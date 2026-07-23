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
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:focus-visible:ring-white/15",
        disabled ? "opacity-60" : null,
        checked
          ? "border-slate-900 bg-slate-900 dark:border-white dark:bg-white"
          : "border-slate-200 bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition",
          checked ? "translate-x-6 dark:bg-neutral-950" : "translate-x-1 dark:bg-white",
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
          <label
            htmlFor={resolvedId}
            className="block text-sm font-semibold text-slate-900 dark:text-white"
          >
            {label}
          </label>
        ) : null}
        {description ? (
          <p className="mt-1 text-sm text-slate-600 dark:text-white/65">{description}</p>
        ) : null}
      </div>
      {button}
    </div>
  );
}
