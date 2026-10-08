import { type ReactNode } from "react";

/**
 * 语义色调 danger 只给「失败」这种出了问题的数，两种配色风格都是红色淡底。
 * 色相名（模型蓝、排除红、成功绿）是类别色：基础样式与 neutral 一样是中性淡底（简约风格），
 * 多彩风格下才叠上对应的颜色；请求头这类计数始终中性。
 */
type MetricTone = "neutral" | "danger" | "blue" | "rose" | "emerald";

interface ProviderMetricChipProps {
  tone?: MetricTone;
  icon?: ReactNode;
  label: string;
  value?: number | string;
  title?: string;
}

const NEUTRAL_CHIP = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

// Squared corners, 2xs type, flat tint: the badge language of the AI accounts
// card, so a provider card and an account card read as the same component.
const toneClass: Record<MetricTone, string> = {
  neutral: NEUTRAL_CHIP,
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  blue: `${NEUTRAL_CHIP} colorful:bg-blue-50 colorful:text-blue-700 colorful:dark:bg-blue-500/15 colorful:dark:text-blue-200`,
  rose: `${NEUTRAL_CHIP} colorful:bg-rose-50 colorful:text-rose-700 colorful:dark:bg-rose-500/15 colorful:dark:text-rose-200`,
  emerald: `${NEUTRAL_CHIP} colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-200`,
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
