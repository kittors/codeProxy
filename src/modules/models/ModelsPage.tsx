import { useCallback, useEffect, useMemo, useState } from "react";
import {
    RefreshCw,
    Cpu,
    DollarSign,
    Activity,
} from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageData } from "@/lib/http/types";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import { Modal } from "@/modules/ui/Modal";

/* ─── types ─── */

interface ModelPricing {
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    cachedPricePerMillion: number;
}

interface ModelStats {
    id: string;
    requestCount: number;
    successCount: number;
    failedCount: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    lastUsed: string;
    pricing: ModelPricing;
    estimatedCost: number;
}

/* ─── localStorage helpers ─── */

const PRICING_STORAGE_KEY = "cli-proxy-model-pricing";

const loadPricing = (): Record<string, ModelPricing> => {
    try {
        const raw = localStorage.getItem(PRICING_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const savePricing = (data: Record<string, ModelPricing>) => {
    localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(data));
};

/* ─── helpers ─── */

const formatNumber = (n: number) => n.toLocaleString();
const formatCurrency = (n: number) => (n === 0 ? "—" : `$${n.toFixed(4)}`);

const createEmptyUsage = (): UsageData => ({ apis: {} });

const emptyPricing: ModelPricing = { inputPricePerMillion: 0, outputPricePerMillion: 0, cachedPricePerMillion: 0 };

/* ─── component ─── */

export function ModelsPage() {
    const { notify } = useToast();

    const [usage, setUsage] = useState<UsageData>(createEmptyUsage);
    const [loading, setLoading] = useState(true);
    const [pricingMap, setPricingMap] = useState<Record<string, ModelPricing>>(loadPricing);

    // Pricing modal state
    const [pricingModel, setPricingModel] = useState<string | null>(null);
    const [editInputPrice, setEditInputPrice] = useState("");
    const [editOutputPrice, setEditOutputPrice] = useState("");
    const [editCachedPrice, setEditCachedPrice] = useState("");

    const loadUsage = useCallback(async () => {
        setLoading(true);
        try {
            const data = await usageApi.getUsage();
            setUsage(data);
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "加载模型数据失败" });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        void loadUsage();
    }, [loadUsage]);

    const models = useMemo<ModelStats[]>(() => {
        const modelMap = new Map<
            string,
            { requestCount: number; successCount: number; failedCount: number; inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number; lastUsed: string }
        >();

        Object.values(usage.apis ?? {}).forEach((apiData) => {
            Object.entries(apiData.models ?? {}).forEach(([model, modelData]) => {
                const existing = modelMap.get(model) || {
                    requestCount: 0,
                    successCount: 0,
                    failedCount: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    lastUsed: "",
                };

                (modelData.details ?? []).forEach((detail: any) => {
                    existing.requestCount++;
                    if (detail.failed) {
                        existing.failedCount++;
                    } else {
                        existing.successCount++;
                    }
                    const tokens = detail.tokens;
                    if (tokens) {
                        existing.inputTokens += tokens.input_tokens ?? 0;
                        existing.outputTokens += tokens.output_tokens ?? 0;
                        existing.cachedTokens += tokens.cached_tokens ?? 0;
                        existing.totalTokens += tokens.total_tokens ?? (tokens.input_tokens ?? 0) + (tokens.output_tokens ?? 0);
                    }
                    if (detail.timestamp && detail.timestamp > existing.lastUsed) {
                        existing.lastUsed = detail.timestamp;
                    }
                });

                modelMap.set(model, existing);
            });
        });

        return Array.from(modelMap.entries())
            .map(([id, stats]) => {
                const pricing = pricingMap[id] || emptyPricing;
                const estimatedCost =
                    (stats.inputTokens / 1_000_000) * pricing.inputPricePerMillion +
                    (stats.outputTokens / 1_000_000) * pricing.outputPricePerMillion +
                    (stats.cachedTokens / 1_000_000) * pricing.cachedPricePerMillion;
                return { id, ...stats, pricing, estimatedCost };
            })
            .sort((a, b) => b.requestCount - a.requestCount);
    }, [usage, pricingMap]);

    const totalStats = useMemo(() => {
        let requests = 0;
        let tokens = 0;
        let cost = 0;
        models.forEach((m) => {
            requests += m.requestCount;
            tokens += m.totalTokens;
            cost += m.estimatedCost;
        });
        return { requests, tokens, cost, modelCount: models.length };
    }, [models]);

    /* ─── pricing modal ─── */

    const handleOpenPricing = (modelId: string) => {
        const existing = pricingMap[modelId] || emptyPricing;
        setEditInputPrice(existing.inputPricePerMillion ? existing.inputPricePerMillion.toString() : "");
        setEditOutputPrice(existing.outputPricePerMillion ? existing.outputPricePerMillion.toString() : "");
        setEditCachedPrice(existing.cachedPricePerMillion ? existing.cachedPricePerMillion.toString() : "");
        setPricingModel(modelId);
    };

    const handleSavePricing = () => {
        if (!pricingModel) return;
        const updated = {
            ...pricingMap,
            [pricingModel]: {
                inputPricePerMillion: parseFloat(editInputPrice) || 0,
                outputPricePerMillion: parseFloat(editOutputPrice) || 0,
                cachedPricePerMillion: parseFloat(editCachedPrice) || 0,
            },
        };
        setPricingMap(updated);
        savePricing(updated);
        setPricingModel(null);
        notify({ type: "success", message: "定价已保存" });
    };

    const formatLastUsed = (iso: string) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return iso;
        }
    };

    const pricingModelStats = pricingModel ? models.find((m) => m.id === pricingModel) : null;

    return (
        <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <Cpu size={14} /> 模型数量
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {totalStats.modelCount}
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <Activity size={14} /> 总请求数
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatNumber(totalStats.requests)}
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <Cpu size={14} /> 总 Token
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatNumber(totalStats.tokens)}
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
                        <DollarSign size={14} /> 预估费用
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {totalStats.cost > 0 ? `$${totalStats.cost.toFixed(2)}` : "—"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">基于手动设置定价</div>
                </div>
            </div>

            <Card
                title="模型列表"
                description="所有使用过的模型及其聚合统计。点击定价按钮可为每个模型设置 输入/输出/缓存 Token 价格。"
                actions={
                    <Button variant="secondary" size="sm" onClick={() => void loadUsage()} disabled={loading}>
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        刷新
                    </Button>
                }
                loading={loading}
            >
                {models.length === 0 ? (
                    <EmptyState
                        title="暂无模型数据"
                        description="尚未检测到任何模型的使用记录。"
                        icon={<Cpu size={32} className="text-slate-400" />}
                    />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-neutral-800">
                        <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 text-sm">
                            <thead className="bg-white/95 backdrop-blur dark:bg-neutral-950/75">
                                <tr className="h-11 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                                    <th className="w-64 border-b border-slate-200 px-4 dark:border-neutral-800">模型</th>
                                    <th className="w-20 border-b border-slate-200 px-4 text-right dark:border-neutral-800">请求数</th>
                                    <th className="w-20 border-b border-slate-200 px-4 text-right dark:border-neutral-800">成功</th>
                                    <th className="w-20 border-b border-slate-200 px-4 text-right dark:border-neutral-800">失败</th>
                                    <th className="w-28 border-b border-slate-200 px-4 text-right dark:border-neutral-800">输入</th>
                                    <th className="w-28 border-b border-slate-200 px-4 text-right dark:border-neutral-800">输出</th>
                                    <th className="w-24 border-b border-slate-200 px-4 text-right dark:border-neutral-800">缓存</th>
                                    <th className="w-28 border-b border-slate-200 px-4 text-right dark:border-neutral-800">预估费用</th>
                                    <th className="w-32 border-b border-slate-200 px-4 dark:border-neutral-800">最后使用</th>
                                    <th className="w-20 border-b border-slate-200 px-4 dark:border-neutral-800">定价</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-900 dark:text-white">
                                {models.map((model) => (
                                    <tr key={model.id} className="h-10 transition hover:bg-slate-50/70 dark:hover:bg-white/5">
                                        <td className="border-b border-slate-100 px-4 align-middle dark:border-neutral-900">
                                            <OverflowTooltip content={model.id} className="block min-w-0">
                                                <span className="block min-w-0 truncate font-medium">{model.id}</span>
                                            </OverflowTooltip>
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                            {formatNumber(model.requestCount)}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums text-emerald-600 dark:border-neutral-900 dark:text-emerald-400">
                                            {formatNumber(model.successCount)}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums text-rose-600 dark:border-neutral-900 dark:text-rose-400">
                                            {model.failedCount > 0 ? formatNumber(model.failedCount) : "—"}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                            {formatNumber(model.inputTokens)}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                            {formatNumber(model.outputTokens)}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                            {model.cachedTokens > 0 ? formatNumber(model.cachedTokens) : "—"}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 text-right align-middle font-mono text-xs tabular-nums dark:border-neutral-900">
                                            {formatCurrency(model.estimatedCost)}
                                        </td>
                                        <td className="border-b border-slate-100 px-4 align-middle text-xs text-slate-500 dark:border-neutral-900 dark:text-white/50">
                                            {formatLastUsed(model.lastUsed)}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Pricing Modal */}
            <Modal
                open={pricingModel !== null}
                onClose={() => setPricingModel(null)}
                title={`设置模型定价`}
                description={pricingModel ? `为 ${pricingModel} 设置每百万 Token 价格（美元）` : ""}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPricingModel(null)}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={handleSavePricing}>
                            保存
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    {pricingModel && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                            <div className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">{pricingModel}</div>
                            {pricingModelStats && (
                                <div className="mt-1 text-xs text-indigo-700/70 dark:text-indigo-400/60">
                                    输入 {formatNumber(pricingModelStats.inputTokens)} · 输出 {formatNumber(pricingModelStats.outputTokens)} · 缓存 {formatNumber(pricingModelStats.cachedTokens)} Token
                                </div>
                            )}
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

                    {pricingModelStats && (editInputPrice || editOutputPrice || editCachedPrice) && (
                        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                            <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">预估费用</div>
                            <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {formatCurrency(
                                    (pricingModelStats.inputTokens / 1_000_000) * (parseFloat(editInputPrice) || 0) +
                                    (pricingModelStats.outputTokens / 1_000_000) * (parseFloat(editOutputPrice) || 0) +
                                    (pricingModelStats.cachedTokens / 1_000_000) * (parseFloat(editCachedPrice) || 0)
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
