import { formatNumber } from "@/modules/monitor/monitor-utils";
import type { DailySeriesPoint } from "@/modules/monitor/chart-options/types";

export const createDailyTrendOption = (input: {
  dailySeries: DailySeriesPoint[];
  dailyLegendSelected: Record<string, boolean>;
  isDark: boolean;
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

  const showInput = hasInput && (input.dailyLegendSelected["输入 Token"] ?? true);
  const showOutput = hasOutput && (input.dailyLegendSelected["输出 Token"] ?? true);
  const showRequests = hasRequests && (input.dailyLegendSelected["请求数"] ?? true);

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

  const series: Array<Record<string, unknown>> = [];
  const inputSeries = showInput
    ? {
        name: "输入 Token",
        type: "bar",
        yAxisIndex: 0,
        barMaxWidth,
        itemStyle: { borderRadius: 0, color: "rgba(196,181,253,0.88)" },
        emphasis: { focus: "series" },
        data: inputY,
      }
    : null;

  const outputSeries = showOutput
    ? {
        name: "输出 Token",
        type: "bar",
        yAxisIndex: 0,
        barMaxWidth,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: "rgba(110,231,183,0.88)" },
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
      name: "请求数",
      type: "line",
      yAxisIndex: 1,
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 3, color: "#3b82f6" },
      itemStyle: { color: "#3b82f6" },
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

  return {
    backgroundColor: "transparent",
    color: ["rgba(196,181,253,0.88)", "rgba(110,231,183,0.88)", "#3b82f6"],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      renderMode: "html",
      appendToBody: true,
      confine: true,
      borderWidth: 0,
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      textStyle: { color: "#fff" },
      extraCssText: "z-index: 10000;",
    },
    legend: {
      show: false,
    },
    grid: { left: 74, right: 74, top: 18, bottom: 78 },
    xAxis: {
      type: "category",
      data: x,
      axisTick: { show: false },
      axisLabel: { margin: 34, hideOverlap: true },
      axisLine: {
        lineStyle: {
          color: input.isDark ? "rgba(255,255,255,0.16)" : "rgba(148, 163, 184, 0.55)",
        },
      },
    },
    yAxis: [
      {
        type: "value",
        name: "Token",
        min: 0,
        max: tokenAxisMax,
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 58,
        nameTextStyle: { fontWeight: 600 },
        axisLabel: {
          formatter: (value: number) => formatTokenCompact(value),
          margin: 12,
          width: 56,
          overflow: "truncate",
        },
        splitNumber: 4,
        splitLine: {
          lineStyle: {
            color: input.isDark ? "rgba(255,255,255,0.08)" : "rgba(148, 163, 184, 0.25)",
          },
        },
      },
      {
        type: "value",
        name: "请求数",
        min: 0,
        max: requestAxisMax,
        nameLocation: "middle",
        nameRotate: 270,
        nameGap: 58,
        nameTextStyle: { fontWeight: 600 },
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
          margin: 12,
          width: 56,
          overflow: "truncate",
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
