import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../utils/selectStyles";

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
              "group relative flex min-w-0 items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors duration-150",
              selected
                ? "border-transparent bg-surface"
                : "border-line bg-surface hover:border-line-strong hover:bg-surface-hover",
              optionDisabled ? "cursor-not-allowed opacity-50" : null,
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`choice-card-${groupId}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-2xl border-[1.5px] border-ink shadow-xs"
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }
                }
              />
            ) : null}
            {option.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors [&_svg.lucide]:size-[16px]",
                  selected
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-line bg-subtle text-ink-2",
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
                "relative mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                selected ? "border-ink bg-ink text-surface" : "border-line-strong bg-field",
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
