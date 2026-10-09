import { useTranslation } from "react-i18next";
import { Activity, Check, KeyRound, ShieldCheck, UsersRound, type LucideIcon } from "lucide-react";
import { cn, type StylePresetId } from "@code-proxy/ui";

/*
 * 两套风格的选择卡。卡片里的缩略图是写死的示意（不挂外观变体），不管当前是什么风格，
 * 两张卡都画出各自的样子，用户才能对比着选。
 */

const SAMPLE_ICONS: readonly LucideIcon[] = [UsersRound, Activity, ShieldCheck, KeyRound];

const COLORFUL_TILES = [
  "bg-gradient-to-b from-blue-500/[0.14] to-blue-500/[0.06] text-blue-600 dark:from-blue-400/20 dark:to-blue-400/10 dark:text-blue-300",
  "bg-gradient-to-b from-emerald-500/[0.14] to-emerald-500/[0.06] text-emerald-600 dark:from-emerald-400/20 dark:to-emerald-400/10 dark:text-emerald-300",
  "bg-gradient-to-b from-violet-500/[0.13] to-violet-500/[0.05] text-violet-600 dark:from-violet-400/20 dark:to-violet-400/10 dark:text-violet-300",
  "bg-gradient-to-b from-amber-500/[0.16] to-amber-500/[0.07] text-amber-600 dark:from-amber-400/20 dark:to-amber-400/10 dark:text-amber-300",
] as const;

function PresetSample({ preset }: { preset: StylePresetId }) {
  const colorful = preset === "colorful";
  return (
    <div aria-hidden="true" className="space-y-3 rounded-xl bg-subtle p-3">
      <div className="flex gap-1.5">
        {SAMPLE_ICONS.map((Icon, index) => (
          <span
            key={index}
            className={cn(
              "grid size-7 place-items-center rounded-lg",
              colorful ? COLORFUL_TILES[index] : "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
            )}
          >
            <Icon size={14} />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 flex-1 overflow-hidden rounded-full",
            colorful ? "bg-emerald-500/12 dark:bg-emerald-400/15" : "bg-track",
          )}
        >
          <div
            className={cn(
              "h-full w-4/5 rounded-full",
              colorful
                ? "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-400"
                : "bg-[#2a6ee8]",
            )}
          />
        </div>
        <span
          className={cn(
            "h-4 w-9 rounded-full",
            colorful
              ? "bg-emerald-500/15 dark:bg-emerald-400/20"
              : "bg-ink/[0.07] dark:bg-white/[0.1]",
          )}
        />
      </div>
      <div className="flex gap-1.5">
        <span
          className={cn(
            "h-5 w-14 rounded-full",
            colorful ? "bg-[#111113] dark:bg-[#f2f2f4]" : "bg-[#2a6ee8]",
          )}
        />
        <span className="h-5 w-10 rounded-full bg-surface shadow-control" />
      </div>
    </div>
  );
}

export function StylePresetCards({
  current,
  onSelect,
}: {
  current: StylePresetId | "custom";
  onSelect: (preset: StylePresetId) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t("appearance.style_title")}
      className="grid gap-3 sm:grid-cols-2"
    >
      {(["colorful", "quiet"] as const).map((preset) => {
        const selected = current === preset;
        return (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(preset)}
            className={cn(
              "flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-3.5 text-left transition-[background-color,box-shadow] duration-150",
              selected
                ? "shadow-[inset_0_0_0_1.5px_var(--cp-accent),0_1px_2px_rgb(0_0_0/0.06)]"
                : "shadow-control hover:bg-surface-hover hover:shadow-control-hover",
            )}
          >
            <PresetSample preset={preset} />
            {/* 「当前」标记和名称同一行，说明独占下一行：窄抽屉里说明不被标记挤成竖条。 */}
            <span className="min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">
                  {t(`appearance.preset_${preset}`)}
                </span>
                {selected ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-fg">
                    <Check size={11} strokeWidth={3} aria-hidden="true" />
                    {t("appearance.preset_current")}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-ink-3">
                {t(`appearance.preset_${preset}_description`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
