import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageLogItem, UsageLogsResponse } from "@/lib/http/apis/usage";
import { parseUsageTimestampMs } from "@/modules/monitor/monitor-utils";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import { Select } from "@/modules/ui/Select";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ErrorDetailModal } from "@/modules/monitor/ErrorDetailModal";

type TimeRange = 1 | 7 | 14 | 30;
type StatusFilter = "" | "success" | "failed";

interface LogRow {
  id: string;
  timestamp: string;
  timestampMs: number;
  apiKey: string;
  apiKeyName: string;
  channelName: string;
  maskedApiKey: string;
  model: string;
  failed: boolean;
  latencyText: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  hasContent: boolean;
}

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;

const maskApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

const formatTimestamp = (value: string): string => {
  const ms = parseUsageTimestampMs(value);
  if (!Number.isFinite(ms)) return value || "--";
  return new Date(ms).toLocaleString();
};

const formatLatencyMs = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1) return "<1ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  const fixed = seconds.toFixed(seconds < 10 ? 2 : 1);
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return `${trimmed}s`;
};

const TimeRangeSelector = ({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}) => {
  const { t } = useTranslation();
  return (
    <Tabs value={String(value)} onValueChange={(next) => onChange(Number(next) as TimeRange)}>
      <TabsList>
        {TIME_RANGES.map((range) => {
          const label =
            range === 1 ? t("request_logs.today") : t("request_logs.n_days", { count: range });
          return (
            <TabsTrigger key={range} value={String(range)}>
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
};

// ---------------------------------------------------------------------------
// Column definitions (kept as-is)
// ---------------------------------------------------------------------------

interface TableColumn<T> {
  key: string;
  label: string;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}

function buildLogColumns(
  t: (key: string) => string,
  onContentClick?: (logId: number, tab: "input" | "output") => void,
  onErrorClick?: (logId: number, model: string) => void,
): TableColumn<LogRow>[] {
  return [
    {
      key: "id",
      label: t("request_logs.col_id"),
      width: "w-20",
      cellClassName: "font-mono text-xs tabular-nums text-slate-500 dark:text-white/50",
      render: (row) => (
        <OverflowTooltip content={`#${row.id}`} className="block min-w-0">
          <span className="block min-w-0 truncate">#{row.id}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "timestamp",
      label: t("request_logs.col_time"),
      width: "w-52",
      cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={formatTimestamp(row.timestamp)} className="block min-w-0">
          <span className="block min-w-0 truncate">{formatTimestamp(row.timestamp)}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "apiKeyName",
      label: t("request_logs.col_key_name"),
      width: "w-32",
      render: (row) => (
        <OverflowTooltip content={row.apiKeyName || "--"} className="block min-w-0">
          <span
            className={`block min-w-0 truncate text-xs font-medium ${row.apiKeyName ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.apiKeyName || "--"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "model",
      label: t("request_logs.col_model"),
      width: "w-56",
      render: (row) => (
        <OverflowTooltip content={row.model} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.model}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "channelName",
      label: t("request_logs.col_channel"),
      width: "w-32",
      render: (row) => (
        <OverflowTooltip content={row.channelName || "--"} className="block min-w-0">
          <span
            className={`block min-w-0 truncate text-xs font-medium ${row.channelName ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.channelName || "--"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "status",
      label: t("request_logs.col_status"),
      width: "w-20",
      render: (row) =>
        row.failed ? (
          <button
            type="button"
            onClick={() => onErrorClick?.(Number(row.id), row.model)}
            className="inline-flex min-w-[52px] cursor-pointer justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 hover:shadow-sm dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
            title={t("request_logs.view_error")}
          >
            {t("request_logs.status_failed")}
          </button>
        ) : (
          <span className="inline-flex min-w-[52px] justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            {t("request_logs.status_success")}
          </span>
        ),
    },
    {
      key: "latency",
      label: t("request_logs.col_duration"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={row.latencyText} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.latencyText}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "inputTokens",
      label: t("request_logs.col_input"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "input")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-sky-50 dark:hover:bg-sky-950/30"
            title={t("request_logs.view_input")}
          >
            <span className="truncate text-sky-600 dark:text-sky-400 underline decoration-sky-300/50 dark:decoration-sky-500/40 underline-offset-2">
              {row.inputTokens.toLocaleString()}
            </span>
          </button>
        ) : (
          <OverflowTooltip content={row.inputTokens.toLocaleString()} className="block min-w-0">
            <span className="block min-w-0 truncate">{row.inputTokens.toLocaleString()}</span>
          </OverflowTooltip>
        ),
    },
    {
      key: "cachedTokens",
      label: t("request_logs.col_cache_read"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums",
      render: (row) => (
        <OverflowTooltip content={row.cachedTokens.toLocaleString()} className="block min-w-0">
          <span
            className={`block min-w-0 truncate ${row.cachedTokens > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.cachedTokens > 0 ? row.cachedTokens.toLocaleString() : "0"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "outputTokens",
      label: t("request_logs.col_output"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "output")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            title={t("request_logs.view_output")}
          >
            <span className="truncate text-emerald-600 dark:text-emerald-400 underline decoration-emerald-300/50 dark:decoration-emerald-500/40 underline-offset-2">
              {row.outputTokens.toLocaleString()}
            </span>
          </button>
        ) : (
          <OverflowTooltip content={row.outputTokens.toLocaleString()} className="block min-w-0">
            <span className="block min-w-0 truncate">{row.outputTokens.toLocaleString()}</span>
          </OverflowTooltip>
        ),
    },
    {
      key: "totalTokens",
      label: t("request_logs.col_total_token"),
      width: "w-28",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
      render: (row) => (
        <OverflowTooltip content={row.totalTokens.toLocaleString()} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.totalTokens.toLocaleString()}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "cost",
      label: t("request_logs.col_cost"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400",
      render: (row) => (
        <OverflowTooltip content={`$${row.cost.toFixed(6)}`} className="block min-w-0">
          <span className="block min-w-0 truncate">${row.cost.toFixed(4)}</span>
        </OverflowTooltip>
      ),
    },
  ];
}

/** Convert a backend log item to a UI-friendly LogRow */
function toLogRow(item: UsageLogItem): LogRow {
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: parseUsageTimestampMs(item.timestamp),
    apiKey: item.api_key,
    apiKeyName: item.api_key_name || "",
    channelName: item.channel_name || "",
    maskedApiKey: maskApiKey(item.api_key),
    model: item.model,
    failed: item.failed,
    latencyText: formatLatencyMs(item.latency_ms),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    cost: item.cost ?? 0,
    hasContent: item.has_content ?? false,
  };
}

// ---------------------------------------------------------------------------
// Pagination Bar
// ---------------------------------------------------------------------------

function PaginationBar({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();

  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  // Build visible page numbers (always max ~7 buttons)
  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const rangeStart = Math.max(2, currentPage - 1);
      const rangeEnd = Math.min(totalPages - 1, currentPage + 1);
      for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  const btnBase =
    "inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";
  const btnNormal = `${btnBase} text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10`;
  const btnActive = `${btnBase} bg-slate-900 text-white dark:bg-white dark:text-neutral-950`;

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-neutral-800/60">
      {/* Left: info */}
      <span className="text-xs text-slate-500 dark:text-white/50 tabular-nums whitespace-nowrap">
        {t("request_logs.page_info", { start, end, total: totalCount })}
      </span>

      {/* Center: page buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title={t("request_logs.first_page")}
          aria-label={t("request_logs.first_page")}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title={t("request_logs.prev_page")}
          aria-label={t("request_logs.prev_page")}
        >
          <ChevronLeft size={14} />
        </button>

        {pageNumbers.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-1 text-xs text-slate-400 dark:text-white/30">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === currentPage ? btnActive : btnNormal}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          className={btnNormal}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title={t("request_logs.next_page")}
          aria-label={t("request_logs.next_page")}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title={t("request_logs.last_page")}
          aria-label={t("request_logs.last_page")}
        >
          <ChevronsRight size={14} />
        </button>
      </div>

      {/* Right: rows per page */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 dark:text-white/50 whitespace-nowrap">
          {t("request_logs.rows_per_page")}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-slate-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/80 dark:focus:border-neutral-500"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RequestLogsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  // Content modal state
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalLogId, setContentModalLogId] = useState<number | null>(null);
  const [contentModalTab, setContentModalTab] = useState<"input" | "output">("input");

  const handleContentClick = useCallback((logId: number, tab: "input" | "output") => {
    setContentModalLogId(logId);
    setContentModalTab(tab);
    setContentModalOpen(true);
  }, []);

  // Error modal state
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalLogId, setErrorModalLogId] = useState<number | null>(null);
  const [errorModalModel, setErrorModalModel] = useState("");

  const handleErrorClick = useCallback((logId: number, model: string) => {
    setErrorModalLogId(logId);
    setErrorModalModel(model);
    setErrorModalOpen(true);
  }, []);

  // Build columns with content click handler
  const logColumns = useMemo(
    () => buildLogColumns(t, handleContentClick, handleErrorClick),
    [t, handleContentClick, handleErrorClick],
  );

  // Data state (page-based, no accumulation)
  const [rawItems, setRawItems] = useState<UsageLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Pagination state
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Backend-provided metadata
  const [filterOptions, setFilterOptions] = useState<{
    api_keys: string[];
    api_key_names: Record<string, string>;
    models: string[];
  }>({
    api_keys: [],
    api_key_names: {},
    models: [],
  });
  const [stats, setStats] = useState<{ total: number; success_rate: number; total_tokens: number }>(
    { total: 0, success_rate: 0, total_tokens: 0 },
  );

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiQuery, setApiQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const fetchInFlightRef = useRef(false);

  // Fetch logs from backend (server-side pagination)
  const fetchLogs = useCallback(
    async (page: number, size: number) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      setLoading(true);

      try {
        const resp: UsageLogsResponse = await usageApi.getUsageLogs({
          page,
          size,
          days: timeRange,
          api_key: apiQuery || undefined,
          model: modelQuery || undefined,
          status: statusFilter || undefined,
        });

        setRawItems(resp.items ?? []);
        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        setFilterOptions(resp.filters ?? { api_keys: [], api_key_names: {}, models: [] });
        setStats(resp.stats ?? { total: 0, success_rate: 0, total_tokens: 0 });
        setLastUpdatedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : t("request_logs.refresh_failed");
        notify({ type: "error", message });
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
      }
    },
    [timeRange, apiQuery, modelQuery, statusFilter, notify, t],
  );

  // Derive display rows from raw items
  const rows = useMemo<LogRow[]>(() => (rawItems ?? []).map((item) => toLogRow(item)), [rawItems]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      fetchLogs(clamped, pageSize);
    },
    [fetchLogs, pageSize, totalPages],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      fetchLogs(1, newSize);
    },
    [fetchLogs],
  );

  // Fetch page 1 when filters change
  useEffect(() => {
    fetchLogs(1, pageSize);
  }, [timeRange, apiQuery, modelQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build options from backend filter data
  const keyOptions = useMemo(() => {
    const names = filterOptions.api_key_names ?? {};
    return [
      { value: "", label: t("request_logs.all_keys") },
      ...filterOptions.api_keys.map((key) => ({
        value: key,
        label: names[key] || maskApiKey(key),
        searchText: `${names[key] || ""} ${key}`,
      })),
    ];
  }, [filterOptions.api_keys, filterOptions.api_key_names, t]);

  const modelOptions = useMemo(() => {
    return [
      { value: "", label: t("request_logs.all_models") },
      ...filterOptions.models.map((m) => ({ value: m, label: m })),
    ];
  }, [filterOptions.models, t]);

  const lastUpdatedText = useMemo(() => {
    if (loading) return t("request_logs.refreshing");
    if (!lastUpdatedAt) return t("request_logs.not_refreshed");
    return t("request_logs.updated_at", { time: new Date(lastUpdatedAt).toLocaleTimeString() });
  }, [lastUpdatedAt, loading, t]);

  const colCount = logColumns.length;

  return (
    <section className="flex flex-1 flex-col">
      <h1 className="sr-only">{t("request_logs.title")}</h1>

      {/* 单层卡片：标题 + 筛选 + 统计 + 表格 + 分页 */}
      <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
        {/* 标题栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <ScrollText size={18} className="text-slate-900 dark:text-white" aria-hidden="true" />
            {t("request_logs.heading")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <button
              type="button"
              onClick={() => fetchLogs(1, pageSize)}
              disabled={loading}
              aria-busy={loading}
              aria-label={t("request_logs.refresh")}
              title={t("request_logs.refresh")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white/15"
            >
              <RefreshCw
                size={14}
                className={loading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* 筛选 + 统计 */}
        <div className="border-t border-slate-100 px-5 py-3 dark:border-neutral-800/60">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
              <SearchableSelect
                value={apiQuery}
                onChange={setApiQuery}
                options={keyOptions}
                placeholder={t("request_logs.all_keys_placeholder")}
                searchPlaceholder={t("request_logs.search_keys")}
                aria-label={t("request_logs.filter_key")}
                className="w-full sm:w-auto"
              />
              <SearchableSelect
                value={modelQuery}
                onChange={setModelQuery}
                options={modelOptions}
                placeholder={t("request_logs.all_models_placeholder")}
                searchPlaceholder={t("request_logs.search_models")}
                aria-label={t("request_logs.filter_model")}
                className="w-full sm:w-auto"
              />
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
                options={[
                  { value: "", label: t("request_logs.all_status") },
                  { value: "success", label: t("request_logs.status_success") },
                  { value: "failed", label: t("request_logs.status_failed") },
                ]}
                aria-label={t("request_logs.filter_status")}
                name="statusFilter"
                className="w-full sm:w-auto"
              />
            </div>

            <div className="hidden sm:block sm:flex-1" />

            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-white/55 sm:flex sm:items-center sm:gap-1.5">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Filter size={12} aria-hidden="true" />
                {t("request_logs.records_count", { count: stats.total.toLocaleString() } as Record<
                  string,
                  string
                >)}
              </span>

              <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap sm:justify-start">
                {t("common.success_rate")}
                <span className="font-mono tabular-nums">{stats.success_rate.toFixed(1)}%</span>
              </span>

              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {t("request_logs.col_total_token")}
                <span className="font-mono tabular-nums">
                  {stats.total_tokens.toLocaleString()}
                </span>
              </span>

              <span className="col-span-2 text-[11px] text-slate-400 dark:text-white/40 sm:col-span-1 sm:text-xs">
                {lastUpdatedText}
              </span>
            </div>
          </div>
        </div>

        {/* 表格区域 — 自适应视口高度，内部滚动 */}
        <div className="relative min-h-[360px] h-[calc(100dvh-300px)] overflow-hidden px-5">
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[1320px] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{t("request_logs.table_caption")}</caption>

              {/* 表头 */}
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                  {logColumns.map((col, i) => {
                    const isFirst = i === 0;
                    const isLast = i === logColumns.length - 1;
                    const roundCls = [
                      isFirst ? "first:rounded-l-xl" : "",
                      isLast ? "last:rounded-r-xl" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <th
                        key={col.key}
                        className={`whitespace-nowrap bg-slate-100 px-4 py-3 dark:bg-neutral-800 ${col.width ?? ""} ${col.headerClassName ?? ""} ${roundCls}`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* 表体 */}
              <tbody className="text-slate-900 dark:text-white">
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="px-4 py-12 text-center text-sm text-slate-600 dark:text-white/70"
                    >
                      {t("request_logs.no_data")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      style={{ height: 44 }}
                    >
                      {logColumns.map((col, colIdx) => {
                        const isFirst = colIdx === 0;
                        const isLast = colIdx === logColumns.length - 1;
                        const roundCls = [
                          isFirst ? "first:rounded-l-lg" : "",
                          isLast ? "last:rounded-r-lg" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-2.5 align-middle ${col.cellClassName ?? ""} ${roundCls}`}
                          >
                            {col.render(row, idx)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Loading overlay */}
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
                <span
                  className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80"
                  aria-hidden="true"
                />
                <span role="status">{t("common.loading_ellipsis")}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* 分页控件 — flex-shrink-0 固定在底部 */}
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <LogContentModal
        open={contentModalOpen}
        logId={contentModalLogId}
        initialTab={contentModalTab}
        onClose={() => setContentModalOpen(false)}
      />
      <ErrorDetailModal
        open={errorModalOpen}
        logId={errorModalLogId}
        model={errorModalModel}
        onClose={() => setErrorModalOpen(false)}
      />
    </section>
  );
}
