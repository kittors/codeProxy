import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    ChartSpline,
    Coins,
    Filter,
    Key,
    RefreshCw,
    Search,
    ShieldCheck,
    Sigma,
} from "lucide-react";
import { useTheme } from "@/modules/ui/ThemeProvider";
import { ThemeToggleButton } from "@/modules/ui/ThemeProvider";
import { AnimatedNumber } from "@/modules/ui/AnimatedNumber";
import { Reveal } from "@/modules/ui/Reveal";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import type { TimeRange } from "@/modules/monitor/monitor-constants";
import {
    formatNumber,
    formatRate,
} from "@/modules/monitor/monitor-utils";
import {
    KpiCard,
    TimeRangeSelector,
} from "@/modules/monitor/MonitorPagePieces";
import { MANAGEMENT_API_PREFIX } from "@/lib/constants";
import { detectApiBaseFromLocation } from "@/lib/connection";

// ── Types ───────────────────────────────────────────────────────────────────

interface PublicLogItem {
    id: number;
    timestamp: string;
    model: string;
    failed: boolean;
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    total_tokens: number;
    has_content: boolean;
}

interface PublicLogsResponse {
    items: PublicLogItem[];
    total: number;
    page: number;
    size: number;
    stats: {
        total: number;
        success_rate: number;
        total_tokens: number;
    };
    filters: {
        models: string[];
    };
}

interface LogRow {
    id: string;
    timestamp: string;
    timestampMs: number;
    model: string;
    failed: boolean;
    latencyText: string;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// ── API ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

async function fetchPublicLogs(params: {
    apiKey: string;
    page?: number;
    size?: number;
    days?: number;
    model?: string;
    status?: string;
}): Promise<PublicLogsResponse> {
    const base = detectApiBaseFromLocation();
    const qs = new URLSearchParams();
    qs.set("api_key", params.apiKey);
    if (params.page) qs.set("page", String(params.page));
    if (params.size) qs.set("size", String(params.size));
    if (params.days) qs.set("days", String(params.days));
    if (params.model) qs.set("model", params.model);
    if (params.status) qs.set("status", params.status);
    const url = `${base}${MANAGEMENT_API_PREFIX}/public/usage/logs?${qs}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `请求失败 (${resp.status})`);
    }
    return resp.json() as Promise<PublicLogsResponse>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function toLogRow(item: PublicLogItem): LogRow {
    return {
        id: String(item.id),
        timestamp: item.timestamp,
        timestampMs: new Date(item.timestamp).getTime(),
        model: item.model,
        failed: item.failed,
        latencyText: formatLatencyMs(item.latency_ms),
        inputTokens: item.input_tokens,
        cachedTokens: item.cached_tokens,
        outputTokens: item.output_tokens,
        totalTokens: item.total_tokens,
    };
}

// ── Columns ─────────────────────────────────────────────────────────────────

const logColumns: VirtualTableColumn<LogRow>[] = [
    {
        key: "timestamp",
        label: "时间",
        width: "w-52",
        cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (row) => (
            <OverflowTooltip content={formatTimestamp(row.timestamp)} className="block min-w-0">
                <span className="block min-w-0 truncate">{formatTimestamp(row.timestamp)}</span>
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
        key: "status",
        label: "状态",
        width: "w-20",
        render: (row) =>
            row.failed ? (
                <span className="inline-flex min-w-[52px] justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                    失败
                </span>
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
        cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
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
        cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (row) => <span>{row.inputTokens.toLocaleString()}</span>,
    },
    {
        key: "cachedTokens",
        label: "缓存读取",
        width: "w-24",
        headerClassName: "text-right",
        cellClassName: "text-right font-mono text-xs tabular-nums",
        render: (row) => (
            <span
                className={`block min-w-0 truncate ${row.cachedTokens > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-white/30"}`}
            >
                {row.cachedTokens > 0 ? row.cachedTokens.toLocaleString() : "0"}
            </span>
        ),
    },
    {
        key: "outputTokens",
        label: "输出",
        width: "w-24",
        headerClassName: "text-right",
        cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (row) => <span>{row.outputTokens.toLocaleString()}</span>,
    },
    {
        key: "totalTokens",
        label: "总 Token",
        width: "w-28",
        headerClassName: "text-right",
        cellClassName: "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
        render: (row) => <span>{row.totalTokens.toLocaleString()}</span>,
    },
];

