import type { ECBasicOption } from "echarts/types/dist/shared";
import type { MonitorOverview, MonitorSeriesPoint } from "@code-proxy/api-client";
import {
  formatMonitorAxis,
  formatMonitorAxisDuration,
  formatMonitorBucketLabel,
  formatMonitorBucketRange,
  formatMonitorCompact,
  formatMonitorCost,
  formatMonitorDuration,
  formatMonitorPercent,
} from "../model/monitorFormat";
import {
  firstParam,
  monitorAxis,
  monitorPalette,
  monitorTooltip,
  tooltipHtml,
  withAlpha,
  type TooltipRow,
} from "./chartBase";

export type TrendView = "requests" | "tokens" | "latency" | "cost";

export type TrendSeriesKey =
  | "success"
  | "failed"
  | "success_rate"
  | "input"
  | "output"
  | "cache_rate"
  | "latency_avg"
  | "first_token_avg"
  | "cost"
  | "cumulative_cost";

export const TREND_SERIES: Record<TrendView, TrendSeriesKey[]> = {
  requests: ["success", "failed", "success_rate"],
  tokens: ["input", "output", "cache_rate"],
  latency: ["latency_avg", "first_token_avg"],
  cost: ["cost", "cumulative_cost"],
};

export function trendSeriesColor(key: TrendSeriesKey, isDark: boolean): string {
  const palette = monitorPalette(isDark);
  switch (key) {
    case "success":
      return palette.metric.requests;
    case "failed":
      return palette.err;
    case "success_rate":
      return palette.ok;
    case "input":
      return withAlpha(palette.metric.tokens, 0.45);
    case "output":
      return palette.metric.tokens;
    case "cache_rate":
      return palette.metric.cache;
    case "latency_avg":
      return palette.metric.latency;
    case "first_token_avg":
      return withAlpha(palette.metric.latency, 0.55);
    case "cost":
      return palette.metric.cost;
    default:
      return palette.primary;
  }
}

export type TrendLabels = Record<
  TrendSeriesKey | "requests" | "tokens" | "reasoning" | "cached",
  string
>;

/**
 * 主趋势图。后端给的是连续、补零的时间轴，所以空档就是真实的「没有请求」，不会再出现
 * 旧图那种 03:00 直接跳到 08:00 的压缩。比率类线（成功率、缓存命中率、耗时）在空档处
 * 断开不画，而不是掉到 0。
 */
