import { useLayoutEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { initSeg } from "satin-ui";
import { cn } from "../utils/selectStyles";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Satin 原生分段单选（直连 `satin-ui` 的 `initSeg` 流体双曲线物理滑块引擎）：
 * 前缘先到、后缘延迟 45ms 跟上、落定时纵向轻压回弹，保留 radiogroup 语义与方向键切换。
 * 传入 `w-full` 时自动走 Satin 原生等宽网格 `grid-auto-columns: 1fr`，否则自适应紧凑排列。
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
  const segRef = useRef<ReturnType<typeof initSeg> | null>(null);
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = options.filter((option) => !option.disabled);
  const isBlock = Boolean(className && /\bw-full\b/.test(className));
  const optionSig = useMemo(() => options.map((opt) => opt.value).join("\u001f"), [options]);
  const activeIdx = options.findIndex((option) => option.value === value);
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const api = initSeg(container, undefined, activeIdxRef.current, {
      role: "radio",
      controlled: true,
      fitScroll: false,
      keyboard: false,
    });
    segRef.current = api;
    return () => {
      api.destroy();
      if (segRef.current === api) segRef.current = null;
    };
  }, [optionSig]);

  useLayoutEffect(() => {
    segRef.current?.sync(activeIdx, false);
  }, [activeIdx, optionSig]);

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
      className={cn(
        "sn-seg",
        isBlock ? "sn-seg-block" : "!inline-flex",
        size === "sm" ? "sn-sm" : null,
        className,
      )}
    >
      <span aria-hidden="true" className="sn-thumb" style={{ opacity: 0 }} />
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
              isBlock ? "min-w-0 w-full" : null,
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
