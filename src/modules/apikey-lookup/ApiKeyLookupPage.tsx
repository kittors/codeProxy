import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    CheckCircle,
    Coins,
    Key,
    Loader2,
    Search,
    XCircle,
} from "lucide-react";
import { useTheme } from "@/modules/ui/ThemeProvider";
import { ThemeToggleButton } from "@/modules/ui/ThemeProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/modules/ui/Tabs";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import { createModelDistributionOption } from "@/modules/monitor/chart-options/model-distribution";
import { createDailyTrendOption } from "@/modules/monitor/chart-options/daily-trend";
import { CHART_COLOR_CLASSES } from "@/modules/monitor/monitor-constants";
import { formatCompact } from "@/modules/monitor/monitor-format";
import type {
    ModelDistributionDatum,
    DailySeriesPoint,
} from "@/modules/monitor/chart-options/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LogEntry {
    id: number;
    timestamp: string;
    model: string;
    failed: boolean;
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    has_content: boolean;
}

interface LogsResponse {
    items: LogEntry[];
    total: number;
    page: number;
    size: number;
    stats: { total: number; success_rate: number; total_tokens: number };
    filters: { models: string[] };
}

interface ChartDataResponse {
    daily_series: Array<{
        date: string;
        requests: number;
        input_tokens: number;
        output_tokens: number;
    }>;
    model_distribution: Array<{
        model: string;
        requests: number;
        tokens: number;
    }>;
    stats: { total: number; success_rate: number; total_tokens: number };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const API_BASE =
    (typeof window !== "undefined" &&
        (window as unknown as Record<string, string>).__API_BASE__) ||
    "";

function formatLocalDateLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTimestamp(ts: string): string {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return ts;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function maskKey(key: string): string {
    if (!key) return "";
    return key.length > 12
        ? `${key.slice(0, 6)}****${key.slice(-4)}`
        : "****";
}

/* ------------------------------------------------------------------ */
/*  Time range options                                                 */
/* ------------------------------------------------------------------ */

const TIME_RANGES = [1, 7, 30] as const;
type TimeRange = (typeof TIME_RANGES)[number];

/* ------------------------------------------------------------------ */
/*  Status filter options                                              */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
    { value: "", label: "全部状态", searchText: "全部状态 all" },
    { value: "success", label: "成功", searchText: "成功 success" },
    { value: "failed", label: "失败", searchText: "失败 failed" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ApiKeyLookupPage() {
    const {
        state: { mode },
    } = useTheme();
    const isDark = mode === "dark";

    // --- core state ---
    const [apiKeyInput, setApiKeyInput] = useState("");
    const [queriedKey, setQueriedKey] = useState("");
    const [activeTab, setActiveTab] = useState<"usage" | "logs">("usage");
    const [timeRange, setTimeRange] = useState<TimeRange>(7);

    // --- chart data ---
    const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
    const [chartLoading, setChartLoading] = useState(false);
    const chartCacheRef = useRef<Record<string, ChartDataResponse>>({});

    // --- logs data ---
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsPage, setLogsPage] = useState(1);
    const [logsStats, setLogsStats] = useState<LogsResponse["stats"] | null>(null);
    const [logsModels, setLogsModels] = useState<string[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const logsCacheRef = useRef<Record<string, LogsResponse>>({});

    // --- filters ---
    const [modelFilter, setModelFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const logsPageSize = 50;

    // --- chart controls ---
    const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");
    const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
        "输入 Token": true,
        "输出 Token": true,
        "请求数": true,
    });

    // --- fetch guards ---
    const fetchInFlightRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    /* ================================================================ */
    /*  Data fetching                                                    */
    /* ================================================================ */

    const fetchChartData = useCallback(
        async (key: string, days: number) => {
            const cacheKey = `${key}|${days}`;
            if (chartCacheRef.current[cacheKey]) {
                setChartData(chartCacheRef.current[cacheKey]);
                return;
            }
            setChartLoading(true);
            try {
                const res = await fetch(
                    `${API_BASE}/v0/management/public/usage/chart-data?api_key=${encodeURIComponent(key)}&days=${days}`,
                );
                if (!res.ok) throw new Error("Chart data request failed");
                const data: ChartDataResponse = await res.json();
                chartCacheRef.current[cacheKey] = data;
                setChartData(data);
            } catch {
                setChartData(null);
            } finally {
                setChartLoading(false);
            }
        },
        [],
    );

    const fetchLogs = useCallback(
        async (key: string, days: number, page: number, model: string, status: string) => {
            const cacheKey = `${key}|${days}|${page}|${model}|${status}`;
            if (logsCacheRef.current[cacheKey]) {
                const cached = logsCacheRef.current[cacheKey];
                setLogs(cached.items);
                setLogsTotal(cached.total);
                setLogsStats(cached.stats);
                setLogsModels(cached.filters.models ?? []);
                return;
            }
            setLogsLoading(true);
            try {
                const params = new URLSearchParams({
                    api_key: key,
                    days: String(days),
                    page: String(page),
                    size: String(logsPageSize),
                });
                if (model) params.set("model", model);
                if (status) params.set("status", status);
                const res = await fetch(
                    `${API_BASE}/v0/management/public/usage/logs?${params}`,
                );
                if (!res.ok) throw new Error("Logs request failed");
                const data: LogsResponse = await res.json();
                logsCacheRef.current[cacheKey] = data;
                setLogs(data.items ?? []);
                setLogsTotal(data.total);
                setLogsPage(data.page);
                setLogsStats(data.stats);
                setLogsModels(data.filters?.models ?? []);
            } catch {
                setLogs([]);
                setLogsTotal(0);
            } finally {
                setLogsLoading(false);
            }
        },
        [],
    );

    /* ================================================================ */
    /*  Query handler                                                    */
    /* ================================================================ */

    const handleQuery = useCallback(
        async (key: string) => {
            const trimmed = key.trim();
            if (!trimmed || fetchInFlightRef.current) return;
            fetchInFlightRef.current = true;
            setQueriedKey(trimmed);
            // Clear caches on new key
            chartCacheRef.current = {};
            logsCacheRef.current = {};
            setModelFilter("");
            setStatusFilter("");
            setLogsPage(1);

            try {
                if (activeTab === "usage") {
                    await fetchChartData(trimmed, timeRange);
                } else {
                    await fetchLogs(trimmed, timeRange, 1, "", "");
                }
            } finally {
                fetchInFlightRef.current = false;
            }
        },
        [activeTab, timeRange, fetchChartData, fetchLogs],
    );

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            void handleQuery(apiKeyInput);
        },
        [apiKeyInput, handleQuery],
    );