export function createTrafficTrendOption(
  overview: MonitorOverview,
  view: TrendView,
  isDark: boolean,
  labels: TrendLabels,
  hidden: Partial<Record<TrendSeriesKey, boolean>>,
): ECBasicOption {
  const palette = monitorPalette(isDark);
  const axis = monitorAxis(isDark);
  const points = overview.series;
  const step = overview.range.step_seconds;
  const categories = points.map((point) => formatMonitorBucketLabel(point.start, step));
  const color = (key: TrendSeriesKey) => trendSeriesColor(key, isDark);
  const gapAware = (
    pick: (point: MonitorSeriesPoint) => number,
    has: (p: MonitorSeriesPoint) => boolean,
  ) => points.map((point) => (has(point) ? pick(point) : null));
  const visible = (key: TrendSeriesKey) => !hidden[key];

  const bar = (
    key: TrendSeriesKey,
    data: (number | null)[],
    extra: Record<string, unknown> = {},
  ) => ({
    id: key,
    name: key,
    type: "bar",
    data: visible(key) ? data : [],
    barMaxWidth: 22,
    itemStyle: { color: color(key), borderRadius: [3, 3, 0, 0] },
    ...extra,
  });
  const line = (
    key: TrendSeriesKey,
    data: (number | null)[],
    extra: Record<string, unknown> = {},
  ) => ({
    id: key,
    name: key,
    type: "line",
    data: visible(key) ? data : [],
    smooth: 0.35,
    showSymbol: false,
    connectNulls: true,
    lineStyle: { width: 2, color: color(key) },
    itemStyle: { color: color(key) },
    ...extra,
  });
  const area = (key: TrendSeriesKey) => ({
    color: {
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: withAlpha(color(key), 0.18) },
        { offset: 1, color: withAlpha(color(key), 0) },
      ],
    },
  });

  let series: Record<string, unknown>[] = [];
  let yAxis: Record<string, unknown>[] = [];
  let rows: (point: MonitorSeriesPoint, index: number) => TooltipRow[] = () => [];
  const valueAxis = (
    formatter: (value: number) => string,
    extra: Record<string, unknown> = {},
  ) => ({
    type: "value",
    splitNumber: 4,
    axisLabel: { ...axis.axisLabel, formatter },
    splitLine: axis.splitLine,
    ...extra,
  });
  const rateAxis = (minimum: number) =>
    valueAxis((value) => `${Math.round(value)}%`, {
      min: minimum,
      max: 100,
      splitLine: { show: false },
    });

  if (view === "requests") {
    const lowest = Math.min(
      100,
      ...points.filter((p) => p.requests > 0).map((p) => p.success_rate),
    );
    series = [
      bar(
        "success",
        points.map((p) => p.success),
        { stack: "requests" },
      ),
      bar(
        "failed",
        points.map((p) => p.failed),
        {
          stack: "requests",
          itemStyle: { color: color("failed"), borderRadius: [3, 3, 0, 0] },
        },
      ),
      line(
        "success_rate",
        gapAware(
          (p) => p.success_rate,
          (p) => p.requests > 0,
        ),
        {
          yAxisIndex: 1,
          z: 3,
        },
      ),
    ];
    yAxis = [
      valueAxis(formatMonitorAxis, { minInterval: 1 }),
      rateAxis(Math.max(0, Math.floor(lowest - 5))),
    ];
    rows = (point) => [
      {
        color: color("success"),
        label: labels.success,
        value: formatMonitorCompact(point.success),
      },
      { color: color("failed"), label: labels.failed, value: formatMonitorCompact(point.failed) },
      {
        color: color("success_rate"),
        label: labels.success_rate,
        value: point.requests > 0 ? formatMonitorPercent(point.success_rate) : "—",
      },
    ];
  } else if (view === "tokens") {
    series = [
      bar(
        "input",
        points.map((p) => p.input_tokens),
        { stack: "tokens" },
      ),
      bar(
        "output",
        points.map((p) => p.output_tokens),
        { stack: "tokens" },
      ),
      line(
        "cache_rate",
        gapAware(
          (p) => p.cache_rate,
          (p) => p.input_tokens > 0,
        ),
        {
          yAxisIndex: 1,
          z: 3,
        },
      ),
    ];
    yAxis = [valueAxis(formatMonitorAxis), rateAxis(0)];
    rows = (point) => [
      {
        color: color("input"),
        label: labels.input,
        value: formatMonitorCompact(point.input_tokens),
      },
      { label: labels.cached, value: formatMonitorCompact(point.cached_tokens), muted: true },
      {
        color: color("output"),
        label: labels.output,
        value: formatMonitorCompact(point.output_tokens),
      },
      { label: labels.reasoning, value: formatMonitorCompact(point.reasoning_tokens), muted: true },
      { label: labels.tokens, value: formatMonitorCompact(point.total_tokens) },
      {
        color: color("cache_rate"),
        label: labels.cache_rate,
        value: point.input_tokens > 0 ? formatMonitorPercent(point.cache_rate, 1) : "—",
      },
    ];
  } else if (view === "latency") {
    series = [
      line(
        "latency_avg",
        gapAware(
          (p) => p.latency_avg_ms,
          (p) => p.latency_avg_ms > 0,
        ),
        {
          areaStyle: area("latency_avg"),
        },
      ),
      line(
        "first_token_avg",
        gapAware(
          (p) => p.first_token_avg_ms,
          (p) => p.first_token_avg_ms > 0,
        ),
        { lineStyle: { width: 2, type: "dashed", color: color("first_token_avg") } },
      ),
    ];
    yAxis = [valueAxis(formatMonitorAxisDuration)];
    rows = (point) => [
      {
        color: color("latency_avg"),
        label: labels.latency_avg,
        value: point.latency_avg_ms > 0 ? formatMonitorDuration(point.latency_avg_ms) : "—",
      },
      {
        color: color("first_token_avg"),
        label: labels.first_token_avg,
        value: point.first_token_avg_ms > 0 ? formatMonitorDuration(point.first_token_avg_ms) : "—",
      },
      { label: labels.requests, value: formatMonitorCompact(point.requests), muted: true },
    ];
  } else {
    let running = 0;
    const cumulative = points.map((point) => (running += point.cost));
    series = [
      bar(
        "cost",
        points.map((p) => p.cost),
      ),
      line("cumulative_cost", cumulative, {
        yAxisIndex: 1,
        z: 3,
        lineStyle: { width: 2, color: color("cumulative_cost"), type: "dashed" },
      }),
    ];
    yAxis = [
      valueAxis((value) => formatMonitorCost(value).replace(/\.0+$/, "")),
      valueAxis((value) => formatMonitorCost(value).replace(/\.0+$/, ""), {
        splitLine: { show: false },
      }),
    ];
    rows = (point, index) => [
      { color: color("cost"), label: labels.cost, value: formatMonitorCost(point.cost) },
      {
        color: color("cumulative_cost"),
        label: labels.cumulative_cost,
        value: formatMonitorCost(cumulative[index] ?? 0),
      },
      { label: labels.requests, value: formatMonitorCompact(point.requests), muted: true },
    ];
  }

  return {
    animationDuration: 480,
    animationDurationUpdate: 320,
    grid: { left: 4, right: 4, top: 14, bottom: 4, containLabel: true },
    tooltip: {
      ...monitorTooltip(isDark),
      trigger: "axis",
      axisPointer: { type: view === "latency" ? "line" : "shadow" },
      formatter: (params: unknown) => {
        const hit = firstParam(params);
        const point = hit ? points[hit.dataIndex] : undefined;
        if (!hit || !point) return "";
        return tooltipHtml(formatMonitorBucketRange(point.start, step), rows(point, hit.dataIndex));
      },
    },
    xAxis: {
      type: "category",
      data: categories,
      boundaryGap: view !== "latency",
      axisTick: axis.axisTick,
      axisLine: axis.axisLine,
      axisLabel: { ...axis.axisLabel, hideOverlap: true },
    },
    yAxis,
    series,
    color: [palette.primary],
  };
}
