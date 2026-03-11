import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    Check,
    ChartSpline,
    Coins,
    Copy,
    Filter,
    Key,
    Layers,
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
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import { createModelDistributionOption } from "@/modules/monitor/chart-options/model-distribution";
import { createDailyTrendOption } from "@/modules/monitor/chart-options/daily-trend";
import { CHART_COLOR_CLASSES } from "@/modules/monitor/monitor-constants";
import type { TimeRange } from "@/modules/monitor/monitor-constants";
import { formatCompact } from "@/modules/monitor/monitor-format";
import { formatNumber, formatRate } from "@/modules/monitor/monitor-utils";
import { KpiCard, TimeRangeSelector } from "@/modules/monitor/MonitorPagePieces";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { MANAGEMENT_API_PREFIX } from "@/lib/constants";
import { detectApiBaseFromLocation } from "@/lib/connection";
import type {
    ModelDistributionDatum,
    DailySeriesPoint,
} from "@/modules/monitor/chart-options/types";

// Vendor SVG icons
import iconClaude from "@/assets/icons/claude.svg";
import iconOpenaiLight from "@/assets/icons/openai-light.svg";
import iconOpenaiDark from "@/assets/icons/openai-dark.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconDeepseek from "@/assets/icons/deepseek.svg";
import iconQwen from "@/assets/icons/qwen.svg";
import iconMinimax from "@/assets/icons/minimax.svg";
import iconGrok from "@/assets/icons/grok.svg";
import iconKimiLight from "@/assets/icons/kimi-light.svg";
import iconKimiDark from "@/assets/icons/kimi-dark.svg";
import iconCodexLight from "@/assets/icons/codex_light.svg";
import iconCodexDark from "@/assets/icons/codex_drak.svg";
import iconGlm from "@/assets/icons/glm.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconIflow from "@/assets/icons/iflow.svg";

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
    cost: number;
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
        total_cost: number;
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
    cost: number;
    hasContent: boolean;
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
    stats: { total: number; success_rate: number; total_tokens: number; total_cost: number };
}

// ── Model Vendor Helpers ────────────────────────────────────────────────────

