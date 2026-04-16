export type ErrorLogItem = { name: string; size?: number; modified?: number };

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

export const getLevelStyles = (level: LogLevel): { badge: string; row: string } => {
  switch (level) {
    case "info":
      return {
        badge:
          "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200",
        row: "bg-sky-50/40 dark:bg-sky-500/5",
      };
    case "warn":
      return {
        badge:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200",
        row: "bg-amber-50/40 dark:bg-amber-500/5",
      };
    case "error":
    case "fatal":
      return {
        badge:
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200",
        row: "bg-rose-50/40 dark:bg-rose-500/5",
      };
    case "debug":
      return {
        badge:
          "border-slate-200 bg-slate-100 text-slate-700 dark:border-neutral-800 dark:bg-white/10 dark:text-white/70",
        row: "",
      };
    case "trace":
      return {
        badge:
          "border-slate-200 bg-slate-50 text-slate-600 dark:border-neutral-800 dark:bg-white/5 dark:text-white/55",
        row: "",
      };
    default:
      return {
        badge:
          "border-slate-200 bg-slate-50 text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70",
        row: "",
      };
  }
};

export const getStatusStyles = (statusCode: number): string => {
  if (statusCode >= 200 && statusCode < 300) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200";
  }
  if (statusCode >= 300 && statusCode < 400) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200";
  }
  if (statusCode >= 400 && statusCode < 500) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200";
  }
  if (statusCode >= 500) {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70";
};
