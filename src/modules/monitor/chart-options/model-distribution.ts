import { CHART_COLORS } from "@/modules/monitor/monitor-constants";
import { formatCompact } from "@/modules/monitor/monitor-format";
import type { ModelDistributionDatum } from "@/modules/monitor/chart-options/types";

export const createModelDistributionOption = (input: {
  isDark: boolean;
  data: ModelDistributionDatum[];
}): Record<string, unknown> => {
  return {
    backgroundColor: "transparent",
    color: [...CHART_COLORS, "#94a3b8"],
    tooltip: {
      trigger: "item",
      renderMode: "html",
      appendToBody: false,
      confine: true,
      borderWidth: 0,
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      textStyle: { color: "#fff" },
      extraCssText: "z-index: 10000;",
      formatter: (params: { name: string; value: number; percent: number }) => {
        const valueLabel = formatCompact(params.value ?? 0);
        return `${params.name}<br/>${valueLabel}（${(params.percent ?? 0).toFixed(1)}%）`;
      },
    },
    series: [
      {
        name: "Model",
        type: "pie",
        radius: ["50%", "70%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderRadius: 3,
          borderWidth: 2,
          borderColor: input.isDark ? "rgba(10,10,10,0.75)" : "rgba(255,255,255,0.92)",
        },
        emphasis: { scale: true, scaleSize: 6 },
        data: input.data,
      },
    ],
    animationEasing: "cubicOut" as const,
    animationDuration: 520,
    animationDurationUpdate: 360,
    media: [
      {
        query: { maxWidth: 700 },
        option: {
          series: [
            {
              radius: ["44%", "62%"],
              center: ["50%", "48%"],
              emphasis: { scale: true, scaleSize: 4 },
            },
          ],
        },
      },
    ],
  };
};