    // --- URL param auto-query ---
    useEffect(() => {
        const searchStr = window.location.search || window.location.hash.split("?")[1] || "";
        const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr : `?${searchStr}`);
        const key = params.get("api_key") ?? params.get("key") ?? "";
        if (key) {
            setApiKeyInput(key);
            void handleQuery(key);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ================================================================ */
    /*  Tab / filter change effects                                      */
    /* ================================================================ */

    // When tab changes, fetch the appropriate data
    useEffect(() => {
        if (!queriedKey) return;
        if (activeTab === "usage") {
            void fetchChartData(queriedKey, timeRange);
        } else {
            void fetchLogs(queriedKey, timeRange, logsPage, modelFilter, statusFilter);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // When time range changes, refetch current tab
    useEffect(() => {
        if (!queriedKey) return;
        // Clear caches when time range changes
        chartCacheRef.current = {};
        logsCacheRef.current = {};
        setLogsPage(1);
        if (activeTab === "usage") {
            void fetchChartData(queriedKey, timeRange);
        } else {
            void fetchLogs(queriedKey, timeRange, 1, modelFilter, statusFilter);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeRange]);

    // When log filters change, refetch logs
    useEffect(() => {
        if (!queriedKey || activeTab !== "logs") return;
        const newPage = 1;
        setLogsPage(newPage);
        void fetchLogs(queriedKey, timeRange, newPage, modelFilter, statusFilter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelFilter, statusFilter]);

    /* ================================================================ */
    /*  Chart computations                                               */
    /* ================================================================ */

    const stats = activeTab === "usage" ? chartData?.stats : logsStats;

    // Transform API chart data → DailySeriesPoint format
    const dailySeries: DailySeriesPoint[] = useMemo(() => {
        if (!chartData?.daily_series) return [];
        return chartData.daily_series.map((d) => ({
            label: formatLocalDateLabel(d.date),
            requests: d.requests,
            inputTokens: d.input_tokens,
            outputTokens: d.output_tokens,
        }));
    }, [chartData]);

    const dailyTrendOption = useMemo(
        () => createDailyTrendOption({ dailySeries, dailyLegendSelected, isDark }),
        [dailySeries, dailyLegendSelected, isDark],
    );

    const toggleDailyLegend = useCallback((key: string) => {
        if (key !== "输入 Token" && key !== "输出 Token" && key !== "请求数") return;
        setDailyLegendSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
    }, []);

    const dailyLegendAvailability = useMemo(() => {
        const pts = dailySeries.filter(
            (i) => i.requests > 0 || i.inputTokens > 0 || i.outputTokens > 0,
        );
        const vis = pts.length > 0 ? pts : dailySeries;
        return {
            hasInput: vis.some((i) => i.inputTokens > 0),
            hasOutput: vis.some((i) => i.outputTokens > 0),
            hasRequests: vis.some((i) => i.requests > 0),
        };
    }, [dailySeries]);

    // Transform API model distribution → ModelDistributionDatum
    const modelDistributionData: ModelDistributionDatum[] = useMemo(() => {
        if (!chartData?.model_distribution) return [];
        const sorted = [...chartData.model_distribution].sort((a, b) => {
            const av = modelMetric === "requests" ? a.requests : a.tokens;
            const bv = modelMetric === "requests" ? b.requests : b.tokens;
            return bv - av || a.model.localeCompare(b.model);
        });
        const top = sorted.slice(0, 10);
        const otherValue = sorted.slice(10).reduce(
            (acc, item) => acc + (modelMetric === "requests" ? item.requests : item.tokens),
            0,
        );
        const data = top.map((item) => ({
            name: item.model,
            value: modelMetric === "requests" ? item.requests : item.tokens,
        }));
        if (otherValue > 0) data.push({ name: "其他", value: otherValue });
        return data;
    }, [chartData, modelMetric]);

    const modelDistributionOption = useMemo(
        () => createModelDistributionOption({ isDark, data: modelDistributionData }),
        [isDark, modelDistributionData],
    );

    const modelDistributionLegend = useMemo(() => {
        const total = modelDistributionData.reduce(
            (acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0),
            0,
        );
        return modelDistributionData.map((item, index) => {
            const colorClass =
                index < CHART_COLOR_CLASSES.length ? CHART_COLOR_CLASSES[index] : "bg-slate-400";
            const value = Number(item.value ?? 0);
            const percent = total > 0 ? (value / total) * 100 : 0;
            return {
                name: item.name,
                valueLabel: formatCompact(value),
                percentLabel: `${percent.toFixed(1)}%`,
                colorClass,
            };
        });
    }, [modelDistributionData]);

    /* ================================================================ */
    /*  Model filter options for SearchableSelect                        */
    /* ================================================================ */

    const modelFilterOptions = useMemo(
        () => [
            { value: "", label: "全部模型", searchText: "全部模型 all" },
            ...logsModels.map((m) => ({ value: m, label: m, searchText: m })),
        ],
        [logsModels],
    );

    /* ================================================================ */
    /*  Derived UI state                                                 */
    /* ================================================================ */

    const maskedKey = queriedKey ? maskKey(queriedKey) : "";
    const totalPages = Math.max(1, Math.ceil(logsTotal / logsPageSize));

    /* ================================================================ */
    /*  Render                                                           */
    /* ================================================================ */

    return (
        <div className="relative min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
            {/* Header */}
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
                {/* Search */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-white/80">
                                API Key
                            </label>
                            <div className="relative">
                                <Search
                                    size={16}
                                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40"
                                />
                                <input
                                    type="text"
                                    id="apikey-input"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="输入 API Key 查询使用记录"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:placeholder:text-white/30 dark:focus:border-neutral-600 dark:focus:ring-white/10"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            id="apikey-lookup-submit"
                            disabled={!apiKeyInput.trim() || chartLoading || logsLoading}
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
                        >
                            {(chartLoading || logsLoading) && (
                                <Loader2 size={14} className="animate-spin" />
                            )}
                            查询
                        </button>
                    </form>
                </section>

                {/* Results area */}
                {queriedKey && (
                    <>
                        {/* Time range + Tab selector */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "usage" | "logs")}>
                                <TabsList>
                                    <TabsTrigger value="usage">使用统计</TabsTrigger>
                                    <TabsTrigger value="logs">请求日志</TabsTrigger>
                                </TabsList>
                            </Tabs>
                            <Tabs
                                value={String(timeRange)}
                                onValueChange={(v) => setTimeRange(Number(v) as TimeRange)}
                            >
                                <TabsList>
                                    {TIME_RANGES.map((r) => (
                                        <TabsTrigger key={r} value={String(r)}>
                                            {r === 1 ? "今天" : `${r} 天`}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                        </div>

                        {/* Key badge */}
                        <p className="text-xs text-slate-500 dark:text-white/50">
                            查询结果：<span className="font-mono">{maskedKey}</span>
                        </p>

                        {/* ========== Usage Tab ========== */}
                        {activeTab === "usage" && (
                            <div className="space-y-5">
                                {/* KPI cards */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                                            <Activity size={14} className="text-slate-900 dark:text-white" />
                                            总请求数
                                        </p>
                                        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                                            {formatCompact(stats?.total ?? 0)}
                                        </p>
                                    </article>
                                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                                            <CheckCircle size={14} className="text-slate-900 dark:text-white" />
                                            成功率
                                        </p>
                                        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                                            {(stats?.success_rate ?? 0).toFixed(1)}%
                                        </p>
                                    </article>
                                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                                            <Coins size={14} className="text-slate-900 dark:text-white" />
                                            Token 总量
                                        </p>
                                        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                                            {formatCompact(stats?.total_tokens ?? 0)}
                                        </p>
                                    </article>
                                </div>

                                {/* Charts */}
                                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                                    {/* Model distribution */}
                                    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                                    模型分布
                                                </h3>
                                                <p className="text-xs text-slate-600 dark:text-white/65">
                                                    各模型{modelMetric === "requests" ? "请求" : "Token"}占比
                                                </p>
                                            </div>
                                            <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                                                {(
                                                    [
                                                        { key: "requests", label: "请求" },
                                                        { key: "tokens", label: "Token" },
                                                    ] as const
                                                ).map((item) => {
                                                    const active = modelMetric === item.key;
                                                    return (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() => setModelMetric(item.key)}
                                                            className={
                                                                active
                                                                    ? "rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                                                                    : "rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                                                            }
                                                        >
                                                            {item.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="relative mt-4 min-w-0">
                                            {chartLoading && (
                                                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/65 backdrop-blur-sm dark:bg-neutral-950/45">
                                                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                                                </div>
                                            )}
                                            {modelDistributionData.length > 0 ? (
                                                <div className="flex flex-col items-center gap-4 sm:flex-row">
                                                    <EChart
                                                        option={modelDistributionOption}
                                                        className="h-52 w-52 shrink-0 sm:h-48 sm:w-48"
                                                    />
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                                                        {modelDistributionLegend.map((item, idx) => (
                                                            <div key={item.name} className="flex items-center gap-1.5">
                                                                <span
                                                                    className={`h-2.5 w-2.5 rounded-full ${item.colorClass}`}
                                                                />
                                                                <span className="text-slate-700 dark:text-white/80">
                                                                    {item.name}
                                                                </span>
                                                                <span className="font-medium text-slate-900 dark:text-white">
                                                                    {item.valueLabel}
                                                                </span>
                                                                <span className="text-slate-400 dark:text-white/40">
                                                                    {item.percentLabel}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                                                    暂无数据
                                                </p>
                                            )}
                                        </div>
                                    </section>

                                    {/* Daily trend */}
                                    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                                每日用量趋势
                                            </h3>
                                            <p className="text-xs text-slate-600 dark:text-white/65">
                                                每日请求数与 Token 消耗
                                            </p>
                                        </div>
                                        <div className="relative mt-4 min-w-0">
                                            {chartLoading && (
                                                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/65 backdrop-blur-sm dark:bg-neutral-950/45">
                                                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                                                </div>
                                            )}
                                            {dailySeries.length > 0 ? (
                                                <>
                                                    <EChart
                                                        option={dailyTrendOption}
                                                        className="h-56"
                                                    />
                                                    <ChartLegend
                                                        className="mt-2"
                                                        items={[
                                                            ...(dailyLegendAvailability.hasInput
                                                                ? [
                                                                    {
                                                                        key: "输入 Token",
                                                                        label: "输入 Token",
                                                                        colorClass: "bg-violet-300",
                                                                        enabled: dailyLegendSelected["输入 Token"] ?? true,
                                                                        onToggle: toggleDailyLegend,
                                                                    },
                                                                ]
                                                                : []),
                                                            ...(dailyLegendAvailability.hasOutput
                                                                ? [
                                                                    {
                                                                        key: "输出 Token",
                                                                        label: "输出 Token",
                                                                        colorClass: "bg-emerald-300",
                                                                        enabled: dailyLegendSelected["输出 Token"] ?? true,
                                                                        onToggle: toggleDailyLegend,
                                                                    },
                                                                ]
                                                                : []),
                                                            ...(dailyLegendAvailability.hasRequests
                                                                ? [
                                                                    {
                                                                        key: "请求数",
                                                                        label: "请求数",
                                                                        colorClass: "bg-blue-500",
                                                                        enabled: dailyLegendSelected["请求数"] ?? true,
                                                                        onToggle: toggleDailyLegend,
                                                                    },
                                                                ]
                                                                : []),
                                                        ]}
                                                    />
                                                </>
                                            ) : (
                                                <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                                                    暂无数据
                                                </p>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        )}

                        {/* ========== Logs Tab ========== */}
                        {activeTab === "logs" && (
                            <div className="space-y-4">
                                {/* Filters */}
                                <div className="flex flex-wrap items-center gap-3">
                                    <SearchableSelect
                                        value={statusFilter}
                                        onChange={setStatusFilter}
                                        options={STATUS_OPTIONS}
                                        placeholder="全部状态"
                                        aria-label="状态筛选"
                                    />
                                    {logsModels.length > 0 && (
                                        <SearchableSelect
                                            value={modelFilter}
                                            onChange={setModelFilter}
                                            options={modelFilterOptions}
                                            placeholder="全部模型"
                                            aria-label="模型筛选"
                                        />
                                    )}
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wider text-slate-500 dark:border-neutral-800 dark:text-white/55">
                                                <th className="whitespace-nowrap px-4 py-3">时间</th>
                                                <th className="whitespace-nowrap px-4 py-3">模型</th>
                                                <th className="whitespace-nowrap px-4 py-3">状态</th>
                                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                                    延迟
                                                </th>
                                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                                    输入
                                                </th>
                                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                                    输出
                                                </th>
                                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                                    总计
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-neutral-800/60">
                                            {logsLoading ? (
                                                <tr>
                                                    <td colSpan={7} className="py-12 text-center">
                                                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                                                    </td>
                                                </tr>
                                            ) : logs.length === 0 ? (
                                                <tr>
                                                    <td
                                                        colSpan={7}
                                                        className="py-12 text-center text-sm text-slate-400 dark:text-white/30"
                                                    >
                                                        暂无日志记录
                                                    </td>
                                                </tr>
                                            ) : (
                                                logs.map((row) => (
                                                    <tr
                                                        key={row.id}
                                                        className="transition-colors hover:bg-slate-50/60 dark:hover:bg-white/[0.03]"
                                                    >
                                                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-700 dark:text-white/70">
                                                            {formatTimestamp(row.timestamp)}
                                                        </td>
                                                        <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-900 dark:text-white">
                                                            {row.model}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            {row.failed ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                                                    <XCircle size={12} />
                                                                    失败
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                                    <CheckCircle size={12} />
                                                                    成功
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-white/70">
                                                            {row.latency_ms > 0
                                                                ? `${(row.latency_ms / 1000).toFixed(1)}s`
                                                                : "-"}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-white/70">
                                                            {formatCompact(row.input_tokens)}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-white/70">
                                                            {formatCompact(row.output_tokens)}
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                                                            {formatCompact(row.total_tokens)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {logsTotal > logsPageSize && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 dark:text-white/50">
                                            共 {logsTotal} 条 · 第 {logsPage}/{totalPages} 页
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={logsPage <= 1}
                                                onClick={() => {
                                                    const p = logsPage - 1;
                                                    setLogsPage(p);
                                                    void fetchLogs(queriedKey, timeRange, p, modelFilter, statusFilter);
                                                }}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
                                            >
                                                上一页
                                            </button>
                                            <button
                                                type="button"
                                                disabled={logsPage >= totalPages}
                                                onClick={() => {
                                                    const p = logsPage + 1;
                                                    setLogsPage(p);
                                                    void fetchLogs(queriedKey, timeRange, p, modelFilter, statusFilter);
                                                }}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
                                            >
                                                下一页
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
