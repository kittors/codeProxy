import { useTranslation } from "react-i18next";
import type { StatusBarData } from "@/modules/providers/provider-usage";

const blockClass = (state: StatusBarData["blocks"][number]) => {
  if (state === "success") return "bg-emerald-500";
  if (state === "failure") return "bg-rose-500";
  if (state === "mixed") return "bg-amber-500";
  return "bg-slate-200 dark:bg-neutral-700";
};

export function ProviderStatusBar({
  data,
  compact = false,
  className,
}: {
  data: StatusBarData;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const hasData = data.totalSuccess + data.totalFailure > 0;
  const rateText = hasData ? `${data.successRate.toFixed(1)}%` : "--";

  const rateClass = !hasData
    ? "text-slate-400 dark:text-white/40"
    : data.successRate >= 90
      ? "text-emerald-600 dark:text-emerald-300"
      : data.successRate >= 50
        ? "text-amber-600 dark:text-amber-300"
        : "text-rose-600 dark:text-rose-300";

  const containerCls = compact
    ? "flex items-center gap-2 rounded-lg bg-white dark:bg-neutral-950 px-2 py-1"
    : "flex items-center gap-2 rounded-lg bg-white dark:bg-neutral-950 px-2.5 py-1.5";

  const ariaLabel = hasData
    ? `${t("common.success_rate")} ${rateText}, ${t("providers.success_stats", { count: data.totalSuccess })}, ${t("providers.failed_stats", { count: data.totalFailure })}`
    : `${t("common.success_rate")} --`;

  const barHeight = compact ? "h-1.5" : "h-2";
  const rateWidth = compact ? "w-12" : "w-14";

  return (
    <div
      className={[containerCls, className].filter(Boolean).join(" ")}
      role="status"
      aria-label={ariaLabel}
    >
      <div className="flex flex-1 items-center gap-px">
        {data.blocks.map((state, idx) => (
          <div
            key={idx}
            className={
              barHeight + " w-full rounded-[1px] " + blockClass(state)
            }
            aria-hidden="true"
          />
        ))}
      </div>
      <span
        className={`${rateWidth} shrink-0 text-right text-xs font-semibold tabular-nums ${rateClass}`}
      >
        {rateText}
      </span>
    </div>
  );
}
