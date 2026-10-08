import { chartPalette } from "@code-proxy/ui";
import { MONITOR_SUCCESS_CRITICAL_BELOW, MONITOR_SUCCESS_WARN_BELOW } from "../model/monitorHealth";
import type { UsageLevel } from "@features/monitor-widgets/monitorVisuals";

/**
 * 监控中心的指标身份色（chartTheme.metric）：只在同一张图里同时画几个指标、需要彼此区分时
 * 用；单个指标的卡片、迷你趋势一律用强调色，数值保持墨色，出问题时由状态色覆盖。
 */
export type MonitorMetric = "requests" | "success" | "latency" | "tokens" | "cost" | "cache";

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

/** 成功率文字色：正常保持墨色（不必满屏绿），出问题才上色。 */
export function successTextClass(rate: number, requests: number): string {
  if (requests <= 0) return "text-ink-3";
  const level = successLevel(rate);
  if (level === "critical") return "text-rose-600 dark:text-rose-300";
  if (level === "warn") return "text-amber-600 dark:text-amber-300";
  return "text-ink";
}
