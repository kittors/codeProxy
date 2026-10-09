export type ErrorLogItem = {
  name: string;
  size?: number;
  modified?: number;
  request_id?: string;
  status?: number;
  error_code?: string;
  error_type?: string;
  original_url?: string;
  effective_url?: string;
  route_group?: string;
  route_path?: string;
  model?: string;
  provider?: string;
  upstream_status?: number;
  rejected_by?: string;
};

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const HTTP_METHOD_REGEX = new RegExp(`\\b(${HTTP_METHODS.join("|")})\\b`);

const LOG_TIMESTAMP_REGEX =
  /^\[?(\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]?\s*/;
const LOG_REQUEST_ID_REGEX = /^\[([a-f0-9]{8}|--------)\]\s*/i;
const LOG_LEVEL_REGEX = /^\[?(trace|debug|info|warn|warning|error|fatal)\s*\]?\s*/i;
const LOG_SOURCE_REGEX = /^\[([^\]]+)\]\s*/;
const LOG_LATENCY_REGEX =
  /\b(?:\d+(?:\.\d+)?\s*(?:µs|us|ms|s|m))(?:\s*\d+(?:\.\d+)?\s*(?:µs|us|ms|s|m))*\b/i;
const LOG_IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

export type ParsedLogLine = {
  raw: string;
  timestamp?: string;
  level?: LogLevel;
  source?: string;
  requestId?: string;
  statusCode?: number;
  latency?: string;
  ip?: string;
  method?: HttpMethod;
  path?: string;
  message: string;
};

const extractLogLevel = (value: string): LogLevel | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "warning" || normalized === "warn") return "warn";
  if (normalized === "debug") return "debug";
  if (normalized === "info") return "info";
  if (normalized === "error") return "error";
  if (normalized === "fatal") return "fatal";
  if (normalized === "trace") return "trace";
  return undefined;
};

const extractLatency = (text: string): string | undefined => {
  const match = text.match(LOG_LATENCY_REGEX);
  if (!match) return undefined;
  return match[0].replace(/\s+/g, "");
};

