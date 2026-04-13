import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Download, RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { logsApi } from "@/lib/http/apis";
import { TextInput } from "@/modules/ui/Input";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { EmptyState } from "@/modules/ui/EmptyState";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { useToast } from "@/modules/ui/ToastProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";

type ErrorLogItem = { name: string; size?: number; modified?: number };

const INITIAL_DISPLAY_LINES = 400;
const LOAD_MORE_LINES = 400;
const MAX_BUFFER_LINES = 50000;
const INCREMENTAL_FETCH_LIMIT = 2000;
const LOAD_MORE_THRESHOLD_PX = 64;
const STICK_TO_BOTTOM_THRESHOLD_PX = 48;

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

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

type ParsedLogLine = {
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

const parseLogLine = (raw: string): ParsedLogLine => {
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
      if (method || path) {
        consumed.add(methodIndex);
      }
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

const isManagementTraffic = (line: string): boolean => {
  const lowered = line.toLowerCase();
  return lowered.includes("/v0/management") || lowered.includes("v0/management");
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const Badge = ({ children, className }: { children: ReactNode; className: string }) => (
  <span
    className={[
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      className,
    ].join(" ")}
  >
    {children}
  </span>
);

const getLevelStyles = (level: LogLevel): { badge: string; row: string } => {
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

const getStatusStyles = (statusCode: number): string => {
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

export function LogsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [tab, setTab] = useState<"content" | "errors">("content");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showRawLogs, setShowRawLogs] = useState(false);

  const [buffer, setBuffer] = useState<string[]>([]);
  const [latestTimestamp, setLatestTimestamp] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [hideManagement, setHideManagement] = useState(false);
  const [search, setSearch] = useState("");
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY_LINES);

  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);

  const [requestLogId, setRequestLogId] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // 用 ref 存储瞬时轮询状态，避免把它们放进 useCallback 依赖导致 effect 循环触发与 loading 闪烁。
  const latestTimestampRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const restoreScrollRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const pendingScrollToBottomRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const notifyRef = useRef(notify);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buffer.filter((line) => {
      if (hideManagement && isManagementTraffic(line)) return false;
      if (!q) return true;
      return line.toLowerCase().includes(q);
    });
  }, [buffer, hideManagement, search]);

  const visibleLines = useMemo(() => {
    if (filteredLines.length <= displayCount) return filteredLines;
    return filteredLines.slice(filteredLines.length - displayCount);
  }, [displayCount, filteredLines]);

  const canLoadMore = filteredLines.length > visibleLines.length;
  const parsedVisibleLines = useMemo(
    () => (showRawLogs ? [] : visibleLines.map((line) => parseLogLine(line))),
    [showRawLogs, visibleLines],
  );

  const trimAndAppend = useCallback((current: string[], next: string[]) => {
    const merged = [...current, ...next];
    if (merged.length <= MAX_BUFFER_LINES) return merged;
    return merged.slice(merged.length - MAX_BUFFER_LINES);
  }, []);

  const fetchLogs = useCallback(
    async (options: { mode: "full" | "incremental"; showIndicator?: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const shouldBlockUi = options.mode === "full";
      if (shouldBlockUi) setLoading(true);
      if (options.showIndicator) setRefreshing(true);

      try {
        const shouldAutoScroll = options.mode === "full" ? true : stickToBottomRef.current;

        const after =
          options.mode === "incremental" ? (latestTimestampRef.current ?? undefined) : undefined;

        const result = await logsApi.fetchLogs(
          options.mode === "incremental"
            ? { after, limit: INCREMENTAL_FETCH_LIMIT }
            : { limit: MAX_BUFFER_LINES },
        );
        const lines = Array.isArray(result?.lines) ? result.lines : [];
        const nextLatest =
          typeof result?.["latest-timestamp"] === "number" ? result["latest-timestamp"] : null;

        if (typeof nextLatest === "number") {
          const mergedLatest =
            typeof latestTimestampRef.current === "number"
              ? Math.max(latestTimestampRef.current, nextLatest)
              : nextLatest;
          latestTimestampRef.current = mergedLatest;
          setLatestTimestamp(mergedLatest);
        }

        if (lines.length || options.mode === "full") {
          pendingScrollToBottomRef.current = shouldAutoScroll;
          setBuffer((prev) =>
            options.mode === "full"
              ? lines.slice(Math.max(0, lines.length - MAX_BUFFER_LINES))
              : trimAndAppend(prev, lines),
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("logs_page.failed_fetch");
        notifyRef.current({ type: "error", message });
      } finally {
        if (shouldBlockUi) setLoading(false);
        if (options.showIndicator) setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [trimAndAppend],
  );

  useEffect(() => {
    void fetchLogs({ mode: "full" });
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchLogs({ mode: "incremental" });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  const loadMoreOlder = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!canLoadMore) return;
    if (restoreScrollRef.current) return;

    restoreScrollRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
    setDisplayCount((prev) => prev + LOAD_MORE_LINES);
  }, [canLoadMore]);

  useLayoutEffect(() => {
    if (tab !== "content") return;
    const restore = restoreScrollRef.current;
    const el = containerRef.current;
    if (!restore || !el) return;

    const nextHeight = el.scrollHeight;
    const delta = nextHeight - restore.prevHeight;
    el.scrollTop = restore.prevTop + delta;
    restoreScrollRef.current = null;
  }, [displayCount, parsedVisibleLines.length, showRawLogs, tab, visibleLines.length]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  useLayoutEffect(() => {
    if (!pendingScrollToBottomRef.current) return;
    if (tab !== "content") return;
    if (!containerRef.current) return;

    pendingScrollToBottomRef.current = false;
    scrollToBottom();
  }, [buffer.length, displayCount, scrollToBottom, tab]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nextStickToBottom = distanceToBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
    if (nextStickToBottom !== stickToBottomRef.current) {
      stickToBottomRef.current = nextStickToBottom;
      setIsAtBottom(nextStickToBottom);
    }

    if (!canLoadMore) return;
    if (el.scrollTop > LOAD_MORE_THRESHOLD_PX) return;
    loadMoreOlder();
  }, [canLoadMore, loadMoreOlder]);

  const handleRefresh = useCallback(() => {
    void fetchLogs({ mode: "incremental", showIndicator: true });
  }, [fetchLogs]);

  const handleClearServerLogs = useCallback(async () => {
    try {
      await logsApi.clearLogs();
      setBuffer([]);
      setLatestTimestamp(null);
      latestTimestampRef.current = null;
      pendingScrollToBottomRef.current = true;
      stickToBottomRef.current = true;
      setIsAtBottom(true);
      setDisplayCount(INITIAL_DISPLAY_LINES);
      notify({ type: "success", message: t("logs_page.logs_cleared") });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("logs_page.failed_clear");
      notify({ type: "error", message });
    }
  }, [notify]);

  const loadErrorLogs = useCallback(async () => {
    setErrorLogsLoading(true);
    try {
      const result = await logsApi.fetchErrorLogs();
      const files = Array.isArray(result?.files) ? (result.files as ErrorLogItem[]) : [];
      setErrorLogs(files);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("logs_page.failed_fetch_error_list");
      notify({ type: "error", message });
    } finally {
      setErrorLogsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (tab !== "errors") return;
    if (errorLogsLoading) return;
    if (errorLogs.length) return;
    void loadErrorLogs();
  }, [errorLogs.length, errorLogsLoading, loadErrorLogs, tab]);

  const downloadErrorLog = useCallback(
    async (file: ErrorLogItem) => {
      try {
        const blob = await logsApi.downloadErrorLog(file.name);
        downloadBlob(blob, file.name);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t("logs_page.failed_download_error_log");
        notify({ type: "error", message });
      }
    },
    [notify],
  );

  const handleDownloadLogs = useCallback(() => {
    if (filteredLines.length === 0) {
      notify({ type: "info", message: t("logs_page.no_download_content") });
      return;
    }
    const text = filteredLines.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const date = new Date();
    const stamp = Number.isNaN(date.getTime())
      ? "unknown"
      : date.toISOString().replace(/[:.]/g, "-");
    downloadBlob(blob, `logs-${stamp}.txt`);
    notify({ type: "success", message: t("logs_page.download_started") });
  }, [filteredLines, notify]);

  const handleDownloadRequestLog = useCallback(async () => {
    const id = requestLogId.trim();
    if (!id) {
      notify({ type: "info", message: t("logs_page.enter_request_id") });
      return;
    }
    try {
      const blob = await logsApi.downloadRequestLogById(id);
      downloadBlob(blob, `request-log-${id}.log`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("logs_page.failed_download_request_log");
      notify({ type: "error", message });
    }
  }, [notify, requestLogId]);

  const latestLabel = useMemo(() => {
    if (!latestTimestamp) return "--";
    const date = new Date(latestTimestamp * 1000);
    return Number.isNaN(date.getTime()) ? String(latestTimestamp) : date.toLocaleString();
  }, [latestTimestamp]);

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
        <TabsList>
          <TabsTrigger value="content">{t("logs_page.log_content")}</TabsTrigger>
          <TabsTrigger value="errors">{t("logs_page.error_logs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card
            title={t("logs_page.live_logs")}
            description={t("logs_page.latest_label", {
              time: latestLabel,
              max: MAX_BUFFER_LINES.toLocaleString(),
            })}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading || refreshing}
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  {t("logs_page.refresh")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadLogs}
                  disabled={loading || filteredLines.length === 0}
                >
                  <Download size={14} />
                  {t("logs_page.download")}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmClearOpen(true)}
                  disabled={loading || refreshing}
                >
                  <Trash2 size={14} />
                  {t("logs_page.clear")}
                </Button>
              </div>
            }
            loading={loading}
          >
            <div className="space-y-3">
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder={t("logs_page.search_placeholder")}
                type="search"
                name="log_search"
                autoComplete="off"
                spellCheck={false}
                endAdornment={<ScrollText size={16} className="text-slate-400" />}
              />

              <div className="rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-white/65">
                    {t("logs_page.status_summary", {
                      autoRefresh: autoRefresh
                        ? t("logs_page.auto_refresh_on")
                        : t("logs_page.auto_refresh_off"),
                      hideManagement: hideManagement
                        ? t("logs_page.auto_refresh_on")
                        : t("logs_page.auto_refresh_off"),
                      rawLogs: showRawLogs
                        ? t("logs_page.auto_refresh_on")
                        : t("logs_page.auto_refresh_off"),
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOptionsOpen((prev) => !prev)}
                    className="h-8 px-2 text-xs"
                  >
                    <ChevronDown
                      size={14}
                      className={[
                        "transition-transform motion-safe:duration-200",
                        optionsOpen ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                    />
                    {optionsOpen ? t("logs_page.collapse_options") : t("logs_page.expand_options")}
                  </Button>
                </div>

                {optionsOpen ? (
                  <div className="mt-3 grid gap-4 border-t border-slate-200 pt-4 dark:border-neutral-800 sm:grid-cols-2">
                    <ToggleSwitch
                      label={t("logs_page.auto_refresh")}
                      description={t("logs_page.auto_refresh_desc")}
                      checked={autoRefresh}
                      onCheckedChange={setAutoRefresh}
                      disabled={loading}
                    />
                    <ToggleSwitch
                      label={t("logs_page.hide_mgmt")}
                      description={t("logs_page.hide_mgmt_desc")}
                      checked={hideManagement}
                      onCheckedChange={setHideManagement}
                      disabled={loading}
                    />
                    <ToggleSwitch
                      label={t("logs_page.show_raw")}
                      description={t("logs_page.raw_desc")}
                      checked={showRawLogs}
                      onCheckedChange={setShowRawLogs}
                      disabled={loading}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-neutral-800 dark:text-white/65">
                <div className="min-w-0">
                  <span
                    className="block whitespace-pre-wrap break-words tabular-nums"
                    title={
                      t("logs_page.showing_lines", {
                        visible: visibleLines.length.toLocaleString(),
                        total: filteredLines.length.toLocaleString(),
                      }) + (canLoadMore ? " " + t("logs_page.scroll_up_hint") : "")
                    }
                  >
                    {t("logs_page.showing_lines", {
                      visible: visibleLines.length.toLocaleString(),
                      total: filteredLines.length.toLocaleString(),
                    })}
                    {canLoadMore ? " " + t("logs_page.scroll_up_hint") : ""}
                  </span>
                </div>
                <div className="shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={scrollToBottom}
                    disabled={visibleLines.length === 0 || isAtBottom}
                    className={
                      visibleLines.length === 0 || isAtBottom ? "pointer-events-none opacity-0" : ""
                    }
                  >
                    {t("logs_page.jump_to_latest")}
                  </Button>
                </div>
              </div>
              <div
                ref={containerRef}
                onScroll={onScroll}
                className="max-h-[60vh] overflow-y-auto bg-slate-50 px-4 py-3 text-slate-900 dark:bg-neutral-950/60 dark:text-slate-100"
              >
                {visibleLines.length === 0 ? (
                  <div className="px-1 py-4">
                    <EmptyState
                      title={t("logs_page.no_logs")}
                      description={t("logs_page.no_logs_desc")}
                    />
                  </div>
                ) : showRawLogs ? (
                  <pre
                    spellCheck={false}
                    className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"
                  >
                    {visibleLines.join("\n")}
                  </pre>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px] divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white/70 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950/40">
                      {parsedVisibleLines.map((line, index) => {
                        const levelStyles = line.level ? getLevelStyles(line.level) : null;
                        const rowClassName = [
                          "px-3 py-2",
                          "hover:bg-slate-50 dark:hover:bg-white/5",
                          levelStyles?.row,
                        ]
                          .filter(Boolean)
                          .join(" ");

                        return (
                          <div
                            key={`${filteredLines.length - visibleLines.length + index}`}
                            className={rowClassName}
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-36 shrink-0 tabular-nums text-[11px] text-slate-500 dark:text-white/55">
                                {line.timestamp ?? ""}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {line.level ? (
                                    <Badge className={levelStyles?.badge ?? ""}>
                                      {line.level.toUpperCase()}
                                    </Badge>
                                  ) : null}
                                  {line.source ? (
                                    <Badge className="border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                      {line.source}
                                    </Badge>
                                  ) : null}
                                  {line.requestId ? (
                                    <Badge className="border-slate-200 bg-slate-50 font-mono text-slate-700 dark:border-neutral-800 dark:bg-white/5 dark:text-white/70">
                                      {line.requestId}
                                    </Badge>
                                  ) : null}
                                  {typeof line.statusCode === "number" ? (
                                    <Badge className={getStatusStyles(line.statusCode)}>
                                      {line.statusCode}
                                    </Badge>
                                  ) : null}
                                  {line.latency ? (
                                    <Badge className="border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                      {line.latency}
                                    </Badge>
                                  ) : null}
                                  {line.ip ? (
                                    <Badge className="border-slate-200 bg-white font-mono text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                      {line.ip}
                                    </Badge>
                                  ) : null}
                                  {line.method ? (
                                    <Badge className="border-slate-200 bg-white text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                      {line.method}
                                    </Badge>
                                  ) : null}
                                  {line.path ? (
                                    <Badge className="border-slate-200 bg-white font-mono text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/70">
                                      <span className="break-all">{line.path}</span>
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100">
                                  {line.message}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card
            title={t("logs_page.error_logs_title")}
            description={t("logs_page.error_fetch_desc")}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadErrorLogs()}
                  disabled={errorLogsLoading}
                >
                  <RefreshCw size={14} className={errorLogsLoading ? "animate-spin" : ""} />
                  {t("logs_page.refresh_list")}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("logs_page.request_id_download_title")}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
                      {t("logs_page.request_id_download_desc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={requestLogId}
                      onChange={(e) => setRequestLogId(e.currentTarget.value)}
                      placeholder={t("logs_page.request_id_placeholder")}
                      name="request_log_id"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-9 w-44 rounded-xl px-3 py-2 text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDownloadRequestLog}
                      disabled={requestLogId.trim().length === 0}
                    >
                      {t("logs_page.download")}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("logs_page.error_log_files")}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
                  {t("logs_page.error_log_list_desc")}
                </p>

                <div className="mt-4">
                  {errorLogsLoading ? (
                    <div className="text-sm text-slate-600 dark:text-white/65">
                      {t("logs_page.loading")}
                    </div>
                  ) : errorLogs.length === 0 ? (
                    <EmptyState
                      title={t("logs_page.no_error_logs")}
                      description={t("logs_page.no_error_desc")}
                    />
                  ) : (
                    <div className="space-y-2">
                      {errorLogs.map((file) => (
                        <div
                          key={file.name}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                        >
                          <div className="min-w-0">
                            <p className="break-all font-mono text-xs text-slate-900 dark:text-white">
                              {file.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                              {typeof file.size === "number"
                                ? t("logs_page.bytes", { size: file.size.toLocaleString() })
                                : "--"}{" "}
                              ·{" "}
                              {typeof file.modified === "number"
                                ? new Date(
                                    file.modified < 1e12 ? file.modified * 1000 : file.modified,
                                  ).toLocaleString()
                                : "--"}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void downloadErrorLog(file)}
                          >
                            <Download size={14} />
                            {t("logs_page.download")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmModal
        open={confirmClearOpen}
        title={t("logs_page.clear_server_logs")}
        description={t("logs_page.confirm_clear_logs")}
        confirmText={t("logs_page.confirm_clear_btn")}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          setConfirmClearOpen(false);
          void handleClearServerLogs();
        }}
      />
    </div>
  );
}
