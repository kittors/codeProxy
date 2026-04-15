import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { logsApi } from "@/lib/http/apis";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { useToast } from "@/modules/ui/ToastProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ErrorLogsTab } from "@/modules/logs/components/ErrorLogsTab";
import { LiveLogsTab } from "@/modules/logs/components/LiveLogsTab";
import {
  downloadBlob,
  type ErrorLogItem,
  isManagementTraffic,
  parseLogLine,
} from "@/modules/logs/logsHelpers";

const INITIAL_DISPLAY_LINES = 400;
const LOAD_MORE_LINES = 400;
const MAX_BUFFER_LINES = 50000;
const INCREMENTAL_FETCH_LIMIT = 2000;
const LOAD_MORE_THRESHOLD_PX = 64;
const STICK_TO_BOTTOM_THRESHOLD_PX = 48;


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
        await logsApi.downloadErrorLog(file.name);
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
      await logsApi.downloadRequestLogById(id);
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
          <LiveLogsTab
            t={t}
            loading={loading}
            refreshing={refreshing}
            filteredLines={filteredLines}
            visibleLines={visibleLines}
            parsedVisibleLines={parsedVisibleLines}
            canLoadMore={canLoadMore}
            latestLabel={latestLabel}
            handleRefresh={handleRefresh}
            handleDownloadLogs={handleDownloadLogs}
            setConfirmClearOpen={setConfirmClearOpen}
            search={search}
            setSearch={setSearch}
            optionsOpen={optionsOpen}
            setOptionsOpen={setOptionsOpen}
            autoRefresh={autoRefresh}
            setAutoRefresh={setAutoRefresh}
            hideManagement={hideManagement}
            setHideManagement={setHideManagement}
            showRawLogs={showRawLogs}
            setShowRawLogs={setShowRawLogs}
            quotaSummary={t("logs_page.status_summary", {
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
            scrollToBottom={scrollToBottom}
            isAtBottom={isAtBottom}
            containerRef={containerRef}
            onScroll={onScroll}
          />
        </TabsContent>

        <TabsContent value="errors">
          <ErrorLogsTab
            t={t}
            errorLogsLoading={errorLogsLoading}
            errorLogs={errorLogs}
            requestLogId={requestLogId}
            setRequestLogId={setRequestLogId}
            handleDownloadRequestLog={handleDownloadRequestLog}
            loadErrorLogs={loadErrorLogs}
            downloadErrorLog={downloadErrorLog}
          />
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
