import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MaskDay } from "@code-proxy/api-client";

/**
 * 每天脱敏了多少处：一天一根柱，今天用紫色，其余是淡墨色；没有的日子只留一截底线，看得出
 * 「那天没有」而不是「数据缺了」。指向一根柱，上方说这一天的处数和请求数。
 */
export function MaskingDayBars({ days }: { days: MaskDay[] }) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.places));
  const last = days.length - 1;
  const dayName = (index: number) => {
    if (index === last) return t("privacy_masking.today");
    const date = new Date(`${days[index].day}T00:00:00`);
    return date.toLocaleDateString(i18n.language, { month: "numeric", day: "numeric" });
  };
  const total = days.reduce((sum, d) => sum + d.places, 0);
  const shown = hover ?? last;

  return (
    <div
      className="relative"
      role="img"
      aria-label={t("privacy_masking.days_aria", { count: total, days: days.length })}
    >
      <div className="mb-1.5 h-4 text-2xs text-ink-3 tabular-nums" aria-hidden="true">
        {hover === null
          ? null
          : t("privacy_masking.day_tip", {
              day: dayName(shown),
              places: days[shown].places.toLocaleString(i18n.language),
              requests: days[shown].requests.toLocaleString(i18n.language),
            })}
      </div>
      <div className={`flex h-12 items-end ${days.length > 14 ? "gap-[3px]" : "gap-1.5"}`}>
        {days.map((day, index) => {
          const pct = day.places > 0 ? Math.max(10, (100 * day.places) / max) : 0;
          return (
            <span
              key={day.day}
              onPointerEnter={() => setHover(index)}
              onPointerLeave={() => setHover(null)}
              className="relative flex h-full flex-1 items-end"
            >
              <span
                className={[
                  "w-full rounded-xs transition-[height,opacity] duration-500 ease-pop motion-safe:animate-[pm-bar-grow_700ms_cubic-bezier(0.16,1,0.3,1)]",
                  day.places === 0
                    ? "h-[3px] bg-ink/[0.07] dark:bg-white/[0.08]"
                    : index === last
                      ? "bg-violet-500 dark:bg-violet-400"
                      : "bg-ink/[0.14] dark:bg-white/[0.16]",
                  hover !== null && hover !== index ? "opacity-60" : "",
                ].join(" ")}
                style={day.places > 0 ? { height: `${pct}%` } : undefined}
              />
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-ink-3" aria-hidden="true">
        <span>{dayName(0)}</span>
        <span className={hover === null ? "font-medium text-violet-600 dark:text-violet-300" : ""}>{dayName(last)}</span>
      </div>
    </div>
  );
}
