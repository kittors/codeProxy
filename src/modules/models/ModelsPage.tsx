import { useCallback, useEffect, useMemo, useState } from "react";
import {
    RefreshCw,
    Cpu,
    DollarSign,
    Activity,
    Check,
    Copy,
    Search,
} from "lucide-react";
import { useTheme } from "@/modules/ui/ThemeProvider";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import { Modal } from "@/modules/ui/Modal";
import { apiClient } from "@/lib/http/client";

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

/* ─── types ─── */

interface ModelPricing {
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    cachedPricePerMillion: number;
}

interface ModelItem {
    id: string;
    owned_by?: string;
    pricing: ModelPricing;
}

/* ─── Vendor icons ─── */

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

const VENDOR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    claude: { bg: "bg-orange-50 dark:bg-orange-950/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200/60 dark:border-orange-800/30" },
    gpt: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    o1: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    o3: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    o4: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    gemini: { bg: "bg-blue-50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200/60 dark:border-blue-800/30" },
    deepseek: { bg: "bg-cyan-50 dark:bg-cyan-950/20", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200/60 dark:border-cyan-800/30" },
    qwen: { bg: "bg-violet-50 dark:bg-violet-950/20", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200/60 dark:border-violet-800/30" },
    minimax: { bg: "bg-sky-50 dark:bg-sky-950/20", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200/60 dark:border-sky-800/30" },
    grok: { bg: "bg-slate-50 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200/60 dark:border-slate-700/30" },
    kimi: { bg: "bg-slate-50 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200/60 dark:border-slate-700/30" },
    codex: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/60 dark:border-emerald-800/30" },
    glm: { bg: "bg-blue-50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200/60 dark:border-blue-800/30" },
    kiro: { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200/60 dark:border-amber-800/30" },
};

const DEFAULT_VENDOR_COLOR = { bg: "bg-slate-50 dark:bg-neutral-900/40", text: "text-slate-600 dark:text-slate-300", border: "border-slate-200/60 dark:border-neutral-700/40" };

function getVendorPrefix(modelId: string): string {
    const lower = modelId.toLowerCase();
    for (const prefix of Object.keys(VENDOR_ICONS)) {
        if (lower.startsWith(prefix)) return prefix;
    }
    return "";
}

function getVendorColor(modelId: string) {
    const lower = modelId.toLowerCase();
    for (const [prefix, color] of Object.entries(VENDOR_COLORS)) {
        if (lower.startsWith(prefix)) return color;
    }
    return DEFAULT_VENDOR_COLOR;
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

/* ─── helpers ─── */

const formatNumber = (n: number) => n.toLocaleString();
const formatCurrency = (n: number) => `$${n.toFixed(4)}`;
const emptyPricing: ModelPricing = { inputPricePerMillion: 0, outputPricePerMillion: 0, cachedPricePerMillion: 0 };

/* ─── API calls ─── */

async function fetchModels(): Promise<ModelItem[]> {
    const data = await apiClient.get<{
        object: string; data: Array<{
            id?: string;
            owned_by?: string;
            pricing?: { input_price_per_million?: number; output_price_per_million?: number; cached_price_per_million?: number };
        }>
    }>("/models");
    const rawModels = data?.data ?? [];
    return rawModels
        .filter((m) => m.id)
        .map((m) => ({
            id: m.id!,
            owned_by: m.owned_by,
            pricing: m.pricing
                ? {
                    inputPricePerMillion: m.pricing.input_price_per_million ?? 0,
                    outputPricePerMillion: m.pricing.output_price_per_million ?? 0,
                    cachedPricePerMillion: m.pricing.cached_price_per_million ?? 0,
                }
                : { ...emptyPricing },
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

async function savePricingToBackend(items: Array<{ model_id: string; input_price_per_million: number; output_price_per_million: number; cached_price_per_million: number }>) {
    await apiClient.put("/model-pricing", { items });
}

/* ─── component ─── */

export function ModelsPage() {
    const { notify } = useToast();
    const { state: { mode } } = useTheme();
    const _isDark = mode === "dark";

    const [models, setModels] = useState<ModelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchFilter, setSearchFilter] = useState("");
    const [totalCost, setTotalCost] = useState(0);

    // Pricing modal state
    const [pricingModel, setPricingModel] = useState<string | null>(null);
    const [editInputPrice, setEditInputPrice] = useState("");
    const [editOutputPrice, setEditOutputPrice] = useState("");
    const [editCachedPrice, setEditCachedPrice] = useState("");
    const [savingPricing, setSavingPricing] = useState(false);

    const loadModels = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchModels();
            setModels(data);
            // Fetch total cost from usage stats
            try {
                const usageData = await apiClient.get<{ stats?: { total_cost?: number } }>("/usage/logs?days=9999&size=1");
                setTotalCost(usageData?.stats?.total_cost ?? 0);
            } catch {
                // ignore cost fetch failure
            }
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "加载模型数据失败" });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        void loadModels();
    }, [loadModels]);

    const filteredModels = useMemo(() => {
        if (!searchFilter.trim()) return models;
        const needle = searchFilter.trim().toLowerCase();
        return models.filter((m) => m.id.toLowerCase().includes(needle));
    }, [models, searchFilter]);

    const totalStats = useMemo(() => {
        let pricedCount = 0;
        models.forEach((m) => {
            if (m.pricing.inputPricePerMillion > 0 || m.pricing.outputPricePerMillion > 0) pricedCount++;
        });
        return { modelCount: models.length, pricedCount };
    }, [models]);



    /* ─── pricing modal ─── */

    const handleOpenPricing = (modelId: string) => {
        const model = models.find((m) => m.id === modelId);
        const existing = model?.pricing || emptyPricing;
        setEditInputPrice(existing.inputPricePerMillion ? existing.inputPricePerMillion.toString() : "");
        setEditOutputPrice(existing.outputPricePerMillion ? existing.outputPricePerMillion.toString() : "");
        setEditCachedPrice(existing.cachedPricePerMillion ? existing.cachedPricePerMillion.toString() : "");
        setPricingModel(modelId);
    };

    const handleSavePricing = async () => {
        if (!pricingModel) return;
        setSavingPricing(true);
        try {
            const input = parseFloat(editInputPrice) || 0;
            const output = parseFloat(editOutputPrice) || 0;
            const cached = parseFloat(editCachedPrice) || 0;

            await savePricingToBackend([{
                model_id: pricingModel,
                input_price_per_million: input,
                output_price_per_million: output,
                cached_price_per_million: cached,
            }]);

            // Update local state
            setModels((prev) =>
                prev.map((m) =>
                    m.id === pricingModel
                        ? { ...m, pricing: { inputPricePerMillion: input, outputPricePerMillion: output, cachedPricePerMillion: cached } }
                        : m,
                ),
            );
            setPricingModel(null);
            notify({ type: "success", message: "定价已保存到数据库" });
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
        } finally {
            setSavingPricing(false);
        }
    };

    const formatPricingBadge = (p: ModelPricing) => {
        if (p.inputPricePerMillion === 0 && p.outputPricePerMillion === 0 && p.cachedPricePerMillion === 0) {
            return "未定价";
        }
        return `$${p.inputPricePerMillion} / $${p.outputPricePerMillion}`;
    };

    return (
        <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <Cpu size={14} /> 可用模型
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {totalStats.modelCount}
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <DollarSign size={14} /> 已定价模型
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {totalStats.pricedCount}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">共 {totalStats.modelCount} 个模型</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <Activity size={14} /> 额度消耗
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        ${totalCost.toFixed(4)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">累计总费用 (USD)</div>
                </div>
            </div>

            <Card
                title="模型定价管理"
                description="管理所有可用模型的定价配置。定价数据持久化存储在数据库中，用于计算请求费用和执行消费限额。"
                actions={
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/30 pointer-events-none" />
                            <input
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                placeholder="搜索模型…"
                                className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-white dark:placeholder:text-white/30 dark:focus:border-indigo-600"
                            />
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => void loadModels()} disabled={loading}>
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            刷新
                        </Button>
                    </div>
                }
                loading={loading}
            >
                {filteredModels.length === 0 ? (
                    <EmptyState
                        title="暂无模型数据"
                        description={searchFilter ? "无匹配结果，请调整搜索条件。" : "尚未检测到可用模型。"}
                        icon={<Cpu size={32} className="text-slate-400" />}
                    />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-neutral-800">
                        <table className="w-full min-w-[800px] table-fixed border-separate border-spacing-0 text-sm">
                            <thead className="bg-white/95 backdrop-blur dark:bg-neutral-950/75">
                                <tr className="h-11 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                                    <th className="w-80 border-b border-slate-200 px-4 dark:border-neutral-800">模型</th>
                                    <th className="w-36 border-b border-slate-200 px-4 text-right dark:border-neutral-800">输入价格</th>
                                    <th className="w-36 border-b border-slate-200 px-4 text-right dark:border-neutral-800">输出价格</th>
                                    <th className="w-36 border-b border-slate-200 px-4 text-right dark:border-neutral-800">缓存价格</th>
                                    <th className="w-32 border-b border-slate-200 px-4 text-center dark:border-neutral-800">状态</th>
                                    <th className="w-20 border-b border-slate-200 px-4 dark:border-neutral-800">操作</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-900 dark:text-white">
                                {filteredModels.map((model) => {
                                    const hasPricing = model.pricing.inputPricePerMillion > 0 || model.pricing.outputPricePerMillion > 0;
                                    const vc = getVendorColor(model.id);
                                    return (
                                        <tr key={model.id} className="h-10 transition hover:bg-slate-50/70 dark:hover:bg-white/5">
                                            <td className="border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <VendorIcon modelId={model.id} size={16} />
                                                    <OverflowTooltip content={model.id} className="block min-w-0">
                                                        <span className="block min-w-0 truncate font-medium">{model.id}</span>
                                                    </OverflowTooltip>
                                                </div>
                                            </td>
                                            <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                                {model.pricing.inputPricePerMillion > 0 ? `$${model.pricing.inputPricePerMillion}` : "$0"}
                                            </td>
                                            <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                                {model.pricing.outputPricePerMillion > 0 ? `$${model.pricing.outputPricePerMillion}` : "$0"}
                                            </td>
                                            <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                                {model.pricing.cachedPricePerMillion > 0 ? `$${model.pricing.cachedPricePerMillion}` : "$0"}
                                            </td>
                                            <td className="border-b border-slate-100 px-4 text-center align-middle dark:border-neutral-900">
                                                {hasPricing ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                                                        <Check size={10} /> 已定价
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:bg-neutral-800 dark:text-white/40">
                                                        未定价
                                                    </span>
                                                )}
                                            </td>
                                            <td className="border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                                <button
                                                    onClick={() => handleOpenPricing(model.id)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                                                    title="设置定价"
                                                >
                                                    <DollarSign size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Pricing Modal */}
            <Modal
                open={pricingModel !== null}
                onClose={() => setPricingModel(null)}
                title="设置模型定价"
                description={pricingModel ? `为 ${pricingModel} 设置每百万 Token 价格（美元）` : ""}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPricingModel(null)}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={() => void handleSavePricing()} disabled={savingPricing}>
                            {savingPricing ? "保存中…" : "保存"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    {pricingModel && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                            <div className="flex items-center gap-2">
                                <VendorIcon modelId={pricingModel} size={18} />
                                <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">{pricingModel}</span>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                            输入 Token 价格（$/百万 Token）
                        </label>
                        <input
                            type="number"
                            value={editInputPrice}
                            onChange={(e) => setEditInputPrice(e.target.value)}
                            placeholder="例如：3.00"
                            step="0.01"
                            min={0}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                            输出 Token 价格（$/百万 Token）
                        </label>
                        <input
                            type="number"
                            value={editOutputPrice}
                            onChange={(e) => setEditOutputPrice(e.target.value)}
                            placeholder="例如：15.00"
                            step="0.01"
                            min={0}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                            缓存 Token 价格（$/百万 Token）
                        </label>
                        <input
                            type="number"
                            value={editCachedPrice}
                            onChange={(e) => setEditCachedPrice(e.target.value)}
                            placeholder="例如：1.50（通常比输入便宜）"
                            step="0.01"
                            min={0}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