const VENDOR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    claude: { bg: "bg-orange-50 dark:bg-orange-950/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200/60 dark:border-orange-800/30" },
    gpt: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    o1: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    o3: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    o4: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    gemini: { bg: "bg-blue-50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200/60 dark:border-blue-800/30" },
    deepseek: { bg: "bg-cyan-50 dark:bg-cyan-950/20", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200/60 dark:border-cyan-800/30" },
    qwen: { bg: "bg-violet-50 dark:bg-violet-950/20", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200/60 dark:border-violet-800/30" },
    llama: { bg: "bg-indigo-50 dark:bg-indigo-950/20", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200/60 dark:border-indigo-800/30" },
    mistral: { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200/60 dark:border-amber-800/30" },
    minimax: { bg: "bg-sky-50 dark:bg-sky-950/20", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200/60 dark:border-sky-800/30" },
    grok: { bg: "bg-slate-50 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200/60 dark:border-slate-700/30" },
    kimi: { bg: "bg-slate-50 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200/60 dark:border-slate-700/30" },
    codex: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    glm: { bg: "bg-blue-50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200/60 dark:border-blue-800/30" },
    kiro: { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200/60 dark:border-amber-800/30" },
};

const DEFAULT_VENDOR_COLOR = { bg: "bg-slate-50 dark:bg-neutral-900/40", text: "text-slate-600 dark:text-slate-300", border: "border-slate-200/60 dark:border-neutral-700/40" };

const VENDOR_ICONS: Record<string, { light: string; dark: string }> = {
    claude: { light: iconClaude, dark: iconClaude },
    gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
    o1: { light: iconOpenaiLight, dark: iconOpenaiDark },
    o3: { light: iconOpenaiLight, dark: iconOpenaiDark },
    o4: { light: iconOpenaiLight, dark: iconOpenaiDark },
    gemini: { light: iconGemini, dark: iconGemini },
    deepseek: { light: iconDeepseek, dark: iconDeepseek },
    qwen: { light: iconQwen, dark: iconQwen },
    minimax: { light: iconMinimax, dark: iconMinimax },
    grok: { light: iconGrok, dark: iconGrok },
    kimi: { light: iconKimiLight, dark: iconKimiDark },
    codex: { light: iconCodexLight, dark: iconCodexDark },
    glm: { light: iconGlm, dark: iconGlm },
    kiro: { light: iconKiro, dark: iconKiro },
    vertex: { light: iconVertex, dark: iconVertex },
    iflow: { light: iconIflow, dark: iconIflow },
};

function getVendorColor(modelId: string) {
    const lower = modelId.toLowerCase();
    for (const [prefix, color] of Object.entries(VENDOR_COLORS)) {
        if (lower.startsWith(prefix)) return color;
    }
    return DEFAULT_VENDOR_COLOR;
}

function getVendorPrefix(modelId: string): string {
    const lower = modelId.toLowerCase();
    for (const prefix of Object.keys(VENDOR_ICONS)) {
        if (lower.startsWith(prefix)) return prefix;
    }
    return "";
}

function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
    const prefix = getVendorPrefix(modelId);
    const icons = prefix ? VENDOR_ICONS[prefix] : null;
    if (!icons) return null;
    return (
        <>
            <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
            <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
        </>
    );
}

function ModelTag({ id }: { id: string }) {
    const [copied, setCopied] = useState(false);
    const vc = getVendorColor(id);
    const handleClick = () => {
        void navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            type="button"
            onClick={handleClick}
            title="点击复制模型名称"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition hover:shadow-sm active:scale-95 ${vc.bg} ${vc.text} ${vc.border}`}
        >
            {copied ? (
                <>
                    <Check size={11} className="text-emerald-500" />
                    已复制
                </>
            ) : (
                <>
                    <VendorIcon modelId={id} size={14} />
                    {id}
                </>
            )}
        </button>
    );
}

type V1ModelsResponse =
    | { data?: Array<{ id?: string }> }
    | { models?: Array<{ id?: string }> }
    | Array<{ id?: string }>
    | Record<string, unknown>;

const extractModelIds = (payload: V1ModelsResponse): string[] => {
    const data = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { data?: unknown }).data)
            ? ((payload as { data: unknown[] }).data as Array<{ id?: string }>)
            : Array.isArray((payload as { models?: unknown }).models)
                ? ((payload as { models: unknown[] }).models as Array<{ id?: string }>)
                : [];
    return Array.from(
        new Set(data.map((i) => (i && typeof i === "object" ? String((i as { id?: unknown }).id) : "")).map((s) => s.trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
};

// ── API ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

async function fetchPublicLogs(params: {
    apiKey: string;
    page?: number;
    size?: number;
    days?: number;
    model?: string;
    status?: string;
    signal?: AbortSignal;
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
    const resp = await fetch(url, { signal: params.signal });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `请求失败 (${resp.status})`);
    }
    return resp.json() as Promise<PublicLogsResponse>;
}

async function fetchPublicChartData(params: {
    apiKey: string;
    days?: number;
}): Promise<ChartDataResponse> {
    const base = detectApiBaseFromLocation();
    const qs = new URLSearchParams();
    qs.set("api_key", params.apiKey);
    if (params.days) qs.set("days", String(params.days));
    const url = `${base}${MANAGEMENT_API_PREFIX}/public/usage/chart-data?${qs}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `请求失败 (${resp.status})`);
    }
    return resp.json() as Promise<ChartDataResponse>;
}

async function fetchAvailableModels(apiKey: string): Promise<string[]> {
    const base = detectApiBaseFromLocation();
    const resp = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `请求失败 (${resp.status})`);
    }
    const payload = (await resp.json()) as V1ModelsResponse;
    return extractModelIds(payload);
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
        cost: item.cost ?? 0,
        hasContent: item.has_content,
    };
}


function formatLocalDateLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Columns ─────────────────────────────────────────────────────────────────

function buildLogColumns(
    onContentClick?: (logId: number, tab: "input" | "output") => void,
): VirtualTableColumn<LogRow>[] {
    return [
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
                    <span>{row.inputTokens.toLocaleString()}</span>
                ),
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
                    <span>{row.outputTokens.toLocaleString()}</span>
                ),
        },
        {
            key: "totalTokens",
            label: "总 Token",
            width: "w-28",
            headerClassName: "text-right",
            cellClassName: "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
            render: (row) => <span>{row.totalTokens.toLocaleString()}</span>,
        },
        {
            key: "cost",
            label: "费用",
            width: "w-24",
            headerClassName: "text-right",
            cellClassName: "text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400",
            render: (row) => <span>${row.cost.toFixed(4)}</span>,
        },
    ];
}

