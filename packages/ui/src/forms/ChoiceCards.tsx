import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useOptionalFormField } from "../primitives/Form";
import { HUE_SOLID, HUE_TILE, hueForIcon } from "../theme/hues";
import { cn } from "../utils/selectStyles";

/**
 * 选项图标：中性淡底，选中时换成强调色的淡底与图标色。图标着色为「多彩」时按图标的色相上色
 * （同一个图标在全站同一种颜色），选中时换成同色相的实色渐变块、白色图标，更能看出「选的是
 * 哪一类」；厂商 logo 等非 lucide 图标始终是中性底。
 */
function choiceIconClass(icon: ReactNode, selected: boolean): string {
  const base = selected ? "bg-accent-soft text-accent-ink" : "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";
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
 * 卡片式单选：选项不多（2–4 个）、而且每个选项需要一句话解释时，用它代替下拉框——
 * 下拉要点开才看得到有哪些选择，卡片一眼摊开，还能把「选了会怎样」写在选项里。
 *
 * 语义是 radiogroup：方向键在选项间移动并选中，Tab 只停在选中项上。
 * 选中框用共享布局动画在卡片间滑动，和「添加 AI 账号」的列表选中态同一种手感。
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
  const reduceMotion = useReducedMotion();
  const groupId = useId();
  // 放在 FormField 里时由字段标签命名，并带上说明与错误（没有显式 ariaLabel 时）。
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
            tabIndex={selected || (!enabled.some((o) => o.value === value) && option === enabled[0]) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "group relative flex min-w-0 items-start gap-3 rounded-2xl bg-surface px-3.5 py-3 text-left transition-[background-color,box-shadow] duration-150",
              selected ? null : "shadow-control hover:bg-surface-hover hover:shadow-control-hover",
              optionDisabled ? "cursor-not-allowed opacity-50" : null,
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`choice-card-${groupId}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_0_1.5px_var(--cp-accent),0_1px_2px_rgb(0_0_0/0.06)]"
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }
                }
              />
            ) : null}
            {option.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors [&_svg.lucide]:size-[16px]",
                  choiceIconClass(option.icon, selected),
                )}
              >
                {option.icon}
              </span>
            ) : null}
            <span className="relative min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block text-xs leading-5 text-ink-3">
                  {option.description}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors",
                selected ? "bg-accent text-accent-fg" : "bg-field shadow-control",
              )}
            >
              {selected ? <Check size={10} strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
