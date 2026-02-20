import { formatNumber } from "@/modules/monitor/monitor-utils";
import type { HourlySeries } from "@/modules/monitor/chart-options/types";

export const createHourlyTokenOption = (input: {
  hourlySeries: HourlySeries;
  tokenHourWindow: number;
  hourlyTokenSelected: Record<string, boolean>;
  paletteColorByKey: Record<string, string>;
  isDark: boolean;
}): Record<string, unknown> => {
  const points = input.hourlySeries.tokenPoints.slice(-input.tokenHourWindow);
  const x = points.map((point) => point.label);
  const barMaxWidth = input.tokenHourWindow <= 6 ? 44 : input.tokenHourWindow <= 12 ? 32 : 24;

  const selectedKeys = input.hourlySeries.tokenKeys.filter(
    (key) => input.hourlyTokenSelected[key] ?? true,
  );
  const showTotalLine = input.hourlyTokenSelected["总 Token"] ?? true;

  const series = selectedKeys.map((key) => {
    const data = points.map((point) => {
      const item = point.stacks.find((stack) => stack.key === key);
      return item?.value ?? 0;
    });
    return {
      name: key,
      type: "bar",
      stack: "tokens",
      emphasis: { focus: "series" },
      barMaxWidth,
      itemStyle: {
        color: input.paletteColorByKey[key] ?? "rgba(148,163,184,0.58)",
        borderRadius: 0,
      },
      data,
    };
  });

  const totals = points.map((point) =>
    point.stacks.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0),
  );
  const totalLineColor = "#3b82f6";
  const selectedSums = points.map((point) =>
    point.stacks.reduce((acc, item) => {
      if (!selectedKeys.includes(item.key as (typeof input.hourlySeries.tokenKeys)[number])) {
        return acc;
      }
      return acc + (Number.isFinite(item.value) ? item.value : 0);
    }, 0),
  );

  const yAxisMaxRaw = Math.max(
    selectedSums.reduce((acc, value) => Math.max(acc, value), 0),
    showTotalLine ? totals.reduce((acc, value) => Math.max(acc, value), 0) : 0,
  );
  const yAxisMax = Math.max(1, Math.ceil(yAxisMaxRaw * 1.1));

  return {
    backgroundColor: "transparent",
    color: [
      input.paletteColorByKey["输入"],
      input.paletteColorByKey["输出"],
      input.paletteColorByKey["推理"],
      input.paletteColorByKey["缓存"],
    ],
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
    yAxis: {
      type: "value",
      min: 0,
      max: yAxisMax,
      splitNumber: 4,
      axisLabel: {
        formatter: (value: number) => formatNumber(value),
        margin: 12,
        width: 56,
        overflow: "truncate",
      },
      splitLine: {
        lineStyle: {
          color: input.isDark ? "rgba(255,255,255,0.08)" : "rgba(148, 163, 184, 0.25)",
        },
      },
    },
    series: [
      ...series,
      ...(showTotalLine
        ? [
            {
              name: "总 Token",
              type: "line",
              smooth: true,
              symbol: "circle",
              symbolSize: 6,
              lineStyle: { width: 3, color: totalLineColor },
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
