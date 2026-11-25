import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "satin-ui/react";
import { useOptionalFormField } from "../primitives/Form";
import { HUE_SOLID, HUE_TILE, hueForIcon } from "../theme/hues";
import { cn } from "../utils/selectStyles";

function choiceIconClass(icon: ReactNode, selected: boolean): string {
  const base = selected
    ? "bg-[var(--sn-fill-active)] text-[var(--sn-label)]"
    : "bg-[var(--sn-fill-subtle)] text-[var(--sn-label2)]";
  const hue = hueForIcon(icon);
  if (!hue) return base;
  return cn(base, selected ? HUE_SOLID[hue] : HUE_TILE[hue]);
}

export interface ChoiceCardOption<T extends string = string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
} as const;

/**
 * 基于 Satin 卡片规范的卡片式单选（radiogroup）：
 * 实面底 + 1px 细边，选中时平滑切换至 Satin `--sn-accent` 聚焦描边与弹性选中圆点，
 * 零 framer-motion 依赖，保持完整方向键导航与无障碍语义。
 */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
  ariaLabel,
  disabled = false,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly ChoiceCardOption<T>[];
  columns?: keyof typeof COLUMNS;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const field = useOptionalFormField();
  const describedBy = field
    ? [field.descriptionId, field.errorId].filter(Boolean).join(" ") || undefined
    : undefined;
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = options.filter((option) => !option.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if ((!forward && !backward) || disabled || enabled.length === 0) return;
    event.preventDefault();
    const index = enabled.findIndex((option) => option.value === value);
    const next = enabled[(index + (forward ? 1 : -1) + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    buttonsRef.current[next.value]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : field?.labelId}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn("grid gap-2.5", COLUMNS[columns], className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const optionDisabled = disabled || option.disabled;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[option.value] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={optionDisabled}
            tabIndex={
              selected || (!enabled.some((o) => o.value === value) && option === enabled[0])
                ? 0
                : -1
            }
            onClick={() => onChange(option.value)}
            className={cn(
              "group relative flex min-w-0 items-start gap-3 rounded-xl border bg-[var(--sn-raised)] px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[var(--sn-ease-out)] active:scale-[0.99]",
              selected
                ? "border-[var(--sn-accent)] shadow-[0_0_0_1px_var(--sn-accent)]"
                : "border-[var(--sn-line)] hover:border-[var(--sn-line-control-hover)] hover:bg-[var(--sn-fill-hover)]",
              optionDisabled ? "cursor-not-allowed opacity-50 active:scale-100" : "cursor-pointer",
            )}
          >
            {option.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors [&_svg]:size-4",
                  choiceIconClass(option.icon, selected),
                )}
              >
                {option.icon}
              </span>
            ) : null}
            <span className="relative min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--sn-label)]">
                {option.label}
              </span>
              {option.description ? (
                <span className="mt-0.5 block text-xs leading-5 text-[var(--sn-label3)]">
                  {option.description}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full transition-all duration-200 ease-[var(--sn-ease-overshoot)]",
                selected
                  ? "scale-100 bg-[var(--sn-accent)] text-[var(--sn-on-primary)]"
                  : "bg-[var(--sn-field)] shadow-[inset_0_0_0_1px_var(--sn-line-control)]",
              )}
            >
              {selected ? <Icon name="check" size={10} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
