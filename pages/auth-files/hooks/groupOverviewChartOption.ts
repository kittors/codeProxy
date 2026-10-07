import { chartAxisStyle, chartGradient, chartPalette, chartTooltipStyle } from "@code-proxy/ui";
import { quotaSeriesColor } from "../helpers/quotaSeriesColors";
import type { GroupTrendPoint } from "./groupOverviewWeekly";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 提示框是 HTML 字符串，周限名称来自后端的额度标签，必须转义。 */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

const formatPercent = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
};

/**
 * 组概览「近 7 天」趋势图的 echarts 配置。
 *
 * 颜色与账号详情的趋势图同一套含义：调用次数是请求身份色（蓝）的同色渐变柱，每种周限一条额度线，
 * 配色取 quotaSeriesColors（第一条粉色），同一种额度在组概览和账号详情里同色。
 * 提示框的色块按序列顺序取同一份颜色：柱子是渐变，echarts 自带的 marker 只取渐变的一端。
 */
export function buildGroupOverviewChartOption({
  points,
  series,
  isDark,
  callsLabel,
}: {
  points: GroupTrendPoint[];
  series: { id: string; label: string }[];
  isDark: boolean;
  callsLabel: string;
}): Record<string, unknown> {
  const palette = chartPalette(isDark);
  const axis = chartAxisStyle(isDark);
  const tooltipStyle = chartTooltipStyle(isDark);
  const callsColor = palette.metric.requests;
  const weeklyColors = series.map((_, index) => quotaSeriesColor(index, isDark));
  const seriesColors = [callsColor, ...weeklyColors];
  // 折线上的圆点套一圈卡片底色，压在柱子上也看得清。
  const pointRing = palette.surface;

  return {
    backgroundColor: "transparent",
    animationDuration: 420,
    animationDurationUpdate: 280,
    grid: {
      left: 48,
      right: 44,
      top: series.length > 2 ? 52 : 36,
      bottom: 44,
      containLabel: false,
    },
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      renderMode: "html",
      appendToBody: true,
      confine: true,
      // 弹窗里的图表，提示框挂到 body 上，层级要压过弹窗。
      extraCssText: `${tooltipStyle.extraCssText} z-index: 10000;`,
      formatter: (
        params: Array<{ seriesIndex?: number; seriesName?: string; value?: unknown; axisValueLabel?: string }>,
      ) => {
        const title = escapeHtml(params[0]?.axisValueLabel ?? "");
        const rows = params.map((item) => {
          const index = item.seriesIndex ?? 0;
          const display = index === 0 ? String(item.value ?? 0) : formatPercent(item.value);
          const color = seriesColors[index] ?? callsColor;
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color};margin-right:6px"></span>`;
          return `${dot}${escapeHtml(item.seriesName ?? "")}&nbsp;&nbsp;<b>${display}</b>`;
        });
        return [title, ...rows].join("<br/>");
      },
    },
    legend: {
      top: 0,
      left: 0,
      type: "scroll",
      textStyle: { color: palette.ink2, fontSize: 12 },
    },
    xAxis: {
      type: "category",
      data: points.map((point) => point.label),
      axisTick: axis.axisTick,
      axisLabel: { ...axis.axisLabel, interval: 0 },
      axisLine: axis.axisLine,
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { ...axis.axisLabel, margin: 10 },
        splitLine: axis.splitLine,
      },
      {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: {
          ...axis.axisLabel,
          margin: 10,
          formatter: (value: number) => `${Math.round(value)}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: callsLabel,
        type: "bar",
        barMaxWidth: 24,
        itemStyle: { color: chartGradient(callsColor, 1, 0.55), borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: chartGradient(callsColor, 1, 0.85) } },
        data: points.map((point) => point.calls),
      },
      ...series.map((item, index) => {
        const color = weeklyColors[index];
        return {
          name: item.label,
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { width: 2.2, color },
          itemStyle: { color, borderColor: pointRing, borderWidth: 2 },
          emphasis: { lineStyle: { width: 2.8 } },
          connectNulls: false,
          data: points.map((point) => point.weeklyPercents[item.id] ?? null),
        };
      }),
    ],
  };
}
