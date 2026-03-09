import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Filter, RefreshCw, ScrollText, Search } from "lucide-react";
import { providersApi, usageApi } from "@/lib/http/apis";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import type { UsageData } from "@/lib/http/types";
import { TextInput } from "@/modules/ui/Input";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { OverflowTooltip } from "@/modules/ui/Tooltip";

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

const ROW_HEIGHT_PX = 40;
const OVERSCAN_ROWS = 12;

const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;

const createEmptyUsage = (): UsageData => ({ apis: {} });

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

const readLatencyText = (detail: unknown): string => {
  if (!detail || typeof detail !== "object") return "--";
  const record = detail as Record<string, unknown>;
  const candidates = [
    record["latency_ms"],
    record["latencyMs"],
    record["duration_ms"],
    record["durationMs"],
    record["elapsed_ms"],
    record["elapsedMs"],
    record["cost_ms"],
    record["costMs"],
    record["time_ms"],
    record["timeMs"],
    record["latency"],
    record["duration"],
    record["elapsed"],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number") {
      return formatLatencyMs(candidate);
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "--";
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

const Card = ({
  title,
  description,
  actions,
  loading = false,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) => {
  return (
    <section
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {description ? (
            <p className="text-xs text-slate-600 dark:text-white/65">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="relative mt-4 min-w-0">
        {children}
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
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
    </section>
  );
};

function VirtualRequestLogTable({ rows, loading }: { rows: readonly LogRow[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = el.scrollTop;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(next);
    });
  }, []);

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
              <th className="w-52 bg-slate-100/80 px-4 py-3 first:rounded-l-xl dark:bg-neutral-800/50">时间</th>
              <th className="w-32 bg-slate-100/80 px-4 py-3 dark:bg-neutral-800/50">Key 名称</th>
              <th className="w-56 bg-slate-100/80 px-4 py-3 dark:bg-neutral-800/50">模型</th>
              <th className="w-32 bg-slate-100/80 px-4 py-3 dark:bg-neutral-800/50">渠道名</th>
              <th className="w-20 bg-slate-100/80 px-4 py-3 dark:bg-neutral-800/50">状态</th>
              <th className="w-24 bg-slate-100/80 px-4 py-3 text-right dark:bg-neutral-800/50">
                用时
              </th>
              <th className="w-24 bg-slate-100/80 px-4 py-3 text-right dark:bg-neutral-800/50">
                输入
              </th>
              <th className="w-24 bg-slate-100/80 px-4 py-3 text-right dark:bg-neutral-800/50">
                缓存读取
              </th>
              <th className="w-24 bg-slate-100/80 px-4 py-3 text-right dark:bg-neutral-800/50">
                输出
              </th>
              <th className="w-28 bg-slate-100/80 px-4 py-3 text-right last:rounded-r-xl dark:bg-neutral-800/50">
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
      </div>
    </div>
  );
}

export function RequestLogsPage() {
  const { notify } = useToast();

  const [usage, setUsage] = useState<UsageData>(() => createEmptyUsage());
  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [keyEntries, setKeyEntries] = useState<ApiKeyEntry[]>([]);
  const [providerNameMap, setProviderNameMap] = useState<Map<string, string>>(new Map());

  const [timeRange, setTimeRange] = useState<TimeRange>(7);

  const [apiQuery, setApiQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const deferredApiQuery = useDeferredValue(apiQuery.trim());
  const deferredModelQuery = useDeferredValue(modelQuery.trim());

  const fetchInFlightRef = useRef(false);

  const fetchUsage = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setLoading(true);
    try {
      const [next, rawEntries, legacyKeys, gemini, claude, codex, vertex] = await Promise.all([
        usageApi.getUsage(),
        apiKeyEntriesApi.list().catch(() => [] as ApiKeyEntry[]),
        apiKeysApi.list().catch(() => [] as string[]),
        providersApi.getGeminiKeys().catch(() => []),
        providersApi.getClaudeConfigs().catch(() => []),
        providersApi.getCodexConfigs().catch(() => []),
        providersApi.getVertexConfigs().catch(() => []),
      ]);

      // Build apiKey → channel name map from all provider configs
      const channelMap = new Map<string, string>();
      for (const cfg of [...gemini, ...claude, ...codex, ...vertex]) {
        if (cfg.apiKey && cfg.name) channelMap.set(cfg.apiKey, cfg.name);
      }
      setProviderNameMap(channelMap);

      // Auto-migrate: old api-keys not in api-key-entries get merged
      let entries = rawEntries;
      const entryKeySet = new Set(rawEntries.map((e) => e.key));
      const newEntries = legacyKeys
        .filter((k) => k && !entryKeySet.has(k))
        .map((k): ApiKeyEntry => ({ key: k, "created-at": new Date().toISOString() }));
      if (newEntries.length > 0) {
        entries = [...rawEntries, ...newEntries];
        // Save merged entries back (fire-and-forget)
        apiKeyEntriesApi.replace(entries).catch(() => { });
      }

      setUsage(next);
      setKeyEntries(entries);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "请求日志刷新失败";
      notify({ type: "error", message });
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const keyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    keyEntries.forEach((e) => {
      if (e.name) map.set(e.key, e.name);
    });
    return map;
  }, [keyEntries]);

  const rows = useMemo<LogRow[]>(() => {
    const now = new Date();
    const cutoffStart = new Date(now.getTime() - timeRange * 24 * 60 * 60 * 1000);
    cutoffStart.setHours(0, 0, 0, 0);
    const cutoffMs = cutoffStart.getTime();

    const entries: LogRow[] = [];
    let idCounter = 0;

    Object.entries(usage.apis ?? {}).forEach(([apiKey, apiData]) => {
      Object.entries(apiData.models ?? {}).forEach(([model, modelData]) => {
        modelData.details.forEach((detail) => {
          const timestampMs = detail.timestamp ? new Date(detail.timestamp).getTime() : 0;
          if (!timestampMs) return;
          if (timestampMs < cutoffMs) return;

          const tokens = detail.tokens;
          const inputTokens = tokens?.input_tokens ?? 0;
          const outputTokens = tokens?.output_tokens ?? 0;
          const reasoningTokens = tokens?.reasoning_tokens ?? 0;
          const cachedTokens = tokens?.cached_tokens ?? 0;
          const totalTokens =
            tokens?.total_tokens ?? inputTokens + outputTokens + reasoningTokens + cachedTokens;

          entries.push({
            id: `${idCounter++}`,
            timestamp: detail.timestamp,
            timestampMs,
            apiKey,
            apiKeyName: keyNameMap.get(apiKey) || "",
            channelName: String((detail as any).channel_name ?? "") || providerNameMap.get(String((detail as any).source ?? "")) || "",
            maskedApiKey: maskApiKey(apiKey),
            model,
            failed: Boolean(detail.failed),
            latencyText: readLatencyText(detail),
            inputTokens,
            cachedTokens,
            outputTokens,
            totalTokens,
          });
        });
      });
    });

    return entries.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [timeRange, usage.apis, keyNameMap, providerNameMap]);

  const filteredRows = useMemo(() => {
    const apiNeedle = deferredApiQuery.toLowerCase();
    const modelNeedle = deferredModelQuery.toLowerCase();

    return rows.filter((row) => {
      if (apiNeedle && !row.apiKey.toLowerCase().includes(apiNeedle)) return false;
      if (modelNeedle && !row.model.toLowerCase().includes(modelNeedle)) return false;
      if (statusFilter === "success" && row.failed) return false;
      if (statusFilter === "failed" && !row.failed) return false;
      return true;
    });
  }, [deferredApiQuery, deferredModelQuery, rows, statusFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const success = filteredRows.reduce((acc, row) => acc + (row.failed ? 0 : 1), 0);
    const successRate = total ? ((success / total) * 100).toFixed(1) : "0.0";
    const totalTokens = filteredRows.reduce((acc, row) => acc + row.totalTokens, 0);
    return { total, successRate, totalTokens };
  }, [filteredRows]);

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
              onClick={fetchUsage}
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
          <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition focus-within:ring-2 focus-within:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950/60 dark:focus-within:ring-white/15">
            <Search size={14} className="text-slate-500 dark:text-white/55" aria-hidden="true" />
            <TextInput
              value={apiQuery}
              onChange={(event) => setApiQuery(event.target.value)}
              variant="ghost"
              className="w-32"
              placeholder="API key…"
              aria-label="按 API key 过滤"
              name="apiKeyFilter"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition focus-within:ring-2 focus-within:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950/60 dark:focus-within:ring-white/15">
            <Search size={14} className="text-slate-500 dark:text-white/55" aria-hidden="true" />
            <TextInput
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              variant="ghost"
              className="w-32"
              placeholder="模型…"
              aria-label="按模型过滤"
              name="modelFilter"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-[34px] rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10 dark:focus-visible:ring-white/15"
            aria-label="按状态过滤"
            name="statusFilter"
          >
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>

          {/* 分隔弹性空间 */}
          <div className="flex-1" />

          {/* 统计摘要 */}
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/55">
            <Filter size={12} aria-hidden="true" />
            <span className="font-mono tabular-nums">{summary.total.toLocaleString()}</span> 条
            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
            成功率 <span className="font-mono tabular-nums">{summary.successRate}%</span>
            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
            Token <span className="font-mono tabular-nums">{summary.totalTokens.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
            <span className="text-slate-400 dark:text-white/40">{lastUpdatedText}</span>
          </span>
        </div>

        {/* 表格 */}
        <div className="relative px-5 pb-5">
          <VirtualRequestLogTable rows={filteredRows} loading={loading} />
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
