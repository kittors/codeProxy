import { chartPalette, chartTooltipStyle } from "@code-proxy/ui";
import { formatNumber } from "../monitor-utils";
import { HOURLY_MODEL_COLORS } from "../monitor-constants";
import type { HourlySeries } from "./types";

export const createHourlyModelOption = (input: {
  hourlySeries: HourlySeries;
  modelHourWindow: number;
  hourlyModelSelected: Record<string, boolean>;
  paletteColorByKey: Record<string, string>;
  totalLineKey: string;
  getSeriesLabel: (key: string) => string;
  isDark: boolean;
  compact?: boolean;
}): Record<string, unknown> => {
  const points = input.hourlySeries.modelPoints.slice(-input.modelHourWindow);
  const x = points.map((point) => point.label);
  const barMaxWidth = input.modelHourWindow <= 6 ? 44 : input.modelHourWindow <= 12 ? 32 : 24;

  const selectedKeys = input.hourlySeries.modelKeys.filter(
    (key) => input.hourlyModelSelected[key] ?? true,
  );
  const showTotalLine = input.hourlyModelSelected[input.totalLineKey] ?? true;

  const series = selectedKeys.map((key) => {
    const data = points.map((point) => {
      const item = point.stacks.find((stack) => stack.key === key);
      return item?.value ?? 0;
    });
    return {
      name: input.getSeriesLabel(key),
      type: "bar",
      stack: "requests",
      emphasis: { focus: "series" },
      barMaxWidth,
      itemStyle: {
        borderRadius: 0,
        color: input.paletteColorByKey[key] ?? chartPalette(input.isDark).series[3],
      },
      data,
    };
  });

  const totals = points.map((point) =>
    point.stacks.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0),
  );

  const totalLineColor = chartPalette(input.isDark).primary;
  const selectedSums = points.map((point) =>
    point.stacks.reduce((acc, item) => {
      if (!selectedKeys.includes(item.key)) return acc;
      return acc + (Number.isFinite(item.value) ? item.value : 0);
    }, 0),
  );

  const yAxisMaxRaw = Math.max(
    selectedSums.reduce((acc, value) => Math.max(acc, value), 0),
    showTotalLine ? totals.reduce((acc, value) => Math.max(acc, value), 0) : 0,
  );
  const yAxisMax = Math.max(1, Math.ceil(yAxisMaxRaw * 1.1));

  const compact = input.compact ?? false;

  return {
    backgroundColor: "transparent",
    color: HOURLY_MODEL_COLORS,
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
        ? { margin: 10, hideOverlap: true, fontSize: 10, rotate: 45 }
        : { margin: 14, hideOverlap: true },
      axisLine: {
        lineStyle: {
          color: chartPalette(input.isDark).axis,
        },
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: yAxisMax,
      splitNumber: 4,
      axisLabel: compact
        ? {
            formatter: (value: number) => formatNumber(value),
            margin: 4,
            width: 36,
            overflow: "truncate",
            fontSize: 10,
          }
        : {
            formatter: (value: number) => formatNumber(value),
            margin: 6,
            width: 56,
            overflow: "truncate",
          },
      splitLine: {
        lineStyle: {
          color: chartPalette(input.isDark).grid,
        },
      },
    },
    series: [
      ...series,
      ...(showTotalLine
        ? [
            {
              name: input.getSeriesLabel(input.totalLineKey),
              type: "line",
              smooth: true,
              symbol: "circle",
              symbolSize: 6,
              lineStyle: { width: 2.5, color: totalLineColor },
              itemStyle: { color: totalLineColor },
              emphasis: { focus: "series" },
              data: totals,
              z: 10,
            },
          ]
        : []),
      {
        name: "__axis__",
        type: "line",
        data: showTotalLine ? totals : selectedSums,
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        emphasis: { disabled: true },
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
      },
    ],
    animationEasing: "cubicOut" as const,
    animationDuration: 520,
    animationDurationUpdate: 360,
  };
};
