import type { MonitorOverview } from "@code-proxy/api-client";
import { formatMonitorDuration, formatMonitorPercent } from "./monitorFormat";

/**
 * 健康评分：把「现在正常吗」压成一个数，旁边逐项写清楚扣分原因。
 *
 * 只看三件运维真正关心、且数据可靠的事，加权平均：
 * - 成功率（50%）：≥99.5% 满分，≤90% 零分，线性。
 * - 渠道（25%）：按受影响的流量占比扣分——一个小渠道坏了和主力渠道坏了不是一回事。
 *   与渠道表的状态点同一套阈值：低于 95% 算异常（占比到一半即零分），95%–99% 算偏高
 *   （扣得轻）；请求太少的渠道不评判。
 * - 耗时变化（25%）：平均耗时相对上一个时间窗的涨幅，≤20% 满分，≥100% 零分。
 *   不用绝对阈值：推理模型一次请求几十秒是常态，按绝对值打分会让它们永远「不健康」。
 *
 * 数据缺失的项（旧后端没有渠道和耗时）不参与加权，而不是按满分或零分算。
 * 短板规则：任何一项告急，总体最多是「告警」；成功率告急，总体就是「风险」。
 */

export type MonitorHealthLevel = "idle" | "healthy" | "good" | "warning" | "critical";
export type MonitorCheckLevel = "ok" | "warn" | "critical" | "unknown";
export type MonitorCheckKey = "success_rate" | "channels" | "latency";

export interface MonitorHealthCheck {
  key: MonitorCheckKey;
  level: MonitorCheckLevel;
  score: number;
  weight: number;
  /** 诊断文案的插值参数。 */
  values: Record<string, string | number>;
}

export interface MonitorHealthReport {
  /** 没有流量时为 null（显示「空闲」，不打分）。 */
  score: number | null;
  level: MonitorHealthLevel;
  checks: MonitorHealthCheck[];
}

/**
 * 成功率分档的唯一出处：≥99% 正常，95%–99% 留意，<95% 告急。指标卡、渠道状态点、
 * 表格里的成功率文字和健康评分都读这里，同一个数字在页面上只会有一种颜色。
 */
export const MONITOR_SUCCESS_WARN_BELOW = 99;
export const MONITOR_SUCCESS_CRITICAL_BELOW = 95;
/** 请求少于这个数的渠道不评判（一两次失败就会让成功率大起大落）。 */
export const MONITOR_CHANNEL_MIN_REQUESTS = 5;

const MONITOR_CHANNEL_WARN = MONITOR_SUCCESS_WARN_BELOW;
const MONITOR_CHANNEL_CRITICAL = MONITOR_SUCCESS_CRITICAL_BELOW;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** best 处 100 分、worst 处 0 分之间线性插值（两端可以是任意方向）。 */
const linearScore = (value: number, best: number, worst: number) =>
  clamp((value - worst) / (best - worst), 0, 1) * 100;

const LEVEL_ORDER: MonitorHealthLevel[] = ["healthy", "good", "warning", "critical"];
const atLeast = (level: MonitorHealthLevel, floor: MonitorHealthLevel): MonitorHealthLevel =>
  LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(floor) ? level : floor;

export function computeMonitorHealth(overview: MonitorOverview): MonitorHealthReport {
  const current = overview.summary.current;
  if (current.requests <= 0) return { score: null, level: "idle", checks: [] };

  const checks: MonitorHealthCheck[] = [];

  const rate = current.success_rate;
  checks.push({
    key: "success_rate",
    level:
      rate >= MONITOR_SUCCESS_WARN_BELOW
        ? "ok"
        : rate >= MONITOR_SUCCESS_CRITICAL_BELOW
          ? "warn"
          : "critical",
    score: linearScore(rate, 99.5, 90),
    weight: 0.5,
    values: { rate: formatMonitorPercent(rate), failed: current.failed },
  });

  const channels = overview.channels.rows.filter((row) => row.key !== "");
  if (channels.length === 0) {
    checks.push({ key: "channels", level: "unknown", score: 0, weight: 0.25, values: {} });
  } else {
    const judged = channels.filter((row) => row.requests >= MONITOR_CHANNEL_MIN_REQUESTS);
    const failing = judged.filter((row) => row.success_rate < MONITOR_CHANNEL_CRITICAL);
    const shaky = judged.filter(
      (row) =>
        row.success_rate >= MONITOR_CHANNEL_CRITICAL && row.success_rate < MONITOR_CHANNEL_WARN,
    );
    const shareOf = (rows: typeof judged) =>
      rows.reduce((sum, row) => sum + row.requests, 0) / current.requests;
    const failingShare = shareOf(failing);
    const shakyShare = shareOf(shaky);
    const worst = [...failing, ...shaky].sort((a, b) => a.success_rate - b.success_rate)[0];
    checks.push({
      key: "channels",
      level:
        failing.length > 0
          ? failingShare >= 0.1
            ? "critical"
            : "warn"
          : shaky.length > 0
            ? "warn"
            : "ok",
      score: clamp(100 - failingShare * 200 - shakyShare * 40, 0, 100),
      weight: 0.25,
      values: {
        total: overview.channels.total,
        count: failing.length + shaky.length,
        share: formatMonitorPercent((failingShare + shakyShare) * 100, 1),
        worst: worst?.label ?? "",
        worstRate: worst ? formatMonitorPercent(worst.success_rate, 1) : "",
      },
    });
  }

  const previousLatency = overview.summary.previous.latency_avg_ms;
  const currentLatency = current.latency_avg_ms;
  if (!(previousLatency > 0) || !(currentLatency > 0)) {
    checks.push({
      key: "latency",
      level: "unknown",
      score: 0,
      weight: 0.25,
      values: { current: currentLatency > 0 ? formatMonitorDuration(currentLatency) : "" },
    });
  } else {
    const change = currentLatency / previousLatency - 1;
    checks.push({
      key: "latency",
      level: change <= 0.2 ? "ok" : change <= 0.5 ? "warn" : "critical",
      score: linearScore(change, 0.2, 1),
      weight: 0.25,
      values: {
        change: `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(0)}%`,
        current: formatMonitorDuration(currentLatency),
        previous: formatMonitorDuration(previousLatency),
      },
    });
  }

  const known = checks.filter((check) => check.level !== "unknown");
  const weight = known.reduce((sum, check) => sum + check.weight, 0);
  const score = weight > 0 ? known.reduce((sum, c) => sum + c.score * c.weight, 0) / weight : 0;

  let level: MonitorHealthLevel =
    score >= 90 ? "healthy" : score >= 70 ? "good" : score >= 50 ? "warning" : "critical";
  if (known.some((check) => check.level === "critical")) level = atLeast(level, "warning");
  if (checks[0].level === "critical") level = "critical";

  return { score, level, checks };
}
