import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Filter, RefreshCw, ScrollText } from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageLogItem, UsageLogsResponse } from "@/lib/http/apis/usage";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import { Select } from "@/modules/ui/Select";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";

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
}

const PAGE_SIZE = 50;
const ROW_HEIGHT_PX = 40;
const OVERSCAN_ROWS = 12;
const SCROLL_BOTTOM_THRESHOLD = 100;

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

function VirtualRequestLogTable({
  rows,
  loading,
  hasMore,
  loadingMore,
  onScrollBottom,
}: {
  rows: readonly LogRow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onScrollBottom: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = el.scrollTop;

    // Check if scrolled near bottom for infinite scroll
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < SCROLL_BOTTOM_THRESHOLD && hasMore && !loadingMore) {
      onScrollBottom();
    }

    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(next);
    });
  }, [hasMore, loadingMore, onScrollBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateViewportHeight = () => {
      setViewportHeight(el.clientHeight || 480);
    };

    updateViewportHeight();

    window.addEventListener("resize", updateViewportHeight);
    return () => {
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    const total = rows.length;
    if (!total) {
      return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }

    const visibleStart = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT_PX));
    const visibleEnd = visibleStart + visibleCount;

    const start = Math.max(0, visibleStart - OVERSCAN_ROWS);
    const end = Math.min(total, visibleEnd + OVERSCAN_ROWS);

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: start * ROW_HEIGHT_PX,
      bottomSpacerHeight: (total - end) * ROW_HEIGHT_PX,
    };
  }, [rows.length, scrollTop, viewportHeight]);

  const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

  return (
    <div className="min-w-0 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-[calc(100vh-260px)] min-h-[360px] overflow-auto"
      >
        <table className="w-full min-w-[1320px] table-fixed border-separate border-spacing-0 text-sm">
          <caption className="sr-only">请求日志表格</caption>
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
              <th className="w-52 bg-slate-100 px-4 py-3 first:rounded-l-xl dark:bg-neutral-800">时间</th>
              <th className="w-32 bg-slate-100 px-4 py-3 dark:bg-neutral-800">Key 名称</th>
              <th className="w-56 bg-slate-100 px-4 py-3 dark:bg-neutral-800">模型</th>
              <th className="w-32 bg-slate-100 px-4 py-3 dark:bg-neutral-800">渠道名</th>
              <th className="w-20 bg-slate-100 px-4 py-3 dark:bg-neutral-800">状态</th>
              <th className="w-24 bg-slate-100 px-4 py-3 text-right dark:bg-neutral-800">
                用时
              </th>
              <th className="w-24 bg-slate-100 px-4 py-3 text-right dark:bg-neutral-800">
                输入
              </th>
              <th className="w-24 bg-slate-100 px-4 py-3 text-right dark:bg-neutral-800">
                缓存读取
              </th>
              <th className="w-24 bg-slate-100 px-4 py-3 text-right dark:bg-neutral-800">
                输出
              </th>
              <th className="w-28 bg-slate-100 px-4 py-3 text-right last:rounded-r-xl dark:bg-neutral-800">
                总 Token
              </th>
            </tr>
          </thead>
          <tbody className="text-slate-900 dark:text-white">
            {!loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-12 text-center text-sm text-slate-600 dark:text-white/70"
                >
                  暂无数据
                </td>
              </tr>
            ) : (
              <>
                <tr aria-hidden="true">
                  <td colSpan={10} height={topSpacerHeight} className="p-0" />
                </tr>
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="h-11 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-4 py-2.5 align-middle font-mono text-xs tabular-nums text-slate-700 first:rounded-l-lg dark:text-slate-200">
                      <OverflowTooltip
                        content={formatTimestamp(row.timestamp)}
                        className="block min-w-0"
                      >
                        <span className="block min-w-0 truncate">
                          {formatTimestamp(row.timestamp)}
                        </span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <OverflowTooltip content={row.apiKeyName || "--"} className="block min-w-0">
                        <span className={`block min-w-0 truncate text-xs font-medium ${row.apiKeyName ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-white/30"}`}>
                          {row.apiKeyName || "--"}
                        </span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <OverflowTooltip content={row.model} className="block min-w-0">
                        <span className="block min-w-0 truncate">{row.model}</span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <OverflowTooltip content={row.channelName || "--"} className="block min-w-0">
                        <span className={`block min-w-0 truncate text-xs font-medium ${row.channelName ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-white/30"}`}>
                          {row.channelName || "--"}
                        </span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      {row.failed ? (
                        <span className="inline-flex min-w-[52px] justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                          失败
                        </span>
                      ) : (
                        <span className="inline-flex min-w-[52px] justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                          成功
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right align-middle font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
                      <OverflowTooltip content={row.latencyText} className="block min-w-0">
                        <span className="block min-w-0 truncate">{row.latencyText}</span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 text-right align-middle font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
                      <OverflowTooltip
                        content={row.inputTokens.toLocaleString()}
                        className="block min-w-0"
                      >
                        <span className="block min-w-0 truncate">
                          {row.inputTokens.toLocaleString()}
                        </span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 text-right align-middle font-mono text-xs tabular-nums">
                      <OverflowTooltip
                        content={row.cachedTokens.toLocaleString()}
                        className="block min-w-0"
                      >
                        <span className={`block min-w-0 truncate ${row.cachedTokens > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-white/30"}`}>
                          {row.cachedTokens > 0 ? row.cachedTokens.toLocaleString() : "0"}
                        </span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 text-right align-middle font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
                      <OverflowTooltip
                        content={row.outputTokens.toLocaleString()}
                        className="block min-w-0"
                      >
                        <span className="block min-w-0 truncate">
                          {row.outputTokens.toLocaleString()}
                        </span>
                      </OverflowTooltip>
                    </td>
                    <td className="px-4 py-2.5 text-right align-middle font-mono text-xs tabular-nums text-slate-900 last:rounded-r-lg dark:text-white">
                      <OverflowTooltip
                        content={row.totalTokens.toLocaleString()}
                        className="block min-w-0"
                      >
                        <span className="block min-w-0 truncate">
                          {row.totalTokens.toLocaleString()}
                        </span>
                      </OverflowTooltip>
                    </td>
                  </tr>
                ))}
                <tr aria-hidden="true">
                  <td colSpan={10} height={bottomSpacerHeight} className="p-0" />
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* Infinite scroll loading indicator */}
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-white/55">
              <span
                className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80"
                aria-hidden="true"
              />
              加载更多…
            </div>
          </div>
        )}

        {/* No more data indicator */}
        {!hasMore && rows.length > 0 && !loading && (
          <div className="py-3 text-center text-xs text-slate-400 dark:text-white/30">
            已加载全部 {rows.length.toLocaleString()} 条数据
          </div>
        )}
      </div>
    </div>
  );
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
  };
}

export function RequestLogsPage() {
  const { notify } = useToast();

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
          <VirtualRequestLogTable
            rows={rows}
            loading={loading}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onScrollBottom={loadNextPage}
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
    </section>
  );
}
