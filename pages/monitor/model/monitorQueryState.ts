import { MONITOR_RANGE_KEYS, type MonitorRangeKey } from "@code-proxy/api-client";

/**
 * 监控中心的视图状态（时间范围 + 三个维度的筛选）放在地址栏里：排障时把链接发给同事，
 * 对方打开看到的是同一个视角。默认值不写进地址栏，保持链接干净。
 * 自动刷新间隔是个人偏好，不进地址栏（见 useMonitorQueryState）。
 */

export type MonitorFilterDimension = "consumers" | "models" | "channels";

export interface MonitorViewQuery {
  range: MonitorRangeKey;
  consumers: string[];
  models: string[];
  channels: string[];
}

export const DEFAULT_MONITOR_RANGE: MonitorRangeKey = "24h";

/** 地址栏参数名：单数，多值时重复（?model=a&model=b），与后端接口一致。 */
export const MONITOR_PARAM: Record<MonitorFilterDimension, string> = {
  consumers: "consumer",
  models: "model",
  channels: "channel",
};

const DIMENSIONS: MonitorFilterDimension[] = ["consumers", "models", "channels"];

const uniqueValues = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

export function isMonitorRangeKey(value: string | null): value is MonitorRangeKey {
  return value !== null && (MONITOR_RANGE_KEYS as readonly string[]).includes(value);
}

export function parseMonitorViewQuery(params: URLSearchParams): MonitorViewQuery {
  const range = params.get("range");
  return {
    range: isMonitorRangeKey(range) ? range : DEFAULT_MONITOR_RANGE,
    consumers: uniqueValues(params.getAll(MONITOR_PARAM.consumers)),
    models: uniqueValues(params.getAll(MONITOR_PARAM.models)),
    channels: uniqueValues(params.getAll(MONITOR_PARAM.channels)),
  };
}

/** 在已有参数上覆盖监控相关的键，其余参数（如果有）原样保留。 */
export function writeMonitorViewQuery(
  query: MonitorViewQuery,
  base: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(base);
  next.delete("range");
  if (query.range !== DEFAULT_MONITOR_RANGE) next.set("range", query.range);
  for (const dimension of DIMENSIONS) {
    const key = MONITOR_PARAM[dimension];
    next.delete(key);
    for (const value of uniqueValues(query[dimension])) next.append(key, value);
  }
  return next;
}

export function hasMonitorFilters(query: MonitorViewQuery): boolean {
  return DIMENSIONS.some((dimension) => query[dimension].length > 0);
}

export function toggleMonitorFilter(
  query: MonitorViewQuery,
  dimension: MonitorFilterDimension,
  value: string,
): MonitorViewQuery {
  const current = query[dimension];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return { ...query, [dimension]: next };
}

/** 自动刷新档位（秒）；0 表示关闭。 */
export const MONITOR_REFRESH_SECONDS = [0, 30, 60, 300] as const;
export type MonitorRefreshSeconds = (typeof MONITOR_REFRESH_SECONDS)[number];
export const DEFAULT_MONITOR_REFRESH: MonitorRefreshSeconds = 60;

export function normalizeMonitorRefresh(value: unknown): MonitorRefreshSeconds {
  return (MONITOR_REFRESH_SECONDS as readonly number[]).includes(Number(value))
    ? (Number(value) as MonitorRefreshSeconds)
    : DEFAULT_MONITOR_REFRESH;
}