// ── Page Component ──────────────────────────────────────────────────────────

export function ApiKeyLookupPage() {
    const {
        state: { mode },
    } = useTheme();

    const [apiKeyInput, setApiKeyInput] = useState("");
    const [queriedKey, setQueriedKey] = useState("");

    // Pagination state
    const [rawItems, setRawItems] = useState<PublicLogItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

    // Filters
    const [timeRange, setTimeRange] = useState<TimeRange>(7);
    const [modelQuery, setModelQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    // Backend stats + filter options
    const [stats, setStats] = useState<{ total: number; success_rate: number; total_tokens: number }>(
        { total: 0, success_rate: 0, total_tokens: 0 },
    );
    const [modelOptions, setModelOptions] = useState<string[]>([]);

    const fetchInFlightRef = useRef(false);

    const fetchLogs = useCallback(
        async (key: string, page: number) => {
            if (!key.trim() || fetchInFlightRef.current) return;
            fetchInFlightRef.current = true;

            if (page === 1) {
                setLoading(true);
            } else {
                setLoadingMore(true);
            }
            setError(null);

            try {
                const resp = await fetchPublicLogs({
                    apiKey: key.trim(),
                    page,
                    size: PAGE_SIZE,
                    days: timeRange,
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
                setStats(resp.stats ?? { total: 0, success_rate: 0, total_tokens: 0 });
                setModelOptions(resp.filters?.models ?? []);
                setLastUpdatedAt(Date.now());
                setQueriedKey(key.trim());
            } catch (err) {
                const message = err instanceof Error ? err.message : "查询失败";
                setError(message);
                if (page === 1) {
                    setRawItems([]);
                    setTotalCount(0);
                    setStats({ total: 0, success_rate: 0, total_tokens: 0 });
                }
            } finally {
                fetchInFlightRef.current = false;
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [timeRange, modelQuery, statusFilter],
    );

    // Derive display rows
    const rows = useMemo<LogRow[]>(
        () => rawItems.map((item) => toLogRow(item)),
        [rawItems],
    );

    const hasMore = rawItems.length < totalCount;

    const loadNextPage = useCallback(() => {
        if (hasMore && !loadingMore && !loading && queriedKey) {
            fetchLogs(queriedKey, currentPage + 1);
        }
    }, [hasMore, loadingMore, loading, fetchLogs, currentPage, queriedKey]);

    // Refetch page 1 when filters change (only if we have a queried key)
    useEffect(() => {
        if (queriedKey) {
            fetchLogs(queriedKey, 1);
        }
    }, [timeRange, modelQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = useCallback(
        (event?: React.FormEvent) => {
            event?.preventDefault();
            const val = apiKeyInput.trim();
            try {
                const url = new URL(window.location.href);
                if (val) {
                    url.searchParams.set("api_key", val);
                } else {
                    url.searchParams.delete("api_key");
                }
                window.history.replaceState({}, "", url.toString());
            } catch {
                // ignore
            }
            if (val) {
                setModelQuery("");
                setStatusFilter("");
                fetchLogs(val, 1);
            }
        },
        [apiKeyInput, fetchLogs],
    );

    const handleRefresh = useCallback(() => {
        if (queriedKey) fetchLogs(queriedKey, 1);
    }, [queriedKey, fetchLogs]);

    // Read api_key from URL on mount
    useEffect(() => {
        const searchStr = window.location.search || window.location.hash.split("?")[1] || "";
        const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr : `?${searchStr}`);
        const key = params.get("api_key") ?? params.get("key") ?? "";
        if (key) {
            setApiKeyInput(key);
            fetchLogs(key, 1);
        }
    }, [fetchLogs]);

    const maskedKey = queriedKey
        ? queriedKey.length > 12
            ? `${queriedKey.slice(0, 6)}****${queriedKey.slice(-4)}`
            : "****"
        : "";

    const busy = loading;

    const modelSelectOptions = useMemo(() => {
        return [
            { value: "", label: "全部模型" },
            ...modelOptions.map((m) => ({ value: m, label: m })),
        ];
    }, [modelOptions]);

    const lastUpdatedText = useMemo(() => {
        if (loading) return "刷新中…";
        if (!lastUpdatedAt) return "尚未刷新";
        return `更新于 ${new Date(lastUpdatedAt).toLocaleTimeString()}`;
    }, [lastUpdatedAt, loading]);

    const hasData = queriedKey && stats.total > 0;

    return (
        <div className="relative min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
            {/* 顶部导航 */}
            <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/70">
                <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-white">
                            <Key size={16} className="text-white dark:text-neutral-950" />
                        </div>
                        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                            API Key 使用查询
                        </span>
                    </div>
                    <ThemeToggleButton className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10" />
                </div>
            </header>

            <main className="mx-auto max-w-screen-xl space-y-5 px-4 py-6 sm:px-6">
                {/* 搜索区域 */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-white/80">
                                输入您的 API Key
                            </label>
                            <div className="relative">
                                <Key
                                    size={16}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40"
                                />
                                <input
                                    type="password"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="请输入 API Key 查询使用详情…"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-white/40 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={busy || !apiKeyInput.trim()}
                            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:bg-slate-400/70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:disabled:bg-white/50"
                        >
                            <Search size={16} />
                            {busy ? "查询中…" : "查询"}
                        </button>
                    </form>

                    {error && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    {queriedKey && !error && stats.total === 0 && !loading && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
                            该时间范围内未找到此 API Key 的使用记录。
                        </div>
                    )}
                </section>

                {/* 查询结果区域 */}
                {queriedKey && (
                    <>
                        {/* 顶栏：Key信息 + 时间选择 + 刷新 */}
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-white">
                                        <Key size={18} className="text-white dark:text-neutral-950" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-white/55">
                                            当前查询 Key
                                            <span className="ml-2 text-xs font-normal text-slate-400 dark:text-white/40">
                                                · 请求日志 共 {stats.total.toLocaleString()} 条
                                            </span>
                                        </p>
                                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                            {maskedKey}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
                                    <button
                                        type="button"
                                        onClick={handleRefresh}
                                        disabled={busy}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
                                    >
                                        <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                                        刷新
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* KPI 卡片 */}
                        <Reveal>
                            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <KpiCard
                                    title="总请求"
                                    value={<AnimatedNumber value={stats.total} format={formatNumber} />}
                                    hint="已按时间范围过滤"
                                    icon={Activity}
                                />
                                <KpiCard
                                    title="成功率"
                                    value={<AnimatedNumber value={stats.success_rate} format={formatRate} />}
                                    hint={`成功率 ${stats.success_rate.toFixed(1)}%`}
                                    icon={ShieldCheck}
                                />
                                <KpiCard
                                    title="总 Token"
                                    value={<AnimatedNumber value={stats.total_tokens} format={formatNumber} />}
                                    hint="所有请求的总 Token 用量"
                                    icon={Sigma}
                                />
                                <KpiCard
                                    title="请求日志"
                                    value={<AnimatedNumber value={rawItems.length} format={formatNumber} />}
                                    hint={`已加载 ${rawItems.length} / ${totalCount} 条`}
                                    icon={Coins}
                                />
                            </section>
                        </Reveal>

                        {/* 请求日志表格 */}
                        <section className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                            {/* 筛选 + 统计 */}
                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-neutral-800/60">
                                <SearchableSelect
                                    value={modelQuery}
                                    onChange={setModelQuery}
                                    options={modelSelectOptions}
                                    placeholder="全部模型"
                                    searchPlaceholder="搜索模型…"
                                    aria-label="按模型过滤"
                                />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/80"
                                    aria-label="按状态过滤"
                                >
                                    <option value="">全部状态</option>
                                    <option value="success">成功</option>
                                    <option value="failed">失败</option>
                                </select>

                                <div className="flex-1" />

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
                                    height="h-[calc(100vh-500px)]"
                                    minWidth="min-w-[900px]"
                                    caption="请求日志表格"
                                    emptyText="该时间范围内暂无请求日志"
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
                        </section>
                    </>
                )}

                {/* 初始空状态 */}
                {!queriedKey && !error && (
                    <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-16 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/10">
                                <Search size={28} className="text-slate-600 dark:text-white/70" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                                查询您的 API Key 使用情况
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-white/65">
                                在上方输入框中输入您的 API Key，即可查看详细的使用统计和请求日志。
                            </p>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
