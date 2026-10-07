import { chartPalette } from "@code-proxy/ui";
import { MONITOR_SUCCESS_CRITICAL_BELOW, MONITOR_SUCCESS_WARN_BELOW } from "../model/monitorHealth";
import {
  MONITOR_HUES,
  type MonitorHue,
  type UsageLevel,
} from "@features/monitor-widgets/monitorVisuals";

/**
 * 监控中心的身份色。与仪表盘、系统监控同一组色系（chartTheme.metric）：请求蓝、成功绿、
 * 耗时与首字时间靛蓝、Token 紫、费用琥珀、缓存青。颜色只用来认出「这是哪类指标」，
 * 数值本身保持墨色；需要表达好坏时由状态色（绿 / 琥珀 / 红）覆盖。
 */
export type MonitorMetric = "requests" | "success" | "latency" | "tokens" | "cost" | "cache";

export const METRIC_HUE: Record<MonitorMetric, MonitorHue> = {
  requests: "sky",
  success: "emerald",
  latency: "indigo",
  tokens: "violet",
  cost: "amber",
  cache: "emerald",
};

export function metricColor(metric: MonitorMetric, isDark: boolean): string {
  const palette = chartPalette(isDark).metric;
  switch (metric) {
    case "requests":
      return palette.requests;
    case "success":
      return palette.success;
    case "latency":
      return palette.latency;
    case "tokens":
      return palette.tokens;
    case "cost":
      return palette.cost;
    default:
      return palette.cache;
  }
}

/** 成功率分档（阈值见 monitorHealth）：健康评分、指标卡、渠道状态点、表格文字共用。 */
export function successLevel(rate: number): UsageLevel {
  return rate >= MONITOR_SUCCESS_WARN_BELOW
    ? "normal"
    : rate >= MONITOR_SUCCESS_CRITICAL_BELOW
      ? "warn"
      : "critical";
}

export function successHue(rate: number) {
  const level = successLevel(rate);
  return level === "critical"
    ? MONITOR_HUES.rose
    : level === "warn"
      ? MONITOR_HUES.amber
      : MONITOR_HUES.emerald;
}

/** 成功率文字色：正常保持墨色（不必满屏绿），出问题才上色。 */
export function successTextClass(rate: number, requests: number): string {
  if (requests <= 0) return "text-ink-3";
  const level = successLevel(rate);
  if (level === "critical") return "text-rose-600 dark:text-rose-300";
  if (level === "warn") return "text-amber-600 dark:text-amber-300";
  return "text-ink";
}