// ── Status filter options ───────────────────────────────────────────────────

const STATUS_OPTIONS = [
    { value: "", label: "全部状态", searchText: "全部状态 all" },
    { value: "success", label: "成功", searchText: "成功 success" },
    { value: "failed", label: "失败", searchText: "失败 failed" },
];

// ── Models Tab Content ──────────────────────────────────────────────────────

function ModelsTabContent({
    models,
    loading,
    error,
    searchFilter,
    onSearchChange,
}: {
    models: string[];
    loading: boolean;
    error: string | null;
    searchFilter: string;
    onSearchChange: (v: string) => void;
}) {
    const filteredModels = useMemo(() => {
        const needle = searchFilter.trim().toLowerCase();
        if (!needle) return models;
        return models.filter((id) => id.toLowerCase().includes(needle));
    }, [searchFilter, models]);

    const vendorStats = useMemo(() => {
        const map = new Map<string, number>();
        for (const id of models) {
            const lower = id.toLowerCase();
            let vendor = "其他";
            for (const prefix of Object.keys(VENDOR_COLORS)) {
                if (lower.startsWith(prefix)) { vendor = prefix; break; }
            }
            map.set(vendor, (map.get(vendor) ?? 0) + 1);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [models]);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-neutral-800">
                <div className="flex items-center gap-2.5">
                    <Layers size={15} className="text-slate-500 dark:text-white/40" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">可用模型</h3>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {filteredModels.length}
                    </span>
                    {searchFilter && filteredModels.length !== models.length && (
                        <span className="text-[10px] text-slate-400 dark:text-white/30">/ {models.length}</span>
                    )}
                </div>
                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 pointer-events-none" />
                    <input
                        value={searchFilter}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="搜索模型…"
                        className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-white dark:placeholder:text-white/30 dark:focus:border-indigo-600"
                    />
                </div>
            </div>

            {/* Vendor stats bar */}
            {vendorStats.length > 0 && !loading && (
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-neutral-800/60">
                    {vendorStats.map(([vendor, count]) => {
                        const vc = VENDOR_COLORS[vendor] ?? DEFAULT_VENDOR_COLOR;
                        const iconKey = vendor + "-placeholder";
                        return (
                            <span key={vendor} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${vc.bg} ${vc.text} ${vc.border}`}>
                                <VendorIcon modelId={iconKey} size={12} />
                                {vendor}
                                <span className="tabular-nums">{count}</span>
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                    {error}
                </div>
            )}

            {/* Model tags */}
            <div className="max-h-[480px] overflow-y-auto px-5 py-4">
                {loading && models.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-white/50">
                        <RefreshCw size={14} className="animate-spin mr-2" />
                        加载模型列表…
                    </div>
                ) : filteredModels.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {filteredModels.map((id) => (
                            <ModelTag key={id} id={id} />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-white/30">
                        <Layers size={28} className="mb-2 opacity-40" />
                        <p className="text-sm">{models.length === 0 ? "暂无模型数据" : "无匹配结果"}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Page Component ──────────────────────────────────────────────────────────

export function ApiKeyLookupPage() {
    const {
        state: { mode },
    } = useTheme();
    const isDark = mode === "dark";

    const [apiKeyInput, setApiKeyInput] = useState("");
    const [queriedKey, setQueriedKey] = useState("");

    // ── Content modal state ──
    const [contentModalOpen, setContentModalOpen] = useState(false);
    const [contentModalLogId, setContentModalLogId] = useState<number | null>(null);
    const [contentModalTab, setContentModalTab] = useState<"input" | "output">("input");

    const handleContentClick = useCallback((logId: number, tab: "input" | "output") => {
        setContentModalLogId(logId);
        setContentModalTab(tab);
        setContentModalOpen(true);
    }, []);

    const logColumns = useMemo(() => buildLogColumns(handleContentClick), [handleContentClick]);

    // ── Tab state ──
    const [activeTab, setActiveTab] = useState<"usage" | "logs" | "models">("usage");

    // ── Logs state (infinite scroll) ──
    const [rawItems, setRawItems] = useState<PublicLogItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

    // ── Chart state ──
    const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
    const [chartLoading, setChartLoading] = useState(false);
    const chartCacheRef = useRef<Record<string, ChartDataResponse>>({});

    // ── Models state ──
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [modelsSearchFilter, setModelsSearchFilter] = useState("");

    // ── Filters ──
    const [timeRange, setTimeRange] = useState<TimeRange>(7);
    const [modelQuery, setModelQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    // ── Backend stats + filter options ──
    const [stats, setStats] = useState<{ total: number; success_rate: number; total_tokens: number; total_cost: number }>(
        { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 },
    );
    const [modelOptions, setModelOptions] = useState<string[]>([]);

    // ── Chart controls ──
    const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");
    const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
        "输入 Token": true,
        "输出 Token": true,
        "请求数": true,
    });

    const abortControllerRef = useRef<AbortController | null>(null);
    const fetchIdRef = useRef(0);

    // ================================================================
    //  Logs fetching (with infinite scroll support)
    // ================================================================

    const fetchLogs = useCallback(
        async (key: string, page: number) => {
            if (!key.trim()) return;

            // Abort any in-flight request to prevent stale data
            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const myFetchId = ++fetchIdRef.current;

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
                    signal: controller.signal,
                });

                // Discard response if a newer request has been issued
                if (myFetchId !== fetchIdRef.current) return;

                const newItems = resp.items ?? [];

                if (page === 1) {
                    setRawItems(newItems);
                } else {
                    setRawItems((prev) => [...prev, ...newItems]);
                }

                setTotalCount(resp.total ?? 0);
                setCurrentPage(page);
                setStats(resp.stats ?? { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
                setModelOptions(resp.filters?.models ?? []);
                setLastUpdatedAt(Date.now());
                setQueriedKey(key.trim());
            } catch (err) {
                // Ignore aborted requests
                if (err instanceof DOMException && err.name === "AbortError") return;
                // Ignore stale responses
                if (myFetchId !== fetchIdRef.current) return;

                const message = err instanceof Error ? err.message : "查询失败";
                setError(message);
                if (page === 1) {
                    setRawItems([]);
                    setTotalCount(0);
                    setStats({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
                }
            } finally {
                if (myFetchId === fetchIdRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [timeRange, modelQuery, statusFilter],
    );

    // ================================================================
    //  Chart data fetching (with caching)
    // ================================================================

    const fetchChartDataFn = useCallback(
        async (key: string, days: number) => {
            const cacheKey = `${key}|${days}`;
            if (chartCacheRef.current[cacheKey]) {
                setChartData(chartCacheRef.current[cacheKey]);
                return;
            }
            setChartLoading(true);
            try {
                const data = await fetchPublicChartData({ apiKey: key.trim(), days });
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

    // ================================================================
    //  Derived rows for VirtualTable
    // ================================================================

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

    // ================================================================
    //  Effects
    // ================================================================

    // Refetch page 1 when filters change (only if we have a queried key)
    useEffect(() => {
        if (queriedKey) {
            if (activeTab === "logs") {
                fetchLogs(queriedKey, 1);
            }
        }
    }, [timeRange, modelQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Models fetching ──
    const fetchModelsFn = useCallback(async (key: string) => {
        setModelsLoading(true);
        setModelsError(null);
        try {
            const ids = await fetchAvailableModels(key);
            setAvailableModels(ids);
        } catch (err: unknown) {
            setModelsError(err instanceof Error ? err.message : "加载模型列表失败");
        } finally {
            setModelsLoading(false);
        }
    }, []);

    // When tab changes, fetch the appropriate data
    useEffect(() => {
        if (!queriedKey) return;
        if (activeTab === "usage") {
            void fetchChartDataFn(queriedKey, timeRange);
        } else if (activeTab === "models") {
            void fetchModelsFn(queriedKey);
        } else {
            // Always refetch when switching to logs tab to ensure
            // data matches the current timeRange & filters
            fetchLogs(queriedKey, 1);
        }
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // When time range changes, refetch current tab
    useEffect(() => {
        if (!queriedKey) return;
        chartCacheRef.current = {};
        if (activeTab === "usage") {
            void fetchChartDataFn(queriedKey, timeRange);
        }
    }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

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
                setRawItems([]);
                setCurrentPage(1);
                chartCacheRef.current = {};
                if (activeTab === "usage") {
                    void fetchChartDataFn(val, timeRange);
                    fetchLogs(val, 1);
                } else if (activeTab === "models") {
                    void fetchModelsFn(val);
                } else {
                    fetchLogs(val, 1);
                    void fetchChartDataFn(val, timeRange);
                }
            }
        },
        [apiKeyInput, activeTab, timeRange, fetchLogs, fetchChartDataFn, fetchModelsFn],
    );

    const handleRefresh = useCallback(() => {
        if (queriedKey) {
            if (activeTab === "usage") {
                chartCacheRef.current = {};
                void fetchChartDataFn(queriedKey, timeRange);
            } else if (activeTab === "models") {
                void fetchModelsFn(queriedKey);
            } else {
                fetchLogs(queriedKey, 1);
            }
        }
    }, [queriedKey, activeTab, timeRange, fetchLogs, fetchChartDataFn, fetchModelsFn]);

    // Read api_key from URL on mount
    useEffect(() => {
        const searchStr = window.location.search || window.location.hash.split("?")[1] || "";
        const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr : `?${searchStr}`);
        const key = params.get("api_key") ?? params.get("key") ?? "";
        if (key) {
            setApiKeyInput(key);
            fetchLogs(key, 1);
            void fetchChartDataFn(key, timeRange);
            void fetchModelsFn(key);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ================================================================
    //  Chart computations
    // ================================================================

    const chartStats = chartData?.stats;

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

    // ── Model filter options for SearchableSelect ──
    const modelFilterOptions = useMemo(
        () => [
            { value: "", label: "全部模型", searchText: "全部模型 all" },
            ...modelOptions.map((m) => ({ value: m, label: m, searchText: m })),
        ],
        [modelOptions],
    );



    const lastUpdatedText = useMemo(() => {
        if (!lastUpdatedAt) return "";
        const d = new Date(lastUpdatedAt);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }, [lastUpdatedAt]);

    // ================================================================
    //  Render
    // ================================================================

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
                                    type="password"
                                    id="apikey-input"
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="输入 API Key 查询使用记录"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:placeholder:text-white/30"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            id="apikey-lookup-submit"
                            disabled={!apiKeyInput.trim() || loading}
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
                        >
                            {loading && (
                                <span
                                    className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none motion-safe:animate-spin dark:border-neutral-950/30 dark:border-t-neutral-950"
                                    aria-hidden="true"
                                />
                            )}
                            查询
                        </button>
                    </form>
                </section>

                {/* Error */}
                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {/* Results */}
                {queriedKey && !error && (
                    <>
                        {/* Tab + Time range + Refresh */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "usage" | "logs" | "models")}>
                                    <TabsList>
                                        <TabsTrigger value="usage">使用统计</TabsTrigger>
                                        <TabsTrigger value="logs">请求日志</TabsTrigger>
                                        <TabsTrigger value="models">可用模型</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                {activeTab !== "models" && (
                                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleRefresh}
                                    disabled={loading || chartLoading || modelsLoading}
                                    className="inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
                                >
                                    <RefreshCw size={13} className={(loading || chartLoading || modelsLoading) ? "animate-spin" : ""} />
                                    刷新
                                </button>
                            </div>
                        </div>

                        {/* ========== Usage Tab ========== */}
                        {activeTab === "usage" && (
                            <Reveal>
                                <div className="space-y-5">
                                    {/* KPI cards */}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                        <KpiCard
                                            title="总请求数"
                                            icon={Activity}
                                            hint={`最近 ${timeRange} 天`}
                                            value={<AnimatedNumber value={chartStats?.total ?? 0} format={formatNumber} />}
                                        />
                                        <KpiCard
                                            title="成功率"
                                            icon={ShieldCheck}
                                            hint={`最近 ${timeRange} 天`}
                                            value={<AnimatedNumber value={chartStats?.success_rate ?? 0} format={formatRate} />}
                                        />
                                        <KpiCard
                                            title="Token 总量"
                                            icon={Sigma}
                                            hint={`最近 ${timeRange} 天`}
                                            value={<AnimatedNumber value={chartStats?.total_tokens ?? 0} format={formatNumber} />}
                                        />
                                        <KpiCard
                                            title="总费用"
                                            icon={Coins}
                                            hint={`最近 ${timeRange} 天`}
                                            value={<AnimatedNumber value={chartStats?.total_cost ?? 0} format={(v) => `$${v.toFixed(4)}`} />}
                                        />
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
                                                        <span className="h-5 w-5 rounded-full border-2 border-slate-300/80 border-t-slate-900 animate-spin dark:border-white/20 dark:border-t-white/85" />
                                                    </div>
                                                )}
                                                {modelDistributionData.length > 0 ? (
                                                    <div className="flex flex-col items-center gap-4 sm:flex-row">
                                                        <EChart
                                                            option={modelDistributionOption}
                                                            className="h-52 w-52 shrink-0 sm:h-48 sm:w-48"
                                                        />
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                                                            {modelDistributionLegend.map((item) => (
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
                                                ) : !chartLoading ? (
                                                    <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                                                        暂无数据
                                                    </p>
                                                ) : null}
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
                                                        <span className="h-5 w-5 rounded-full border-2 border-slate-300/80 border-t-slate-900 animate-spin dark:border-white/20 dark:border-t-white/85" />
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
                                                ) : !chartLoading ? (
                                                    <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                                                        暂无数据
                                                    </p>
                                                ) : null}
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </Reveal>
                        )}

                        {/* ========== Logs Tab ========== */}
                        {activeTab === "logs" && (
                            <Reveal>
                                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                                    {/* Filter bar + stats */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-neutral-800/60">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <SearchableSelect
                                                value={statusFilter}
                                                onChange={setStatusFilter}
                                                options={STATUS_OPTIONS}
                                                placeholder="全部状态"
                                                aria-label="状态筛选"
                                            />
                                            {modelOptions.length > 0 && (
                                                <SearchableSelect
                                                    value={modelQuery}
                                                    onChange={setModelQuery}
                                                    options={modelFilterOptions}
                                                    placeholder="全部模型"
                                                    aria-label="模型筛选"
                                                />
                                            )}
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/55">
                                            <Filter size={12} aria-hidden="true" />
                                            <span className="font-mono tabular-nums">{stats.total.toLocaleString()}</span> 条
                                            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
                                            成功率 <span className="font-mono tabular-nums">{stats.success_rate.toFixed(1)}%</span>
                                            <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
                                            Token <span className="font-mono tabular-nums">{stats.total_tokens.toLocaleString()}</span>
                                            {lastUpdatedText && (
                                                <>
                                                    <span className="text-slate-300 dark:text-white/10" aria-hidden="true">·</span>
                                                    <span className="text-slate-400 dark:text-white/40">{lastUpdatedText}</span>
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {/* VirtualTable */}
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
                            </Reveal>
                        )}

                        {/* ========== Models Tab ========== */}
                        {activeTab === "models" && (
                            <Reveal>
                                <ModelsTabContent
                                    models={availableModels}
                                    loading={modelsLoading}
                                    error={modelsError}
                                    searchFilter={modelsSearchFilter}
                                    onSearchChange={setModelsSearchFilter}
                                />
                            </Reveal>
                        )}
                    </>
                )}

                {/* Log Content Modal */}
                <LogContentModal
                    open={contentModalOpen}
                    logId={contentModalLogId}
                    initialTab={contentModalTab}
                    onClose={() => setContentModalOpen(false)}
                    fetchFn={queriedKey ? async (id: number) => {
                        const base = detectApiBaseFromLocation();
                        const url = `${base}${MANAGEMENT_API_PREFIX}/public/usage/logs/${id}/content?api_key=${encodeURIComponent(queriedKey)}`;
                        const resp = await fetch(url);
                        if (!resp.ok) {
                            const text = await resp.text().catch(() => "");
                            throw new Error(text || `请求失败 (${resp.status})`);
                        }
                        return resp.json();
                    } : undefined}
                />

                {/* Empty state */}
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
