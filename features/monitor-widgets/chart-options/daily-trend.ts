import { chartPalette, chartTooltipStyle } from "@code-proxy/ui";
import { formatNumber } from "../monitor-utils";
import type { DailySeriesPoint } from "./types";

/**
 * 与卡片底色按比例混出不透明的浅一档（amount 越大越接近底色）。只认 #rrggbb。
 * 底色取图表主题里的卡片色（chartPalette.surface），深色卡片换成近黑之后，混色目标跟着走——
 * 以前写死成旧的 #2a2a2a，深色下浅一档的柱子会混出一层灰。
 */
const tint = (hex: string, isDark: boolean, amount: number): string => {
  const value = Number.parseInt(hex.replace(/^#/, ""), 16);
  const surface = Number.parseInt(chartPalette(isDark).surface.replace(/^#/, ""), 16);
  if (!Number.isFinite(value) || !Number.isFinite(surface)) return hex;
  return `#${[16, 8, 0]
    .map((shift) => {
      const channel = (value >> shift) & 255;
      const base = (surface >> shift) & 255;
      return Math.round(channel + (base - channel) * amount)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
};

/**
 * 每日用量图的颜色，图表与图例共用这一份：输入 / 输出 Token 是 Token 身份色（紫）的浅、深两档，
 * 请求数是请求身份色（蓝），与监控中心、仪表盘同一组颜色。
 *
 * 输入、输出两组柱子前后重叠（较小的一组在前），所以浅的一档要是不透明色：半透明的柱子叠在
 * 另一根上会混出第三种颜色，看不出哪段是哪组。
 */
export const dailyTrendColors = (isDark: boolean) => {
  const palette = chartPalette(isDark);
  return {
    // 深色底上往底色混得太多会发灰，混得少一些。
    input: tint(palette.metric.tokens, isDark, isDark ? 0.35 : 0.5),
    output: palette.metric.tokens,
    requests: palette.metric.requests,
  };
};

/** 不透明的上深下浅渐变（重叠的柱子不能用透明度做渐变，理由同上）。 */
const opaqueGradient = (top: string, bottom: string) => ({
  type: "linear" as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ],
});

export const createDailyTrendOption = (input: {
  dailySeries: DailySeriesPoint[];
  dailyLegendSelected: Record<string, boolean>;
  legendKeys: {
    input: string;
    output: string;
    requests: string;
  };
  labels: {
    input: string;
    output: string;
    requests: string;
    tokenAxis: string;
    requestAxis: string;
  };
  isDark: boolean;
  compact?: boolean;
}): Record<string, unknown> => {
  const points = input.dailySeries.filter(
    (item) => item.requests > 0 || item.inputTokens > 0 || item.outputTokens > 0,
  );
  const visiblePoints = points.length > 0 ? points : input.dailySeries;

  const x = visiblePoints.map((item) => item.label);
  const requestY = visiblePoints.map((item) => item.requests);
  const inputY = visiblePoints.map((item) => item.inputTokens);
  const outputY = visiblePoints.map((item) => item.outputTokens);
  const tokenTotals = visiblePoints.map((item) => item.inputTokens + item.outputTokens);

  const formatTokenCompact = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(Math.round(value));
  };

  const visibleCount = visiblePoints.length;
  const barMaxWidth =
    visibleCount <= 1
      ? 56
      : visibleCount <= 3
        ? 44
        : visibleCount <= 7
          ? 36
          : visibleCount <= 14
            ? 28
            : 18;

  const hasInput = inputY.some((value) => value > 0);
  const hasOutput = outputY.some((value) => value > 0);
  const hasRequests = requestY.some((value) => value > 0);

  const showInput = hasInput && (input.dailyLegendSelected[input.legendKeys.input] ?? true);
  const showOutput = hasOutput && (input.dailyLegendSelected[input.legendKeys.output] ?? true);
  const showRequests =
    hasRequests && (input.dailyLegendSelected[input.legendKeys.requests] ?? true);

  const tokenAxisAnchor =
    showInput || showOutput
      ? visiblePoints.map((item) => {
          const candidates: number[] = [];
          if (showInput) candidates.push(item.inputTokens);
          if (showOutput) candidates.push(item.outputTokens);
          return candidates.length > 0 ? Math.max(...candidates) : 0;
        })
      : tokenTotals;

  const requestAxisAnchor = showRequests ? requestY : requestY.map(() => 0);

  const tokenAxisMaxRaw = tokenAxisAnchor.reduce((acc, value) => Math.max(acc, value), 0);
  const requestAxisMaxRaw = requestAxisAnchor.reduce((acc, value) => Math.max(acc, value), 0);
  const tokenAxisMax = Math.max(1, Math.ceil(tokenAxisMaxRaw * 1.1));
  const requestAxisMax = Math.max(1, Math.ceil(requestAxisMaxRaw * 1.1));

  const palette = chartPalette(input.isDark);
  const colors = dailyTrendColors(input.isDark);
  const surfaceRing = palette.surface;
  const series: Array<Record<string, unknown>> = [];
  const inputSeries = showInput
    ? {
        name: input.labels.input,
        type: "bar",
        yAxisIndex: 0,
        barMaxWidth,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: opaqueGradient(
            colors.input,
            tint(palette.metric.tokens, input.isDark, input.isDark ? 0.55 : 0.7),
          ),
        },
        emphasis: { focus: "series" },
        data: inputY,
      }
    : null;

  const outputSeries = showOutput
    ? {
        name: input.labels.output,
        type: "bar",
        yAxisIndex: 0,
        barMaxWidth,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: opaqueGradient(colors.output, tint(palette.metric.tokens, input.isDark, 0.3)),
        },
        emphasis: { focus: "series" },
        data: outputY,
      }
    : null;

  if (inputSeries && outputSeries) {
    const inputMax = inputY.reduce((acc, value) => Math.max(acc, value), 0);
    const outputMax = outputY.reduce((acc, value) => Math.max(acc, value), 0);
    const inputSum = inputY.reduce((acc, value) => acc + value, 0);
    const outputSum = outputY.reduce((acc, value) => acc + value, 0);
    const inputSmaller = inputMax === outputMax ? inputSum <= outputSum : inputMax <= outputMax;
    const front = inputSmaller ? inputSeries : outputSeries;
    const back = inputSmaller ? outputSeries : inputSeries;
    series.push({ ...back, z: 2 });
    series.push({ ...front, z: 3, barGap: "-100%" });
  } else if (inputSeries) {
    series.push({ ...inputSeries, z: 2 });
  } else if (outputSeries) {
    series.push({ ...outputSeries, z: 2 });
  }

  if (showRequests) {
    series.push({
      name: input.labels.requests,
      type: "line",
      yAxisIndex: 1,
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 2.2, color: colors.requests },
      // 圆点套一圈卡片底色，压在柱子上也看得清。
      itemStyle: { color: colors.requests, borderColor: surfaceRing, borderWidth: 2 },
      data: requestY,
      z: 10,
    });
  }

  series.push({
    name: "__token_axis__",
    type: "line",
    yAxisIndex: 0,
    data: tokenAxisAnchor,
    showSymbol: false,
    silent: true,
    tooltip: { show: false },
    emphasis: { disabled: true },
    lineStyle: { opacity: 0 },
    itemStyle: { opacity: 0 },
  });

  series.push({
    name: "__request_axis__",
    type: "line",
    yAxisIndex: 1,
    data: requestAxisAnchor,
    showSymbol: false,
    silent: true,
    tooltip: { show: false },
    emphasis: { disabled: true },
    lineStyle: { opacity: 0 },
    itemStyle: { opacity: 0 },
  });

  const compact = input.compact ?? false;

  return {
    backgroundColor: "transparent",
    color: [colors.input, colors.output, colors.requests],
    tooltip: {
      ...chartTooltipStyle(input.isDark),
      trigger: "axis",
      axisPointer: { ...chartTooltipStyle(input.isDark).axisPointer, type: "shadow" },
      renderMode: "html",
      appendToBody: true,
      confine: true,
      extraCssText: `${chartTooltipStyle(input.isDark).extraCssText} z-index: 10000;`,
    },
    legend: {
      show: false,
    },
    grid: compact
      ? { left: 4, right: 4, top: 12, bottom: 34, containLabel: true }
      : { left: 12, right: 12, top: 18, bottom: 48, containLabel: true },
    xAxis: {
      type: "category",
      data: x,
      axisTick: { show: false },
      axisLabel: compact
        ? { margin: 10, hideOverlap: true, fontSize: 10, color: palette.ink3 }
        : { margin: 14, hideOverlap: true, color: palette.ink3 },
      axisLine: {
        lineStyle: {
          color: palette.axis,
        },
      },
    },
    yAxis: [
      {
        type: "value",
        min: 0,
        max: tokenAxisMax,
        axisLabel: compact
          ? {
              formatter: (value: number) => formatTokenCompact(value),
              margin: 4,
              width: 36,
              overflow: "truncate",
              color: palette.ink3,
              fontSize: 10,
            }
          : {
              formatter: (value: number) => formatTokenCompact(value),
              margin: 6,
              width: 56,
              overflow: "truncate",
              color: palette.ink3,
            },
        splitNumber: 4,
        splitLine: {
          lineStyle: {
            color: palette.grid,
          },
        },
      },
      {
        type: "value",
        min: 0,
        max: requestAxisMax,
        axisLabel: compact
          ? {
              formatter: (value: number) => formatNumber(value),
              margin: 4,
              width: 36,
              overflow: "truncate",
              color: palette.ink3,
              fontSize: 10,
            }
          : {
              formatter: (value: number) => formatNumber(value),
              margin: 6,
              width: 56,
              overflow: "truncate",
              color: palette.ink3,
            },
        splitNumber: 4,
        splitLine: { show: false },
      },
    ],
    series,
    animationEasing: "cubicOut" as const,
    animationDuration: 520,
    animationDurationUpdate: 360,
  };
};
