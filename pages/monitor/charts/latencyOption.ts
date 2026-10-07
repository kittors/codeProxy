import type { ECBasicOption } from "echarts/types/dist/shared";
import type { MonitorLatencyStats } from "@code-proxy/api-client";
import { chartGradient } from "@code-proxy/ui";
import { formatMonitorCompact, formatMonitorPercent } from "../model/monitorFormat";
import { monitorAxis, monitorPalette, monitorTooltip, tooltipHtml } from "./chartBase";

/**
 * 展示用区间（上界，毫秒）。都是后端细分桶边界的子集，合并时不会把一个细桶劈开。
 * 推理模型一次几十秒很常见，所以区间一路延伸到 5 分钟以上。
 */
export const LATENCY_BAND_UPPER_MS = [
  500,
  1_000,
  2_000,
  5_000,
  10_000,
  20_000,
  30_000,
  60_000,
  120_000,
  300_000,
  Number.POSITIVE_INFINITY,
];

export interface LatencyBand {
  lower: number;
  upper: number;
  count: number;
}

/** 把后端的细分直方图合并成展示区间。bounds 是细桶的（不含）上界，histogram 比它多一格。 */
export function mergeLatencyBands(
  bounds: readonly number[],
  histogram: readonly number[],
): LatencyBand[] {
  const bands: LatencyBand[] = LATENCY_BAND_UPPER_MS.map((upper, index) => ({
    lower: index === 0 ? 0 : LATENCY_BAND_UPPER_MS[index - 1],
    upper,
    count: 0,
  }));
  histogram.forEach((count, index) => {
    const binUpper = index < bounds.length ? bounds[index] : Number.POSITIVE_INFINITY;
    const band = bands.find((item) => binUpper <= item.upper) ?? bands[bands.length - 1];
    band.count += count;
  });
  return bands;
}

export function bandIndexFor(bands: readonly LatencyBand[], valueMs: number): number {
  if (!(valueMs > 0)) return -1;
  return bands.findIndex((band) => valueMs < band.upper);
}

const seconds = (ms: number) => {
  if (ms >= 60_000) return `${ms / 60_000}m`;
  return `${ms / 1_000}s`;
};

export function latencyBandLabel(band: LatencyBand): string {
  if (band.lower === 0) return `<${seconds(band.upper)}`;
  if (!Number.isFinite(band.upper)) return `≥${seconds(band.lower)}`;
  return `${seconds(band.lower)}–${seconds(band.upper)}`;
}

export function createLatencyOption(
  stats: MonitorLatencyStats,
  bounds: readonly number[],
  isDark: boolean,
  labels: { requests: string; share: string },
): ECBasicOption {
  const palette = monitorPalette(isDark);
  const axis = monitorAxis(isDark);
  const bands = mergeLatencyBands(bounds, stats.histogram);
  const total = bands.reduce((sum, band) => sum + band.count, 0);
  const p50 = bandIndexFor(bands, stats.p50_ms);
  const p95 = bandIndexFor(bands, stats.p95_ms);
  const base = palette.metric.latency;

  const markers = (index: number) =>
    [index === p50 ? "P50" : "", index === p95 ? "P95" : ""].filter(Boolean).join(" · ");

  return {
    animationDuration: 480,
    animationDurationUpdate: 320,
    grid: { left: 4, right: 4, top: 22, bottom: 4, containLabel: true },
    tooltip: {
      ...monitorTooltip(isDark),
      trigger: "item",
      formatter: (params: unknown) => {
        const index = (params as { dataIndex?: number }).dataIndex ?? -1;
        const band = bands[index];
        if (!band) return "";
        return tooltipHtml(latencyBandLabel(band), [
          { color: base, label: labels.requests, value: formatMonitorCompact(band.count) },
          {
            label: labels.share,
            value: total > 0 ? formatMonitorPercent((band.count / total) * 100, 1) : "—",
            muted: true,
          },
        ]);
      },
    },
    xAxis: {
      type: "category",
      data: bands.map(latencyBandLabel),
      axisTick: axis.axisTick,
      axisLine: axis.axisLine,
      axisLabel: { ...axis.axisLabel, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitNumber: 3,
      axisLabel: { ...axis.axisLabel, formatter: (value: number) => formatMonitorCompact(value) },
      splitLine: axis.splitLine,
    },
    series: [
      {
        id: "latency-bands",
        type: "bar",
        barCategoryGap: "22%",
        data: bands.map((band, index) => {
          const marker = markers(index);
          return {
            value: band.count,
            itemStyle: {
              // 分位数落在的区间用实的同色渐变，其余整体淡一档：一眼看出中位与长尾各在哪里。
              color: marker ? chartGradient(base, 1, 0.6) : chartGradient(base, 0.42, 0.2),
              borderRadius: [4, 4, 0, 0],
            },
            label: marker
              ? {
                  show: true,
                  position: "top",
                  formatter: marker,
                  color: palette.ink2,
                  fontSize: 10,
                  fontWeight: 600,
                }
              : undefined,
          };
        }),
      },
    ],
  };
}
