import { type ReactNode } from "react";

/**
 * 只有语义色调：数量、请求头这类计数一律中性；只有「失败」这种出了问题的数才用红色淡底。
 * 以前按类别上色（模型蓝、排除红、成功绿），一张卡片上一排三四种颜色，读起来花而且没有主次。
 */
type MetricTone = "neutral" | "danger";

interface ProviderMetricChipProps {
  tone?: MetricTone;
  icon?: ReactNode;
  label: string;
  value?: number | string;
  title?: string;
}

// Squared corners, 2xs type, flat tint: the badge language of the AI accounts
// card, so a provider card and an account card read as the same component.
const toneClass: Record<MetricTone, string> = {
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function ProviderMetricChip({
  tone = "neutral",
  icon,
  label,
  value,
  title,
}: ProviderMetricChipProps) {
  return (
    <span
      className={`inline-flex h-5 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-semibold leading-none ${toneClass[tone]}`}
      title={title}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
      {value !== undefined ? (
        <span className="shrink-0 tabular-nums">{value}</span>
      ) : null}
    </span>
  );
}
