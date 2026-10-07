import { formatCompactNumber, formatUsd } from "@code-proxy/domain";

/**
 * 监控中心的数字写法。与请求日志、仪表盘同一套紧凑写法（K / M / B）和美元费用。
 * 大数字卡片保留到十万级的完整数字——17,790 比 17.8K 更能看出「涨了几百」。
 */

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

/** 大数字卡片：十万以内写全，之外紧凑两位小数（2.19B）。 */
export function formatMonitorCount(value: number): string {
  const num = finite(value);
  if (Math.abs(num) < 100_000) return Math.round(num).toLocaleString();
  return formatCompactNumber(num, { threshold: 1_000, maximumFractionDigits: 2 });
}

/** 表格、图例、提示里的数字：一万以上紧凑一位小数。 */
export function formatMonitorCompact(value: number): string {
  return formatCompactNumber(finite(value), {
    threshold: 10_000,
    maximumFractionDigits: 1,
    standardMaximumFractionDigits: 0,
  });
}

/** 速率（次/分）：不足 10 保留小数，0.19 次/分不该写成 0。 */
export function formatMonitorRate(value: number): string {
  const num = Math.max(0, finite(value));
  if (num === 0) return "0";
  if (num < 10) return String(Number(num.toFixed(num < 1 ? 2 : 1)));
  return formatMonitorCompact(num);
}

/** 费用：一美元以上两位小数，零头保留四位，避免小额请求都显示成 $0.00。 */
export function formatMonitorCost(value: number): string {
  const num = finite(value);
  if (num !== 0 && Math.abs(num) < 1) return formatUsd(num, { fractionDigits: 4 });
  if (Math.abs(num) >= 100_000) {
    return `$${formatCompactNumber(num, { threshold: 1_000, maximumFractionDigits: 2 })}`;
  }
  return formatUsd(num, { fractionDigits: 2 });
}

/**
 * 耗时：850ms · 12.3s · 2m 05s。每一档都先按要显示的精度取整再判断落在哪档，
 * 否则 999.6ms 会写成「1000ms」、119.6s 会写成「1m 60s」。
 */
export function formatMonitorDuration(ms: number): string {
  const value = Math.max(0, finite(ms));
  if (Math.round(value) < 1_000) return `${Math.round(value)}ms`;
  const seconds = value / 1_000;
  if (Math.round(seconds * 100) < 1_000) return `${seconds.toFixed(2)}s`;
  if (Math.round(seconds * 10) < 600) return `${seconds.toFixed(1)}s`;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

export function formatMonitorPercent(value: number, digits = 2): string {
  return `${finite(value).toFixed(digits)}%`;
}

/** 坐标轴刻度：短，不带小数尾巴。 */
export function formatMonitorAxis(value: number): string {
  return formatCompactNumber(finite(value), {
    threshold: 1_000,
    maximumFractionDigits: 1,
    standardMaximumFractionDigits: 0,
  });
}

export function formatMonitorAxisDuration(ms: number): string {
  const value = Math.max(0, finite(ms));
  if (value === 0) return "0";
  if (value < 1_000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${Number((value / 1_000).toFixed(1))}s`;
  return `${Number((value / 60_000).toFixed(1))}m`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * 序列点的标签。服务端按自己的时区给出带偏移的 RFC 3339 时间；这里直接读字符串里的
 * 本地钟点，不经过浏览器时区——运维看的是服务器那边的「几点」，和日志、计费对得上。
 */
export function parseMonitorStamp(stamp: string) {
  const match = stamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

export function formatMonitorBucketLabel(stamp: string, stepSeconds: number): string {
  const parts = parseMonitorStamp(stamp);
  if (!parts) return stamp;
  if (stepSeconds >= 86_400) return `${pad(parts.month)}/${pad(parts.day)}`;
  if (stepSeconds >= 3 * 3_600)
    return `${pad(parts.month)}/${pad(parts.day)} ${pad(parts.hour)}:00`;
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 「10/07 13:00」：服务器时区的月日与钟点。 */
export function formatMonitorStamp(stamp: string): string {
  const parts = parseMonitorStamp(stamp);
  if (!parts) return stamp;
  return `${pad(parts.month)}/${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 提示框里的完整时段：「10/07 13:00 – 14:00」。 */
export function formatMonitorBucketRange(stamp: string, stepSeconds: number): string {
  const parts = parseMonitorStamp(stamp);
  if (!parts) return stamp;
  const head = `${pad(parts.month)}/${pad(parts.day)}`;
  if (stepSeconds >= 86_400) return head;
  const startMinutes = parts.hour * 60 + parts.minute;
  const endMinutes = (startMinutes + Math.round(stepSeconds / 60)) % (24 * 60);
  const end = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;
  return `${head} ${pad(parts.hour)}:${pad(parts.minute)} – ${end}`;
}

/** 「12 秒前」「3 分钟前」；超过一小时就给钟点。t 是 i18next 的翻译函数。 */
export function formatMonitorAgo(
  then: number,
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const seconds = Math.max(0, Math.round((now - then) / 1_000));
  if (seconds < 5) return t("monitor_center.just_now");
  if (seconds < 60) return t("monitor_center.seconds_ago", { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("monitor_center.minutes_ago", { count: minutes });
  const date = new Date(then);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 明细时间（UTC 时间戳）按浏览器本地时间显示：「10/07 13:47:05」。 */
export function formatMonitorLocalTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
