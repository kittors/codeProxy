import { chartPalette, chartTooltipStyle } from "@code-proxy/ui";
import { CHART_COLORS } from "../monitor-constants";
import { formatCompact } from "../monitor-format";
import type { ModelDistributionDatum } from "./types";

export const MODEL_DISTRIBUTION_VISIBLE_LIMIT = 5;

export const buildModelDistributionData = (input: {
  items: Array<{ model: string; requests: number; tokens: number }>;
  metric: "requests" | "tokens";
  otherLabel: string;
  limit?: number;
}): ModelDistributionDatum[] => {
  const limit = input.limit ?? MODEL_DISTRIBUTION_VISIBLE_LIMIT;
  const sorted = [...input.items].sort((left, right) => {
    const leftValue = input.metric === "requests" ? left.requests : left.tokens;
    const rightValue = input.metric === "requests" ? right.requests : right.tokens;
    return rightValue - leftValue || left.model.localeCompare(right.model);
  });
  const data = sorted.slice(0, limit).map((item) => ({
    name: item.model,
    value: input.metric === "requests" ? item.requests : item.tokens,
  }));
  const otherValue = sorted
    .slice(limit)
    .reduce(
      (acc, item) => acc + (input.metric === "requests" ? item.requests : item.tokens),
      0,
    );

  if (otherValue > 0) data.push({ name: input.otherLabel, value: otherValue });
  return data;
};

export const createModelDistributionOption = (input: {
  isDark: boolean;
  data: ModelDistributionDatum[];
}): Record<string, unknown> => {
  return {
    backgroundColor: "transparent",
    color: [...CHART_COLORS, chartPalette(input.isDark).series[2]],
    tooltip: {
      trigger: "item",
      renderMode: "html",
      appendToBody: false,
      confine: true,
      ...chartTooltipStyle(input.isDark),
      extraCssText: `${chartTooltipStyle(input.isDark).extraCssText} z-index: 10000;`,
      formatter: (params: { name: string; value: number; percent: number }) => {
        const valueLabel = formatCompact(params.value ?? 0);
        return `${params.name}<br/>${valueLabel}（${(params.percent ?? 0).toFixed(1)}%）`;
      },
    },
    series: [
      {
        name: "Model",
        type: "pie",
        radius: ["52%", "74%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderRadius: 4,
          borderWidth: 2,
          // 扇区之间的分隔线取卡片底色，深浅色都像是「切开」而不是描了一圈边。
          borderColor: input.isDark ? "#2a2a2a" : "#ffffff",
        },
        emphasis: { scale: true, scaleSize: 6 },
        data: input.data,
      },
    ],
    animationEasing: "cubicOut" as const,
    animationDuration: 520,
    animationDurationUpdate: 360,
  };
};
