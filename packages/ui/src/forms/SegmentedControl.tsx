import { motion, useReducedMotion } from "framer-motion";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../utils/selectStyles";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * 分段单选：2–4 个简短、互斥、不需要解释的选项（协议、方式、单位）。
 * 需要逐项解释时用 ChoiceCards。
 *
 * 语义是 radiogroup（不是 tablist——它不切换面板，只是选值）；方向键切换并选中，
 * 选中块在选项间弹簧滑动，与「添加 AI 账号」里的方式切换同一种手感。
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  size = "md",
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const layoutId = `segmented-${useId()}`;
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = options.filter((option) => !option.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
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
      className={cn("inline-flex rounded-full bg-track p-0.5", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[option.value] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              selected ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-elevated shadow-xs"
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }
                }
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
