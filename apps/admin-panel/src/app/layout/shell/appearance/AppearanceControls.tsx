import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import { ACCENT_PRESETS, accentFill, cn, useTheme } from "@code-proxy/ui";

const SWATCH_RING =
  "shadow-[0_0_0_2px_var(--sn-overlay),0_0_0_4px_var(--sn-accent)]";

/** Satin 强调色色板：预设色点（.sn-th-dot 按压缩放）+ 自选色。 */
export function AccentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (accent: string) => void;
}) {
  const { t } = useTranslation();
  const {
    state: { mode },
  } = useTheme();
  const isDark = mode === "dark";
  const custom = value.startsWith("#");
  const customId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={t("appearance.accent")}
      className="flex flex-wrap items-center gap-2.5"
    >
      {ACCENT_PRESETS.map((preset) => {
        const selected = value === preset.id;
        const label = t(`appearance.accent_${preset.id}`);
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => onChange(preset.id)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-[box-shadow,scale] duration-150 ease-[var(--sn-ease-out)] active:scale-90",
              selected
                ? SWATCH_RING
                : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
            )}
            style={{
              background:
                preset.id === "ink"
                  ? `linear-gradient(135deg, ${preset.swatch.light} 50%, ${preset.swatch.dark} 50%)`
                  : isDark
                    ? preset.swatch.dark
                    : preset.swatch.light,
            }}
          >
            {selected ? (
              <Icon
                name="check"
                size={13}
                className="text-white drop-shadow-[0_0_1.5px_rgb(0_0_0/0.85)]"
              />
            ) : null}
          </button>
        );
      })}
      <label
        htmlFor={customId}
        title={t("appearance.accent_custom")}
        className={cn(
          "relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full transition-[box-shadow,scale] duration-150 active:scale-90",
          custom
            ? SWATCH_RING
            : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
        )}
        style={
          custom
            ? { background: value }
            : {
                background:
                  "conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
              }
        }
      >
        <Icon
          name="droplet"
          size={13}
          className="text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.4)]"
        />
        <input
          id={customId}
          type="color"
          aria-label={t("appearance.accent_custom")}
          value={custom ? value : accentFill("blue", false)}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** 状态色：Satin 色点 + 十六进制等宽读数。 */
export function StatusColorInput({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="sn-th-pick inline-flex cursor-pointer items-center gap-2.5">
      <span
        aria-hidden="true"
        className="relative size-7 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]"
        style={{ background: value }}
      />
      <span className="font-mono text-xs text-[var(--sn-label2)] uppercase tabular-nums">
        {value}
      </span>
      <input
        id={id}
        type="color"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="sr-only"
      />
    </label>
  );
}

/**
 * 基于 Satin `.sn-slider` 的精准滑块：
 * - 视觉完全由 Satin `.sn-rail` / `.sn-fillbar` / `.sn-knob` / `.sn-bubble` 绘制，
 *   悬停旋钮轻放大 1.12×、拖动放大 1.25× 并弹出反色读数气泡；
 * - 内部叠加透明原生 `<input type="range">` 承载完整键盘步进、无障碍与自动测试 `.fill()` 语义。
 */
export function RangeControl({
  value,
  min,
  max,
  step,
  label,
  format,
  disabled = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const formatted = format(value);

  return (
    <div className={cn("flex w-full items-center gap-3", disabled ? "opacity-50" : null)}>
      <div
        className={cn(
          "sn-slider relative !w-auto min-w-0 flex-1 has-[:focus-visible]:rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--sn-ring)]",
          dragging ? "sn-drag" : null,
          disabled ? "cursor-not-allowed" : null,
        )}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={formatted}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerDown={() => {
            if (!disabled) setDragging(true);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onBlur={() => setDragging(false)}
          className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span className="sn-rail pointer-events-none" />
        <span className="sn-fillbar pointer-events-none" style={{ width: `${percent}%` }} />
        <span className="sn-knob pointer-events-none" style={{ left: `${percent}%` }} />
        <span className="sn-bubble pointer-events-none" style={{ left: `${percent}%` }}>
          {formatted}
        </span>
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-medium text-[var(--sn-label)] tabular-nums">
        {formatted}
      </span>
    </div>
  );
}
