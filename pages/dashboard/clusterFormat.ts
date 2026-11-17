import type { NodeRoundTrip } from "@code-proxy/api-client";

/*
 * 节点与数据库卡片、详情抽屉共用的格式化。卡片数字条用短格式：四格并排时一格只有七八十像素，单位写在
 * 标签和悬停提示里，数值只留数字和量级。
 */

const EMPTY = "—";

type T = (key: string, options?: Record<string, unknown>) => string;

/** 每秒字节数的短写法：61B、78.6K、1.2M；完整写法（78.6 KB/s）放在悬停提示里。 */
export function formatRateShort(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0";
  if (bps < 1024) return `${Math.round(bps)}B`;
  if (bps < 1024 * 1024) {
    const k = bps / 1024;
    return `${k.toFixed(k < 100 ? 1 : 0)}K`;
  }
  const m = bps / 1024 / 1024;
  return `${m.toFixed(m < 100 ? 1 : 0)}M`;
}

/** 往返耗时：成功写毫秒，失败写「超时」或「失败」。 */
export function roundTripValue(rtt: NodeRoundTrip | undefined, t: T): string {
  if (!rtt) return EMPTY;
  if (rtt.error === "timeout") return t("cluster_nodes.rtt_timeout");
  if (rtt.error) return t("cluster_nodes.rtt_error");
  return rtt.rtt_ms === undefined ? EMPTY : `${rtt.rtt_ms.toFixed(1)} ms`;
}

/** 事务 ID 年龄的简短写法：84,510 → 85K，5 亿 → 500M。 */
export function formatXid(age: number): string {
  if (age >= 1_000_000) return `${Math.round(age / 1_000_000)}M`;
  if (age >= 1_000) return `${Math.round(age / 1_000)}K`;
  return String(age);
}

/** 从某个时刻到 now 的秒数（运行时长、上次成功）；时间戳读不出时为 null。 */
export function uptimeSeconds(startedAt: string | undefined, now: number): number | null {
  if (!startedAt) return null;
  const at = Date.parse(startedAt);
  return Number.isFinite(at) ? Math.max(0, (now - at) / 1000) : null;
}

/** 本地时间的完整写法，详情里用。 */
export function formatTime(iso: string | undefined): string {
  if (!iso) return EMPTY;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : EMPTY;
}
