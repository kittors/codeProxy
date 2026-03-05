import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
    Activity,
    ChartSpline,
    Coins,
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
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import type { UsageData, UsageDetail } from "@/lib/http/types";
import type { TimeRange } from "@/modules/monitor/monitor-constants";
import { CHART_COLOR_CLASSES, HOURLY_MODEL_COLORS } from "@/modules/monitor/monitor-constants";
import {
    computeKpiMetrics,
    filterUsageByDays,
    formatNumber,
    formatRate,
    iterateUsageRecords,
} from "@/modules/monitor/monitor-utils";
import {
    formatCompact,
    formatLocalDateKey,
    formatMonthDay,
} from "@/modules/monitor/monitor-format";
import {
    KpiCard,
    MonitorCard as Card,
    TimeRangeSelector,
} from "@/modules/monitor/MonitorPagePieces";
import {
    createDailyTrendOption,
    createModelDistributionOption,
} from "@/modules/monitor/monitor-chart-options";
import { MANAGEMENT_API_PREFIX } from "@/lib/constants";
import { detectApiBaseFromLocation } from "@/lib/connection";

interface PublicUsageResponse {
    usage: UsageData;
    api_key: string;
    found: boolean;
}

/**
 * 公开的 API Key 查询函数 — 不需要管理员认证
 */
