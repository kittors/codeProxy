import { useId, type ReactNode } from "react";
import { Checkbox } from "../primitives/Checkbox";
import { cn } from "../utils/selectStyles";

/**
 * 带说明的勾选项：整行可点，勾选框 + 名称 + 一句说明。
 * 用在「同时删除日志」「保存后立即刷新」这类附加选项上，比一个裸复选框加长句子好读。
 * `tone="danger"` 给「勾上会多删东西」的选项，勾选后描边转红提醒。
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
        "flex items-start gap-3 rounded-2xl px-3.5 py-3 transition-[background-color,box-shadow]",
        checked && tone === "danger"
          ? "bg-rose-500/[0.05] shadow-[0_0_0_1px_rgb(229_72_77/0.3)]"
          : "bg-surface shadow-control hover:bg-surface-hover",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        // 整行 label 包住了说明，不显式指定的话读屏会把说明也念进名称里。
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-ink">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs leading-5 text-ink-3">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
