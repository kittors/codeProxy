import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../utils/selectStyles";
import { useSatinFluidThumb } from "../utils/satinMotion";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Satin 分段单选（.sn-seg + .sn-thumb + edgeFrames 流体双曲线滑块微动效）：
 * 前缘先到、后缘跟上、落定时纵向轻压回弹，保留 radiogroup 语义与方向键切换。
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = options.filter((option) => !option.disabled);

  const selector = `[data-seg-value="${CSS.escape(value)}"]`;
  useSatinFluidThumb(containerRef, thumbRef, selector, value);

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
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn("sn-seg !inline-flex", size === "sm" ? "sn-sm" : null, className)}
    >
      <span ref={thumbRef} aria-hidden="true" className="sn-thumb" style={{ opacity: 0 }} />
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
            aria-selected={selected}
            data-seg-value={option.value}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "!inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45",
              size === "sm" ? "!px-2.5 !text-xs" : "!px-3.5 !text-sm",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
