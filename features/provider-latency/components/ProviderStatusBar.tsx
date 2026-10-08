import { useTranslation } from "react-i18next";
import type { StatusBarData } from "@code-proxy/domain";

const blockClass = (state: StatusBarData["blocks"][number]) => {
  if (state === "success") return "bg-emerald-500";
  if (state === "failure") return "bg-rose-500";
  if (state === "mixed") return "bg-amber-500";
  return "bg-track";
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

  // 偏低变琥珀、很低变红——和卡片上的成功率同一套规则；达标（≥90%）简约风格是墨色，多彩风格是绿色。
  const rateClass = !hasData
    ? "text-ink-3"
    : data.successRate >= 90
      ? "text-ink colorful:text-emerald-600 colorful:dark:text-emerald-300"
      : data.successRate >= 50
        ? "text-amber-700 dark:text-amber-300"
        : "text-rose-700 dark:text-rose-300";

  // 不再垫一块白底（深色下是一块更黑的底）：放在表格格子里，它本来就落在行的底色上。
  const containerCls = compact
    ? "flex min-w-0 flex-col items-stretch gap-1 px-2 py-1 sm:flex-row sm:items-center sm:gap-2"
    : "flex min-w-0 flex-col items-stretch gap-1 px-2.5 py-1.5 sm:flex-row sm:items-center sm:gap-2";

  const ariaLabel = hasData
    ? `${t("common.success_rate")} ${rateText}, ${t("providers.success_stats", { count: data.totalSuccess })}, ${t("providers.failed_stats", { count: data.totalFailure })}`
    : `${t("common.success_rate")} --`;

  const barHeight = compact ? "h-1.5" : "h-2";
  const rateWidth = compact ? "sm:w-12" : "sm:w-14";

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
            className={barHeight + " w-full rounded-xs " + blockClass(state)}
            aria-hidden="true"
          />
        ))}
      </div>
      <span
        className={`${rateWidth} min-w-0 shrink-0 text-left text-xs font-semibold tabular-nums sm:text-right ${rateClass}`}
      >
        {rateText}
      </span>
    </div>
  );
}
