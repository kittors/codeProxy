import { chartAxisStyle, chartGradient, chartPalette, chartTooltipStyle } from "@code-proxy/ui";
import { quotaSeriesColor } from "../helpers/quotaSeriesColors";
import { formatTrendChartTooltip } from "./trendTooltipFormatter";

/**
 * 账号详情「请求 / 费用 / 额度占用」趋势图的 echarts 配置。
 *
 * 配色走共享图表主题，颜色都有含义，和仪表盘、监控中心对得上：
 * - 请求数：请求身份色（蓝）的同色渐变柱，悬停时渐变变实，像亮了一档；
 * - 费用：费用身份色（琥珀）实线 + 同色渐隐面积（压在柱子上，所以很淡）；
 * - 额度占用：额度线配色（第一条粉色，见 quotaSeriesColors），与组概览里同一种额度的线同色。
 * 上方统计格的图标在图标着色为多彩时与这里的序列同色（见 TrendSummaryGrid），单色时是中性的。
 * 网格、坐标轴、图例文字保持中性灰；深色模式整套换成 chartPalette(true) / hueHex(…, true) 的亮一档。
 *
 * 序列顺序不能动：trendTooltipFormatter 按 seriesIndex 判断格式——0 是请求柱，1 是费用线
 * （显示成金额），之后都是额度百分比；提示框色块也按同一顺序取 seriesColors。
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
  const requestsColor = palette.metric.requests;
  const costColor = palette.metric.cost;
  const quotaColors = quotaSeries.map((_, index) => quotaSeriesColor(index, isDark));
  const seriesColors = [requestsColor, costColor, ...quotaColors];
  // 悬停时线上的圆点套一圈卡片底色，压在柱子或别的线上也看得清。
  const pointRing = palette.surface;
  const seriesAnimation = {
    animation: animate,
    animationDuration: animate ? animationMs : 0,
    animationDurationUpdate: 0,
  };
  const valueAxisLabel = { ...axis.axisLabel, hideOverlap: true };
  const lineSeries = (color: string) => ({
    type: "line",
    ...seriesAnimation,
    connectNulls: true,
    showSymbol: false,
    symbol: "circle",
    symbolSize: 8,
    smooth: true,
    itemStyle: { color, borderColor: pointRing, borderWidth: 2 },
    emphasis: { lineStyle: { width: 2.6 } },
  });

  return {
    ...seriesAnimation,
    animationEasing: "cubicOut" as const,
    grid: { left: 46, right: 108, top: 74, bottom: 38 },
    tooltip: {
      ...chartTooltipStyle(isDark),
      trigger: "axis",
      confine: true,
      formatter: (params: unknown) => formatTrendChartTooltip(params, formatCurrency, seriesColors),
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
        itemStyle: { color: chartGradient(requestsColor, 1, 0.55), borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: chartGradient(requestsColor, 1, 0.85) } },
        data: requests,
      },
      {
        ...lineSeries(costColor),
        name: labels.cost,
        yAxisIndex: 2,
        lineStyle: { width: 2.2, color: costColor },
        // 面积盖在请求柱上面，浓了会把蓝柱染成灰绿（深色模式更明显），所以比通用的 0.28 淡。
        areaStyle: { color: chartGradient(costColor, isDark ? 0.12 : 0.16, 0) },
        data: cost,
      },
      ...quotaSeries.map(({ name, values }, index) => {
        const color = quotaColors[index];
        return {
          ...lineSeries(color),
          name,
          yAxisIndex: 1,
          lineStyle: { width: 2, color },
          data: values,
        };
      }),
    ],
  };
}
