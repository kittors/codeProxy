import { Activity, Binary, CircleDollarSign, type LucideIcon } from "lucide-react";
import type { QuotaMetric } from "@code-proxy/api-client";
import { HUE_GLYPH, HUE_SOFT, HUE_TILE, type Hue } from "@code-proxy/ui";

/**
 * 三种度量各有固定的图标与色相，在矩阵、列表、规则卡片里一致：
 * 花费琥珀（钱，与全站「额度与费用」同色），请求翠绿（流量脉搏），Token 紫罗兰（模型产出）。
 * 色相只在多彩外观下生效，简约 / 单色时落回调用方的中性基础类。
 */
export const METRIC_META: Record<QuotaMetric, { icon: LucideIcon; hue: Hue }> = {
  cost: { icon: CircleDollarSign, hue: "amber" },
  requests: { icon: Activity, hue: "emerald" },
  tokens: { icon: Binary, hue: "violet" },
};

export function MetricGlyph({
  metric,
  size = 14,
  className = "",
}: {
  metric: QuotaMetric;
  size?: number;
  className?: string;
}) {
  const { icon: Icon, hue } = METRIC_META[metric];
  return <Icon size={size} aria-hidden="true" className={`shrink-0 text-ink-3 ${HUE_GLYPH[hue]} ${className}`} />;
}

/** 带渐变淡底的小图标块（矩阵行头、规则卡片）。 */
export function MetricTile({ metric, size = "sm" }: { metric: QuotaMetric; size?: "sm" | "md" }) {
  const { icon: Icon, hue } = METRIC_META[metric];
  const box = size === "md" ? "h-8 w-8 rounded-xl" : "h-7 w-7 rounded-lg";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07] ${box} ${HUE_TILE[hue]}`}
    >
      <Icon size={size === "md" ? 16 : 14} />
    </span>
  );
}

export const metricSoftClass = (metric: QuotaMetric) => HUE_SOFT[METRIC_META[metric].hue];
