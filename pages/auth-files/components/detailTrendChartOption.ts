import { CHART_CATEGORICAL, chartAxisStyle, chartPalette, chartTooltipStyle } from "@code-proxy/ui";
import { formatTrendChartTooltip } from "./trendTooltipFormatter";

/**
 * 账号详情「请求 / 费用 / 额度占用」趋势图的 echarts 配置。
 *
 * 配色走共享图表主题，和仪表盘、监控中心同一套：请求数是灰柱，费用是主色线，额度占用线
 * 用分类色轮换；网格、坐标轴、图例都是中性灰，深色模式随主题切换。
 *
 * 序列顺序不能动：trendTooltipFormatter 按 seriesIndex 判断格式——0 是请求柱，1 是费用线
 * （显示成金额），之后都是额度百分比。
 */
export function buildDetailTrendChartOption({
  isDark,
  categories,
  requests,
  cost,
  quotaSeries,
  labels,
  animate,
  animationMs,
  formatCurrency,
}: {
  isDark: boolean;
  categories: string[];
  requests: number[];
  cost: number[];
  quotaSeries: { name: string; values: (number | null)[] }[];
  labels: { requests: string; cost: string };
  animate: boolean;
  animationMs: number;
  formatCurrency: (value: number) => string;
}) {
  const palette = chartPalette(isDark);
  const axis = chartAxisStyle(isDark);
  const seriesAnimation = {
    animation: animate,
    animationDuration: animate ? animationMs : 0,
    animationDurationUpdate: 0,
  };
  const valueAxisLabel = { ...axis.axisLabel, hideOverlap: true };

  return {
    ...seriesAnimation,
    animationEasing: "cubicOut" as const,
    grid: { left: 46, right: 108, top: 74, bottom: 38 },
    tooltip: {
      ...chartTooltipStyle(isDark),
      trigger: "axis",
      confine: true,
      formatter: (params: unknown) => formatTrendChartTooltip(params, formatCurrency),
    },
    legend: {
      top: 8,
      left: 8,
      right: 8,
      type: "scroll",
      itemGap: 14,
      pageButtonPosition: "end",
      pageIconColor: palette.ink2,
      pageIconInactiveColor: palette.axis,
      pageTextStyle: { color: palette.ink3 },
      textStyle: { color: palette.ink2, width: 154, overflow: "truncate" },
    },
    xAxis: {
      type: "category",
      data: categories,
      axisLine: axis.axisLine,
      axisTick: axis.axisTick,
      axisLabel: valueAxisLabel,
    },
    yAxis: [
      {
        type: "value",
        min: 0,
        axisLabel: valueAxisLabel,
        splitLine: axis.splitLine,
      },
      {
        type: "value",
        min: 0,
        max: 100,
        offset: 46,
        axisLabel: { ...valueAxisLabel, formatter: "{value}%" },
        splitLine: { show: false },
      },
      {
        type: "value",
        min: 0,
        axisLabel: {
          ...valueAxisLabel,
          formatter: (value: number) => {
            if (!Number.isFinite(value)) return "$0";
            if (Math.abs(value) < 1) return `$${value.toFixed(3)}`;
            return `$${value.toFixed(1)}`;
          },
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: labels.requests,
        type: "bar",
        yAxisIndex: 0,
        ...seriesAnimation,
        barMaxWidth: 24,
        itemStyle: { color: palette.bar, borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: palette.barHover } },
        data: requests,
      },
      {
        name: labels.cost,
        type: "line",
        yAxisIndex: 2,
        ...seriesAnimation,
        connectNulls: true,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2.2, color: palette.primary },
        itemStyle: { color: palette.primary },
        areaStyle: { color: isDark ? "rgba(236, 236, 236, 0.06)" : "rgba(13, 13, 13, 0.05)" },
        data: cost,
      },
      ...quotaSeries.map(({ name, values }, index) => {
        const color = CHART_CATEGORICAL[index % CHART_CATEGORICAL.length];
        return {
          name,
          type: "line",
          yAxisIndex: 1,
          ...seriesAnimation,
          connectNulls: true,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          data: values,
        };
      }),
    ],
  };
}
