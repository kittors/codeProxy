import { chartPalette, chartUsesIdentityColors } from "@code-proxy/ui";
import { MONITOR_SUCCESS_CRITICAL_BELOW, MONITOR_SUCCESS_WARN_BELOW } from "../model/monitorHealth";
import type { MonitorHue, UsageLevel } from "@features/monitor-widgets/monitorVisuals";

/**
 * 监控中心的指标身份色。与仪表盘、系统监控同一组色系（chartTheme.metric）：请求蓝、成功绿、
 * 耗时与首字时间靛蓝、Token 紫、费用琥珀、缓存青。颜色只用来认出「这是哪类指标」，数值本身
 * 保持墨色；需要表达好坏时由状态色（绿 / 琥珀 / 红）覆盖。
 *
 * 跟随「外观」：多彩风格下指标卡的图标块、迷你趋势用身份色；简约风格（强调色图表）下单个指标
 * 一律用强调色，身份色只在同一张图里同时画几个指标、需要彼此区分时用。
 */
export type MonitorMetric = "requests" | "success" | "latency" | "tokens" | "cost" | "cache";

/** 指标卡图标块的分类色（monitorVisuals 的 MONITOR_HUES，图标着色为多彩时才显示）。 */
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

/** 单个指标迷你趋势线的颜色：多彩图表用身份色，强调色图表用主序列色。 */
export function sparkColor(metric: MonitorMetric, isDark: boolean): string {
  return chartUsesIdentityColors() ? metricColor(metric, isDark) : chartPalette(isDark).primary;
}

/** 成功率分档（阈值见 monitorHealth）：健康评分、指标卡、渠道状态点、表格文字共用。 */
export function successLevel(rate: number): UsageLevel {
  return rate >= MONITOR_SUCCESS_WARN_BELOW
    ? "normal"
    : rate >= MONITOR_SUCCESS_CRITICAL_BELOW
      ? "warn"
      : "critical";
}

/** 成功率的分类色：正常绿，出问题时琥珀 / 红。 */
export function successHue(rate: number): MonitorHue {
  const level = successLevel(rate);
  return level === "critical" ? "rose" : level === "warn" ? "amber" : "emerald";
}

/** 成功率文字色：正常保持墨色（不必满屏绿），出问题才上色。 */
export function successTextClass(rate: number, requests: number): string {
  if (requests <= 0) return "text-ink-3";
  const level = successLevel(rate);
  if (level === "critical") return "text-rose-600 dark:text-rose-300";
  if (level === "warn") return "text-amber-600 dark:text-amber-300";
  return "text-ink";
}
