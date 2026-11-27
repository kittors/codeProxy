import { useId, type ReactNode } from "react";
import { Checkbox } from "../primitives/Checkbox";
import { cn } from "../utils/selectStyles";

/**
 * 带说明的 Satin 勾选项：整行可点，使用 Satin 一笔画弹性复选框与实面令牌。
 */
export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  tone = "neutral",
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  const id = useId();
  const labelId = useId();
  const descriptionId = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-[background-color,border-color]",
        checked && tone === "danger"
          ? "border-[var(--sn-danger)]/40 bg-[var(--sn-b-danger-soft)]"
          : "border-[var(--sn-line)] bg-[var(--sn-raised)] hover:border-[var(--sn-line-control-hover)] hover:bg-[var(--sn-fill-hover)]",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-[var(--sn-label)]">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs leading-5 text-[var(--sn-label3)]">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