const extractHttpMethodAndPath = (text: string): { method?: HttpMethod; path?: string } => {
  const match = text.match(HTTP_METHOD_REGEX);
  if (!match) return {};
  const method = match[1] as HttpMethod;
  const index = match.index ?? 0;
  const after = text.slice(index + match[0].length).trim();
  if (!after) return { method };
  const candidate = after.split(/\s+/)[0] ?? "";
  const stripped = candidate.replace(/^["']/, "").replace(/["']$/, "");
  return { method, path: stripped || undefined };
};

export const parseLogLine = (raw: string): ParsedLogLine => {
  let remaining = raw.trim();

  let timestamp: string | undefined;
  const tsMatch = remaining.match(LOG_TIMESTAMP_REGEX);
  if (tsMatch) {
    timestamp = tsMatch[1];
    remaining = remaining.slice(tsMatch[0].length).trim();
  }

  let requestId: string | undefined;
  const requestMatch = remaining.match(LOG_REQUEST_ID_REGEX);
  if (requestMatch) {
    const id = requestMatch[1];
    if (!/^-+$/.test(id)) requestId = id;
    remaining = remaining.slice(requestMatch[0].length).trim();
  }

  let level: LogLevel | undefined;
  const levelMatch = remaining.match(LOG_LEVEL_REGEX);
  if (levelMatch) {
    level = extractLogLevel(levelMatch[1]);
    remaining = remaining.slice(levelMatch[0].length).trim();
  }

  let source: string | undefined;
  const sourceMatch = remaining.match(LOG_SOURCE_REGEX);
  if (sourceMatch) {
    source = sourceMatch[1];
    remaining = remaining.slice(sourceMatch[0].length).trim();
  }

  let statusCode: number | undefined;
  let latency: string | undefined;
  let ip: string | undefined;
  let method: HttpMethod | undefined;
  let path: string | undefined;
  let message = remaining;

  if (remaining.includes("|")) {
    const segments = remaining
      .split("|")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const consumed = new Set<number>();

    const statusIndex = segments.findIndex((segment) => /^\d{3}$/.test(segment));
    if (statusIndex >= 0) {
      const code = Number.parseInt(segments[statusIndex], 10);
      if (code >= 100 && code <= 599) {
        statusCode = code;
        consumed.add(statusIndex);
      }
    }

    const latencyIndex = segments.findIndex((segment) => LOG_LATENCY_REGEX.test(segment));
    if (latencyIndex >= 0) {
      const extracted = extractLatency(segments[latencyIndex]);
      if (extracted) {
        latency = extracted;
        consumed.add(latencyIndex);
      }
    }

    const ipIndex = segments.findIndex((segment) => LOG_IPV4_REGEX.test(segment));
    if (ipIndex >= 0) {
      const match = segments[ipIndex].match(LOG_IPV4_REGEX);
      if (match) {
        ip = match[0];
        consumed.add(ipIndex);
      }
    }

    const methodIndex = segments.findIndex((segment) => HTTP_METHOD_REGEX.test(segment));
    if (methodIndex >= 0) {
      const extracted = extractHttpMethodAndPath(segments[methodIndex]);
      method = extracted.method;
      path = extracted.path;
      if (method || path) consumed.add(methodIndex);
    }

    const rest = segments.filter((_, idx) => !consumed.has(idx));
    message = rest.join(" | ");
  } else {
    const extracted = extractHttpMethodAndPath(remaining);
    method = extracted.method;
    path = extracted.path;
    const ipMatch = remaining.match(LOG_IPV4_REGEX);
    if (ipMatch) ip = ipMatch[0];
    const latencyMatch = extractLatency(remaining);
    if (latencyMatch) latency = latencyMatch;
  }

  if (!message) message = remaining;

  return {
    raw,
    timestamp,
    level,
    source,
    requestId,
    statusCode,
    latency,
    ip,
    method,
    path,
    message,
  };
};

export const isManagementTraffic = (line: string): boolean => {
  const lowered = line.toLowerCase();
  return lowered.includes("/v0/management") || lowered.includes("v0/management");
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/*
 * 日志级别与状态码的标签都只用淡底、不描边。警告琥珀、错误红在两种配色风格下都有；
 * info 与 2xx / 3xx 的基础形态（简约风格）是中性标签，多彩风格下叠回 info 天蓝标签加天蓝行底、
 * 2xx 绿、3xx 天蓝。debug / trace 一直是中性的。
 */
export const LOG_NEUTRAL_BADGE = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";
export const LOG_MUTED_BADGE = "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]";
const WARN_BADGE = "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300";
const ERROR_BADGE = "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300";
const INFO_BADGE = `${LOG_NEUTRAL_BADGE} colorful:bg-sky-50 colorful:text-sky-700 colorful:dark:bg-sky-500/10 colorful:dark:text-sky-200`;
const SUCCESS_BADGE = `${LOG_NEUTRAL_BADGE} colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/10 colorful:dark:text-emerald-200`;

export const getLevelStyles = (level: LogLevel): { badge: string; row: string } => {
  switch (level) {
    case "info":
      return { badge: INFO_BADGE, row: "colorful:bg-sky-50/40 colorful:dark:bg-sky-500/5" };
    case "warn":
      return { badge: WARN_BADGE, row: "bg-amber-500/[0.05] dark:bg-amber-400/[0.06]" };
    case "error":
    case "fatal":
      return { badge: ERROR_BADGE, row: "bg-rose-500/[0.05] dark:bg-rose-400/[0.06]" };
    case "debug":
    case "trace":
      return { badge: LOG_MUTED_BADGE, row: "" };
    default:
      return { badge: LOG_NEUTRAL_BADGE, row: "" };
  }
};

export const getStatusStyles = (statusCode: number): string => {
  if (statusCode >= 500) return ERROR_BADGE;
  if (statusCode >= 400) return WARN_BADGE;
  if (statusCode >= 300) return INFO_BADGE;
  if (statusCode >= 200) return SUCCESS_BADGE;
  return LOG_NEUTRAL_BADGE;
};