async function fetchPublicUsage(apiKey: string): Promise<PublicUsageResponse> {
    const base = detectApiBaseFromLocation();
    const url = `${base}${MANAGEMENT_API_PREFIX}/public/usage?api_key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `请求失败 (${response.status})`);
    }
    return response.json() as Promise<PublicUsageResponse>;
}

type ActiveTab = "usage" | "logs";

interface FlatRecord {
    apiKey: string;
    model: string;
    timestamp: string;
    failed: boolean;
    source: string;
    authIndex: string;
    latencyMs?: number;
    tokens: UsageDetail["tokens"];
}

function flattenUsageToLogs(data: UsageData): FlatRecord[] {
    const rows: FlatRecord[] = [];
    for (const [apiKey, apiData] of Object.entries(data.apis ?? {})) {
        for (const [model, modelData] of Object.entries(apiData.models ?? {})) {
            for (const detail of modelData.details ?? []) {
                rows.push({
                    apiKey,
                    model,
                    timestamp: detail.timestamp,
                    failed: detail.failed,
                    source: detail.source,
                    authIndex: detail.auth_index,
                    latencyMs: detail.latency_ms,
                    tokens: detail.tokens,
                });
            }
        }
    }
    rows.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
    return rows;
}

const createEmptyUsage = (): UsageData => ({ apis: {} });

export function ApiKeyLookupPage() {
    const {
        state: { mode },
    } = useTheme();
    const isDark = mode === "dark";

    const [apiKeyInput, setApiKeyInput] = useState("");
    const [queriedKey, setQueriedKey] = useState("");
    const [rawUsage, setRawUsage] = useState<UsageData>(createEmptyUsage);
    const [found, setFound] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [timeRange, setTimeRange] = useState<TimeRange>(7);
    const [activeTab, setActiveTab] = useState<ActiveTab>("usage");
    const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");

    const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
        "输入 Token": true,
        "输出 Token": true,
        请求数: true,
    });

    const fetchData = useCallback(async (key: string) => {
        if (!key.trim()) return;
        setIsLoading(true);
        setError(null);
        setFound(null);
        try {
            const result = await fetchPublicUsage(key.trim());
            startTransition(() => {
                setRawUsage(result.usage ?? createEmptyUsage());
                setFound(result.found);
                setQueriedKey(key.trim());
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "查询失败");
            setRawUsage(createEmptyUsage());
            setFound(false);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleSubmit = useCallback(
        (event?: React.FormEvent) => {
            event?.preventDefault();
            void fetchData(apiKeyInput);
        },
        [apiKeyInput, fetchData],
    );

    const handleRefresh = useCallback(() => {
        if (queriedKey) void fetchData(queriedKey);
    }, [queriedKey, fetchData]);

    const filteredUsage = useMemo(
        () => filterUsageByDays(rawUsage, timeRange, ""),
        [rawUsage, timeRange],
    );
    const metrics = useMemo(() => computeKpiMetrics(filteredUsage), [filteredUsage]);
    const records = useMemo(() => iterateUsageRecords(filteredUsage), [filteredUsage]);
    const logRecords = useMemo(() => flattenUsageToLogs(filteredUsage), [filteredUsage]);

    const hasData = metrics.requestCount > 0;
    const busy = isLoading || isPending;

    // ---- chart data (simplified from MonitorPage) ----
    const modelTotals = useMemo(() => {
        const byModel = new Map<string, { requests: number; tokens: number }>();
        records.forEach((r) => {
            const cur = byModel.get(r.model) ?? { requests: 0, tokens: 0 };
            byModel.set(r.model, {
                requests: cur.requests + 1,
                tokens: cur.tokens + (r.tokens?.total_tokens ?? 0),
            });
        });
        return [...byModel.entries()]
            .map(([model, v]) => ({ model, ...v }))
            .sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model));
    }, [records]);

    const sortedModels = useMemo(() => {
        const list = [...modelTotals];
        list.sort((a, b) => {
            const av = modelMetric === "requests" ? a.requests : a.tokens;
            const bv = modelMetric === "requests" ? b.requests : b.tokens;
            return bv - av || a.model.localeCompare(b.model);
        });
        return list;
    }, [modelMetric, modelTotals]);

    const modelDistributionData = useMemo(() => {
        const top = sortedModels.slice(0, 10);
        const otherValue = sortedModels.slice(10).reduce((acc, item) => {
            return acc + (modelMetric === "requests" ? item.requests : item.tokens);
        }, 0);
        const data = top.map((item) => ({
            name: item.model,
            value: modelMetric === "requests" ? item.requests : item.tokens,
        }));
        if (otherValue > 0) data.push({ name: "其他", value: otherValue });
        return data;
    }, [modelMetric, sortedModels]);

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
            const colorClass = index < CHART_COLOR_CLASSES.length ? CHART_COLOR_CLASSES[index] : "bg-slate-400";
            const value = Number(item.value ?? 0);
            const percent = total > 0 ? (value / total) * 100 : 0;
            return { name: item.name, valueLabel: formatCompact(value), percentLabel: `${percent.toFixed(1)}%`, colorClass };
        });
    }, [modelDistributionData]);

    const dailySeries = useMemo(() => {
        const byDay = new Map<string, { requests: number; inputTokens: number; outputTokens: number }>();
        records.forEach((r) => {
            const date = new Date(r.timestamp);
            if (!Number.isFinite(date.getTime())) return;
            const key = formatLocalDateKey(date);
            const cur = byDay.get(key) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
            byDay.set(key, {
                requests: cur.requests + 1,
                inputTokens: cur.inputTokens + (r.tokens?.input_tokens ?? 0),
                outputTokens: cur.outputTokens + (r.tokens?.output_tokens ?? 0),
            });
        });
        const today = new Date();
        return Array.from({ length: timeRange }).map((_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() - (timeRange - 1 - i));
            const key = formatLocalDateKey(date);
            const label = formatMonthDay(date);
            const v = byDay.get(key) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
            return { label, ...v, totalTokens: v.inputTokens + v.outputTokens };
        });
    }, [records, timeRange]);

    const dailyLegendAvailability = useMemo(() => {
        const pts = dailySeries.filter((i) => i.requests > 0 || i.inputTokens > 0 || i.outputTokens > 0);
        const vis = pts.length > 0 ? pts : dailySeries;
        return {
            hasInput: vis.some((i) => i.inputTokens > 0),
            hasOutput: vis.some((i) => i.outputTokens > 0),
            hasRequests: vis.some((i) => i.requests > 0),
        };
    }, [dailySeries]);

    const dailyTrendOption = useMemo(
        () => createDailyTrendOption({ dailySeries, dailyLegendSelected, isDark }),
        [dailyLegendSelected, dailySeries, isDark],
    );

    const toggleDailyLegend = useCallback((key: string) => {
        if (key !== "输入 Token" && key !== "输出 Token" && key !== "请求数") return;
        setDailyLegendSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
    }, []);

    const maskedKey = queriedKey
        ? queriedKey.length > 12
            ? `${queriedKey.slice(0, 6)}****${queriedKey.slice(-4)}`
            : "****"
        : "";

    // 读取 URL 中的 api_key 参数进行自动查询（兼容 BrowserRouter 和 HashRouter）
    useEffect(() => {
        const searchStr = window.location.search || window.location.hash.split("?")[1] || "";
        const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr : `?${searchStr}`);
        const key = params.get("api_key") ?? params.get("key") ?? "";
        if (key) {
            setApiKeyInput(key);
            void fetchData(key);
        }
    }, [fetchData]);

    const modelActions = (
        <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            {[
                { key: "requests", label: "请求" },
                { key: "tokens", label: "Token" },
            ].map((item) => {
                const active = modelMetric === item.key;
                return (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setModelMetric(item.key as "requests" | "tokens")}
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
    );

    return (
        <div className="relative min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
            {/* 顶部导航 */}
            <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/70">
                <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
                            <Key size={16} className="text-white" />
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
                            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
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

                    {found === false && !error && queriedKey && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
                            未找到此 API Key 的使用记录，请检查输入是否正确。
                        </div>
                    )}
                </section>

                {/* 已查询的 Key & Tab 切换 */}
                {found && queriedKey && (
                    <>
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 shadow-sm">
                                        <Key size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 dark:text-white/55">
                                            当前查询 Key
                                        </p>
                                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                            {maskedKey}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Tab 切换 */}
                                    <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                                        {(
                                            [
                                                { key: "usage", label: "使用统计", icon: ChartSpline },
                                                { key: "logs", label: "请求日志", icon: Activity },
                                            ] as const
                                        ).map((tab) => {
                                            const active = activeTab === tab.key;
                                            return (
                                                <button
                                                    key={tab.key}
                                                    type="button"
                                                    onClick={() => setActiveTab(tab.key as ActiveTab)}
                                                    className={
                                                        active
                                                            ? "inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                                                            : "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                                                    }
                                                >
                                                    <tab.icon size={14} />
                                                    {tab.label}
                                                </button>
                                            );
                                        })}
                                    </div>

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

                        {/* 使用统计 Tab */}
                        {activeTab === "usage" && (
                            <div className="space-y-4">
                                <Reveal>
                                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        <KpiCard
                                            title="总请求"
                                            value={<AnimatedNumber value={metrics.requestCount} format={formatNumber} />}
                                            hint="已按时间范围过滤"
                                            icon={Activity}
                                        />
                                        <KpiCard
                                            title="成功率"
                                            value={<AnimatedNumber value={metrics.successRate} format={formatRate} />}
                                            hint={`成功 ${formatNumber(metrics.successCount)} / 失败 ${formatNumber(metrics.failedCount)}`}
                                            icon={ShieldCheck}
                                        />
                                        <KpiCard
                                            title="总 Token"
                                            value={<AnimatedNumber value={metrics.totalTokens} format={formatNumber} />}
                                            hint="输入 + 输出 + 推理 + 缓存"
                                            icon={Sigma}
                                        />
                                        <KpiCard
                                            title="输出 Token"
                                            value={<AnimatedNumber value={metrics.outputTokens} format={formatNumber} />}
                                            hint={`输入 Token：${formatNumber(metrics.inputTokens)}`}
                                            icon={Coins}
                                        />
                                    </section>
                                </Reveal>

                                {!hasData && !busy ? (
                                    <Reveal>
                                        <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                                            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700 dark:bg-white/10 dark:text-white/70">
                                                    <ChartSpline size={20} />
                                                </div>
                                                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                    该时间范围内暂无数据
                                                </p>
                                                <p className="text-sm text-slate-600 dark:text-white/65">
                                                    尝试更换更长的时间范围查看。
                                                </p>
                                            </div>
                                        </section>
                                    </Reveal>
                                ) : (
                                    <Reveal>
                                        <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
                                            <Card
                                                title="模型用量分布"
                                                description={`最近 ${timeRange} 天 · 按${modelMetric === "requests" ? "请求数" : "Token"} · Top10`}
                                                actions={modelActions}
                                                loading={busy}
                                            >
                                                <div className="grid h-72 grid-cols-[minmax(0,1fr)_200px] gap-4">
                                                    <EChart option={modelDistributionOption} className="h-72 min-w-0" />
                                                    <div className="flex h-72 flex-col justify-center gap-2 overflow-y-auto pr-1">
                                                        {modelDistributionLegend.map((item) => (
                                                            <div
                                                                key={item.name}
                                                                className="grid grid-cols-[minmax(0,100px)_40px_52px] items-center gap-x-1 text-sm"
                                                            >
                                                                <div className="flex min-w-0 items-center gap-2">
                                                                    <span
                                                                        className={`h-3.5 w-3.5 shrink-0 rounded-full ${item.colorClass} opacity-80 ring-1 ring-black/5 dark:ring-white/10`}
                                                                    />
                                                                    <span className="min-w-0 truncate text-slate-700 dark:text-white/80">
                                                                        {item.name}
                                                                    </span>
                                                                </div>
                                                                <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                                                                    {item.valueLabel}
                                                                </span>
                                                                <span className="text-right tabular-nums text-slate-500 dark:text-white/55">
                                                                    {item.percentLabel}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </Card>

                                            <Card
                                                title="每日用量趋势"
                                                description={`最近 ${timeRange} 天 · 请求数与 Token 用量趋势`}
                                                loading={busy}
                                            >
                                                <div className="flex h-72 min-w-0 flex-col overflow-hidden">
                                                    <EChart
                                                        option={dailyTrendOption}
                                                        className="min-h-0 flex-1 min-w-0"
                                                        replaceMerge="series"
                                                    />
                                                    <ChartLegend
                                                        className="shrink-0 pt-4"
                                                        items={[
                                                            ...(dailyLegendAvailability.hasInput
                                                                ? [
                                                                    {
                                                                        key: "输入 Token",
                                                                        label: "输入 Token",
                                                                        colorClass: "bg-violet-400",
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
                                                                        colorClass: "bg-emerald-400",
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
                                                </div>
                                            </Card>
                                        </section>
                                    </Reveal>
                                )}
                            </div>
                        )}

                        {/* 请求日志 Tab */}
                        {activeTab === "logs" && (
                            <Reveal>
                                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                    <div className="border-b border-slate-200 px-5 py-3 dark:border-neutral-800">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                            请求日志
                                            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-white/55">
                                                共 {logRecords.length} 条
                                            </span>
                                        </h3>
                                    </div>
                                    <div className="max-h-[600px] overflow-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-neutral-900">
                                                <tr className="border-b border-slate-200 dark:border-neutral-800">
                                                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-600 dark:text-white/65">
                                                        时间
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-600 dark:text-white/65">
                                                        模型
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-600 dark:text-white/65">
                                                        状态
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-600 dark:text-white/65">
                                                        来源
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-600 dark:text-white/65">
                                                        延迟
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-600 dark:text-white/65">
                                                        输入 Token
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-600 dark:text-white/65">
                                                        输出 Token
                                                    </th>
                                                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-600 dark:text-white/65">
                                                        总 Token
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {logRecords.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={8}
                                                            className="px-4 py-10 text-center text-slate-500 dark:text-white/55"
                                                        >
                                                            该时间范围内暂无请求日志
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    logRecords.map((row, index) => {
                                                        const ts = new Date(row.timestamp);
                                                        const timeStr = Number.isFinite(ts.getTime())
                                                            ? ts.toLocaleString("zh-CN", {
                                                                month: "2-digit",
                                                                day: "2-digit",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                                second: "2-digit",
                                                            })
                                                            : row.timestamp;
                                                        return (
                                                            <tr
                                                                key={`${row.timestamp}-${row.model}-${index}`}
                                                                className="border-b border-slate-100 transition hover:bg-slate-50/60 dark:border-neutral-800/60 dark:hover:bg-white/[0.03]"
                                                            >
                                                                <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-700 dark:text-white/75">
                                                                    {timeStr}
                                                                </td>
                                                                <td className="max-w-[180px] truncate px-4 py-2 font-medium text-slate-900 dark:text-white">
                                                                    {row.model}
                                                                </td>
                                                                <td className="px-4 py-2">
                                                                    {row.failed ? (
                                                                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 ring-1 ring-red-200/60 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-900/40">
                                                                            失败
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600 ring-1 ring-green-200/60 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-900/40">
                                                                            成功
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="max-w-[120px] truncate px-4 py-2 text-slate-600 dark:text-white/65">
                                                                    {row.source || "-"}
                                                                </td>
                                                                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700 dark:text-white/75">
                                                                    {row.latencyMs != null ? `${row.latencyMs}ms` : "-"}
                                                                </td>
                                                                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700 dark:text-white/75">
                                                                    {formatNumber(row.tokens?.input_tokens ?? 0)}
                                                                </td>
                                                                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700 dark:text-white/75">
                                                                    {formatNumber(row.tokens?.output_tokens ?? 0)}
                                                                </td>
                                                                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                                                                    {formatNumber(row.tokens?.total_tokens ?? 0)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </Reveal>
                        )}
                    </>
                )}

                {/* 初始空状态 */}
                {!queriedKey && !error && (
                    <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-16 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                        <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-950/60 dark:to-violet-950/60">
                                <Search size={28} className="text-indigo-500 dark:text-indigo-400" />
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
