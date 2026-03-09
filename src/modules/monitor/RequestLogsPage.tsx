import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Filter, RefreshCw, ScrollText } from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageLogItem, UsageLogsResponse } from "@/lib/http/apis/usage";
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
  hasContent: boolean;
}

const PAGE_SIZE = 50;

const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;

const maskApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  return date.toLocaleString();
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
  return (
    <Tabs value={String(value)} onValueChange={(next) => onChange(Number(next) as TimeRange)}>
      <TabsList>
        {TIME_RANGES.map((range) => {
          const label = range === 1 ? "今天" : `${range} 天`;
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

import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";

function buildLogColumns(
  onContentClick?: (logId: number, tab: "input" | "output") => void,
  onErrorClick?: (logId: number, model: string) => void,
): VirtualTableColumn<LogRow>[] {
  return [
    {
      key: "timestamp",
      label: "时间",
      width: "w-52",
      cellClassName:
        "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={formatTimestamp(row.timestamp)} className="block min-w-0">
          <span className="block min-w-0 truncate">{formatTimestamp(row.timestamp)}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "apiKeyName",
      label: "Key 名称",
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
      label: "模型",
      width: "w-56",
      render: (row) => (
        <OverflowTooltip content={row.model} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.model}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "channelName",
      label: "渠道名",
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
      label: "状态",
      width: "w-20",
      render: (row) =>
        row.failed ? (
          <button
            type="button"
            onClick={() => onErrorClick?.(Number(row.id), row.model)}
            className="inline-flex min-w-[52px] cursor-pointer justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 hover:shadow-sm dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
            title="点击查看错误详情"
          >
            失败
          </button>
        ) : (
          <span className="inline-flex min-w-[52px] justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            成功
          </span>
        ),
    },
    {
      key: "latency",
      label: "用时",
      width: "w-24",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={row.latencyText} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.latencyText}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "inputTokens",
      label: "输入",
      width: "w-24",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "input")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-sky-50 dark:hover:bg-sky-950/30"
            title="点击查看输入内容"
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
      label: "缓存读取",
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
      label: "输出",
      width: "w-24",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "output")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            title="点击查看输出内容"
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
      label: "总 Token",
      width: "w-28",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
      render: (row) => (
        <OverflowTooltip content={row.totalTokens.toLocaleString()} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.totalTokens.toLocaleString()}</span>
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
    timestampMs: new Date(item.timestamp).getTime(),
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
    hasContent: item.has_content ?? false,
  };
}

export function RequestLogsPage() {
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
  const logColumns = useMemo(() => buildLogColumns(handleContentClick, handleErrorClick), [handleContentClick, handleErrorClick]);

  // Accumulated raw items from all loaded pages (name resolution done by backend)
  const [rawItems, setRawItems] = useState<UsageLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Backend-provided metadata
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
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

  // Fetch logs from backend (page 1 = reset, page > 1 = append)
  const fetchLogs = useCallback(
    async (page: number) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;

      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const resp: UsageLogsResponse = await usageApi.getUsageLogs({
          page,
          size: PAGE_SIZE,
          days: timeRange,
          api_key: apiQuery || undefined,
          model: modelQuery || undefined,
          status: statusFilter || undefined,
        });

        const newItems = resp.items ?? [];

        if (page === 1) {
          setRawItems(newItems);
        } else {
          setRawItems((prev) => [...prev, ...newItems]);
        }

        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        setFilterOptions(resp.filters ?? { api_keys: [], api_key_names: {}, models: [] });
        setStats(resp.stats ?? { total: 0, success_rate: 0, total_tokens: 0 });
        setLastUpdatedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : "请求日志刷新失败";
        notify({ type: "error", message });
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [timeRange, apiQuery, modelQuery, statusFilter, notify],
  );

  // Derive display rows from raw items (names already resolved by backend)
  const rows = useMemo<LogRow[]>(
    () => rawItems.map((item) => toLogRow(item)),
    [rawItems],
  );

  const hasMore = rawItems.length < totalCount;

  const loadNextPage = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      fetchLogs(currentPage + 1);
    }
  }, [hasMore, loadingMore, loading, fetchLogs, currentPage]);

  // Fetch page 1 when filters change (single API call, no other fetches needed)
  useEffect(() => {
    fetchLogs(1);
  }, [timeRange, apiQuery, modelQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build options from backend filter data (names provided by backend)
  const keyOptions = useMemo(() => {
    const names = filterOptions.api_key_names ?? {};
    return [
      { value: "", label: "全部 Key" },
      ...filterOptions.api_keys.map((key) => ({
        value: key,
        label: names[key] || maskApiKey(key),
        searchText: `${names[key] || ""} ${key}`,
      })),
    ];
  }, [filterOptions.api_keys, filterOptions.api_key_names]);

  const modelOptions = useMemo(() => {
    return [
      { value: "", label: "全部模型" },
      ...filterOptions.models.map((m) => ({ value: m, label: m })),
    ];
  }, [filterOptions.models]);

  const lastUpdatedText = useMemo(() => {
    if (loading) return "刷新中…";
    if (!lastUpdatedAt) return "尚未刷新";
    return `更新于 ${new Date(lastUpdatedAt).toLocaleTimeString()}`;
  }, [lastUpdatedAt, loading]);

  return (
    <section className="flex flex-1 flex-col">
      <h1 className="sr-only">请求日志</h1>

      {/* 单层卡片：标题 + 筛选 + 统计 + 表格 */}
      <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
        {/* 标题栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <ScrollText size={18} className="text-slate-900 dark:text-white" aria-hidden="true" />
            请求日志
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <button
              type="button"
              onClick={() => fetchLogs(1)}
              disabled={loading}
              aria-busy={loading}
              aria-label="刷新"
              title="刷新"
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

        {/* 筛选 + 统计（内联一行） */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 dark:border-neutral-800/60">
          <SearchableSelect
            value={apiQuery}
            onChange={setApiQuery}
            options={keyOptions}
            placeholder="全部 Key"
            searchPlaceholder="搜索 Key…"
            aria-label="按 Key 名称过滤"
          />
          <SearchableSelect
            value={modelQuery}
            onChange={setModelQuery}
            options={modelOptions}
            placeholder="全部模型"
            searchPlaceholder="搜索模型…"
            aria-label="按模型过滤"
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: "", label: "全部状态" },
              { value: "success", label: "成功" },
              { value: "failed", label: "失败" },
            ]}
            aria-label="按状态过滤"
            name="statusFilter"
          />

          {/* 分隔弹性空间 */}
          <div className="flex-1" />

          {/* 统计摘要 */}
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/55">
            <Filter size={12} aria-hidden="true" />
            <span className="font-mono tabular-nums">{stats.total.toLocaleString()}</span> 条
            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
            成功率 <span className="font-mono tabular-nums">{stats.success_rate.toFixed(1)}%</span>
            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
            Token <span className="font-mono tabular-nums">{stats.total_tokens.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
            <span className="text-slate-400 dark:text-white/40">{lastUpdatedText}</span>
          </span>
        </div>

        {/* 表格 */}
        <div className="relative px-5 pb-5">
          <VirtualTable<LogRow>
            rows={rows}
            columns={logColumns}
            rowKey={(row) => row.id}
            loading={loading}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onScrollBottom={loadNextPage}
            rowHeight={44}
            caption="请求日志表格"
            emptyText="暂无数据"
          />
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
                <span
                  className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80"
                  aria-hidden="true"
                />
                <span role="status">加载中…</span>
              </div>
            </div>
          ) : null}
        </div>
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
