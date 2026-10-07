import type { MonitorOverview, MonitorSeriesPoint } from "@code-proxy/api-client";

/**
 * 比率类序列（成功率、平均耗时）在没有请求的时段里是 0——画出来像「成功率掉到 0」
 * 或「耗时突然为 0」。这些时段延续上一个有数据时段的值；开头就没有数据时用 fallback。
 */
export function carryForward(
  points: readonly MonitorSeriesPoint[],
  pick: (point: MonitorSeriesPoint) => number,
  hasValue: (point: MonitorSeriesPoint) => boolean,
  fallback: number,
): number[] {
  const out: number[] = [];
  let last: number | null = null;
  for (const point of points) {
    if (hasValue(point)) last = pick(point);
    out.push(last ?? fallback);
  }
  // 开头一段延续不到值：回填成第一个真实值，免得趋势线从 fallback 斜冲上来。
  const firstReal = points.findIndex(hasValue);
  if (firstReal > 0) {
    for (let i = 0; i < firstReal; i++) out[i] = out[firstReal];
  }
  return out;
}

/**
 * 时间窗里实际经过的分钟数。7 天按 3 小时对齐、「今天」按整点对齐，窗口末端可能落在
 * 未来；平均 RPM 要除以真正走过的时间，否则早上看「今天」会被摊薄。
 */
export function elapsedWindowMinutes(overview: MonitorOverview): number {
  const start = Date.parse(overview.range.start);
  const end = Date.parse(overview.range.end);
  const now = Date.parse(overview.generated_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return Math.max(1, (overview.series.length * overview.range.step_seconds) / 60);
  }
  const until = Number.isFinite(now) ? Math.min(end, now) : end;
  return Math.max(1, (until - start) / 60_000);
}

export function seriesValues(
  points: readonly MonitorSeriesPoint[],
  pick: (point: MonitorSeriesPoint) => number,
): number[] {
  return points.map(pick);
}
