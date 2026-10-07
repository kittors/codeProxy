import type { ECBasicOption } from "echarts/types/dist/shared";
import type { MonitorSeriesPoint } from "@code-proxy/api-client";
import { chartGradient } from "@code-proxy/ui";
import {
  formatMonitorAxis,
  formatMonitorCompact,
  formatMonitorDuration,
  formatMonitorStamp,
} from "../model/monitorFormat";
import {
  firstParam,
  monitorAxis,
  monitorPalette,
  monitorTooltip,
  tooltipHtml,
} from "./chartBase";

export interface RealtimeLabels {
  success: string;
  failed: string;
  tokens: string;
  latency: string;
  inProgress: string;
}

/**
 * 最近 60 分钟、每分钟一根柱：成功是请求身份色，失败叠在上面用错误红，都是上实下淡的同色渐变。
 * 最后一根是还没走完的这一分钟，画成整体更淡的渐变，免得被读成「流量突然掉了」。
 */
export function createRealtimeOption(
  points: MonitorSeriesPoint[],
  isDark: boolean,
  labels: RealtimeLabels,
): ECBasicOption {
  const palette = monitorPalette(isDark);
  const axis = monitorAxis(isDark);
  const requestsColor = palette.metric.requests;
  const last = points.length - 1;
  const categories = points.map((point) => formatMonitorStamp(point.start).slice(6));
  const fade = (value: number, index: number, color: string) => ({
    value,
    itemStyle: index === last ? { color: chartGradient(color, 0.45, 0.2) } : undefined,
  });

  return {
    animationDuration: 420,
    animationDurationUpdate: 300,
    grid: { left: 4, right: 4, top: 10, bottom: 4, containLabel: true },
    tooltip: {
      ...monitorTooltip(isDark),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const hit = firstParam(params);
        const point = hit ? points[hit.dataIndex] : undefined;
        if (!point) return "";
        const title =
          hit?.dataIndex === last
            ? `${formatMonitorStamp(point.start)} · ${labels.inProgress}`
            : formatMonitorStamp(point.start);
        return tooltipHtml(title, [
          {
            color: requestsColor,
            label: labels.success,
            value: formatMonitorCompact(point.success),
          },
          { color: palette.err, label: labels.failed, value: formatMonitorCompact(point.failed) },
          { label: labels.tokens, value: formatMonitorCompact(point.total_tokens), muted: true },
          {
            label: labels.latency,
            value: point.latency_avg_ms > 0 ? formatMonitorDuration(point.latency_avg_ms) : "—",
            muted: true,
          },
        ]);
      },
    },
    xAxis: {
      type: "category",
      data: categories,
      axisTick: axis.axisTick,
      axisLine: axis.axisLine,
      axisLabel: { ...axis.axisLabel, interval: 9, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitNumber: 3,
      axisLabel: { ...axis.axisLabel, formatter: (value: number) => formatMonitorAxis(value) },
      splitLine: axis.splitLine,
    },
    series: [
      {
        id: "success",
        name: labels.success,
        type: "bar",
        stack: "requests",
        barCategoryGap: "28%",
        itemStyle: { color: chartGradient(requestsColor, 1, 0.6), borderRadius: [2, 2, 0, 0] },
        emphasis: { itemStyle: { color: chartGradient(requestsColor, 1, 0.88) } },
        data: points.map((point, index) => fade(point.success, index, requestsColor)),
      },
      {
        id: "failed",
        name: labels.failed,
        type: "bar",
        stack: "requests",
        itemStyle: { color: chartGradient(palette.err, 1, 0.7), borderRadius: [2, 2, 0, 0] },
        data: points.map((point, index) => fade(point.failed, index, palette.err)),
      },
    ],
  };
}
