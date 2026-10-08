import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pipette } from "lucide-react";
import { ACCENT_PRESETS, accentFill, cn, useTheme } from "@code-proxy/ui";

/*
 * 外观页的几个小控件：强调色色板、状态色取色器、带读数的滑杆。只在外观页用，不进 ui 包。
 *
 * 取色用浏览器原生的 <input type="color">：各平台都有系统取色板，还自带吸管，比自己画一个
 * 色盘可靠；它只认 #rrggbb，正好和外观设置存的格式一致。
 */

const SWATCH_RING =
  "shadow-[0_0_0_2px_var(--cp-surface),0_0_0_4px_var(--cp-accent)] dark:shadow-[0_0_0_2px_var(--cp-surface),0_0_0_4px_var(--cp-accent-ink)]";

/** 强调色：预设色块 + 自选颜色。墨色的色块一半黑一半白，表示它在深浅模式下反转。 */
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
              "grid size-7 place-items-center rounded-full transition-[box-shadow,scale] duration-150 ease-soft active:scale-90",
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
              <Check
                size={13}
                strokeWidth={3}
                aria-hidden="true"
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
          "relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full transition-[box-shadow] duration-150",
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
        <Pipette
          size={13}
          aria-hidden="true"
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

/** 状态色：当前颜色的色块（点开系统取色板）+ 十六进制读数。 */
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
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2.5">
      <span
        aria-hidden="true"
        className="relative size-7 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]"
        style={{ background: value }}
      />
      <span className="font-mono text-xs text-ink-2 uppercase tabular-nums">{value}</span>
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

/** 滑杆 + 右侧读数。原生 range：键盘、读屏、触屏都现成可用，颜色跟随强调色。 */
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
  return (
    <div className={cn("flex w-full items-center gap-3", disabled ? "opacity-50" : null)}>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={format(value)}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--cp-accent)] disabled:cursor-not-allowed"
      />
      <span className="w-12 shrink-0 text-right text-sm font-medium text-ink tabular-nums">
        {format(value)}
      </span>
    </div>
  );
}
