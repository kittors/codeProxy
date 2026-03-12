import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Plus,
    Copy,
    Pencil,
    Trash2,
    KeyRound,
    ShieldCheck,
    RefreshCw,
    Infinity,
    BarChart3,
    Power,
    Info,
} from "lucide-react";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { usageApi } from "@/lib/http/apis";
import type { UsageData } from "@/lib/http/types";
import { apiClient } from "@/lib/http/client";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { Modal } from "@/modules/ui/Modal";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import { MultiSelect, type MultiSelectOption } from "@/modules/ui/MultiSelect";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { useAuthStore } from "@/stores/useAuthStore";
import { normalizeApiBase } from "@/lib/connection";

// Vendor SVG icons
import iconClaude from "@/assets/icons/claude.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconDeepseek from "@/assets/icons/deepseek.svg";
import iconQwen from "@/assets/icons/qwen.svg";
import iconMinimax from "@/assets/icons/minimax.svg";
import iconGrok from "@/assets/icons/grok.svg";
import iconKimiLight from "@/assets/icons/kimi-light.svg";
import iconKimiDark from "@/assets/icons/kimi-dark.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGlm from "@/assets/icons/glm.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconIflow from "@/assets/icons/iflow.svg";

/* ─── vendor icon helpers ─── */

const VENDOR_ICONS: Record<string, { light: string; dark: string }> = {
    claude: { light: iconClaude, dark: iconClaude },
    gpt: { light: iconOpenai, dark: iconOpenai },
    o1: { light: iconOpenai, dark: iconOpenai },
    o3: { light: iconOpenai, dark: iconOpenai },
    o4: { light: iconOpenai, dark: iconOpenai },
    gemini: { light: iconGemini, dark: iconGemini },
    deepseek: { light: iconDeepseek, dark: iconDeepseek },
    qwen: { light: iconQwen, dark: iconQwen },
    minimax: { light: iconMinimax, dark: iconMinimax },
    grok: { light: iconGrok, dark: iconGrok },
    kimi: { light: iconKimiLight, dark: iconKimiDark },
    codex: { light: iconCodex, dark: iconCodex },
    glm: { light: iconGlm, dark: iconGlm },
    kiro: { light: iconKiro, dark: iconKiro },
    vertex: { light: iconVertex, dark: iconVertex },
    iflow: { light: iconIflow, dark: iconIflow },
};

function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
    const lower = modelId.toLowerCase();
    let icons: { light: string; dark: string } | null = null;
    for (const prefix of Object.keys(VENDOR_ICONS)) {
        if (lower.startsWith(prefix)) { icons = VENDOR_ICONS[prefix]; break; }
    }
    if (!icons) return null;
    return (
        <>
            <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
            <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
        </>
    );
}

/* ─── helpers ─── */

const generateKey = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "sk-";
    for (let i = 0; i < 32; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
};

const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.slice(0, 5) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-3);
};

const formatDate = (iso: string | undefined) => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
};

const formatLimit = (limit: number | undefined) => {
    if (!limit || limit <= 0) return null;
    return limit.toLocaleString();
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

const readLatencyText = (detail: Record<string, unknown>): string => {
    const candidates = [
        detail["latency_ms"],
        detail["latencyMs"],
        detail["duration_ms"],
        detail["latency"],
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "number") return formatLatencyMs(candidate);
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "--";
};

/* ─── usage detail row type ─── */

interface UsageLogRow {
    id: string;
    timestamp: string;
    model: string;
    failed: boolean;
    latencyText: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

const buildUsageRows = (usage: UsageData, apiKey: string): UsageLogRow[] => {
    const apiData = (usage.apis ?? {})[apiKey];
    if (!apiData) return [];
    const rows: UsageLogRow[] = [];
    let id = 0;
    Object.entries(apiData.models ?? {}).forEach(([model, modelData]) => {
        (modelData.details ?? []).forEach((detail: any) => {
            const tokens = detail.tokens;
            rows.push({
                id: `${id++}`,
                timestamp: detail.timestamp ?? "",
                model,
                failed: Boolean(detail.failed),
                latencyText: readLatencyText(detail),
                inputTokens: tokens?.input_tokens ?? 0,
                outputTokens: tokens?.output_tokens ?? 0,
                totalTokens: tokens?.total_tokens ?? (tokens?.input_tokens ?? 0) + (tokens?.output_tokens ?? 0),
            });
        });
    });
    return rows.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
    });
};

/* ─── types ─── */

interface FormValues {
    name: string;
    key: string;
    dailyLimit: string;
    totalQuota: string;
    concurrencyLimit: string;
    rpmLimit: string;
    tpmLimit: string;
    allowedModels: string[];
    systemPrompt: string;
}

/* ─── component ─── */

export function ApiKeysPage() {
    const { t } = useTranslation();
    const { notify } = useToast();

    const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
    const [usageViewKey, setUsageViewKey] = useState<string | null>(null);
    const [usageViewName, setUsageViewName] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [usage, setUsage] = useState<UsageData>({ apis: {} });
    const [usageLoading, setUsageLoading] = useState(false);
    const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>([]);
    const [form, setForm] = useState<FormValues>({
        name: "",
        key: "",
        dailyLimit: "",
        totalQuota: "",
        concurrencyLimit: "",
        rpmLimit: "",
        tpmLimit: "",
        allowedModels: [],
        systemPrompt: "",
    });

    /* ─── load models ─── */

    const loadModels = useCallback(async () => {
        try {
            const data = await apiClient.get<{ data?: Array<{ id?: string }> }>("/models");
            if (data?.data) {
                const opts: MultiSelectOption[] = data.data
                    .filter((m) => m.id)
                    .map((m) => ({
                        value: m.id!,
                        label: m.id!,
                        icon: <VendorIcon modelId={m.id!} size={14} />,
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label));
                setAvailableModels(opts);
            }
        } catch {
            // silent — models list is supplementary
        }
    }, []);

    /* ─── load ─── */

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const [entriesData, legacyKeys] = await Promise.all([
                apiKeyEntriesApi.list(),
                apiKeysApi.list().catch(() => [] as string[]),
            ]);

            // Auto-migrate: old api-keys not in api-key-entries get added as unnamed entries
            const entryKeySet = new Set(entriesData.map((e) => e.key));
            const newEntries = legacyKeys
                .filter((k: string) => k && !entryKeySet.has(k))
                .map((k: string): ApiKeyEntry => ({ key: k, "created-at": new Date().toISOString() }));

            let finalEntries: ApiKeyEntry[];
            if (newEntries.length > 0) {
                const merged = [...entriesData, ...newEntries];
                try {
                    await apiKeyEntriesApi.replace(merged);
                    notify({ type: "success", message: t("api_keys_page.auto_import", { count: newEntries.length }) });
                } catch {
                    // silent
                }
                finalEntries = merged;
            } else {
                finalEntries = entriesData;
            }
            setEntries(finalEntries);
            // Load models after entries are available (needs a valid API key)
            void loadModels();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.load_failed") });
        } finally {
            setLoading(false);
        }
    }, [notify, loadModels]);

    const loadUsage = useCallback(async () => {
        setUsageLoading(true);
        try {
            const data = await usageApi.getUsage();
            setUsage(data);
        } catch {
            // silent
        } finally {
            setUsageLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEntries();
        void loadUsage();
    }, [loadEntries, loadUsage]);

    /* ─── toggle disable ─── */

    const handleToggleDisable = async (index: number) => {
        const entry = entries[index];
        const updated = { ...entry, disabled: !entry.disabled };
        const newEntries = [...entries];
        newEntries[index] = updated;

        try {
            await apiKeyEntriesApi.replace(newEntries);
            setEntries(newEntries);
            notify({
                type: "success",
                message: updated.disabled ? t("api_keys_page.disabled_toast", { name: entry.name || t("api_keys_page.unnamed") }) : t("api_keys_page.enabled_toast", { name: entry.name || t("api_keys_page.unnamed") }),
            });
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.operation_failed") });
        }
    };

    /* ─── create ─── */

    const handleOpenCreate = () => {
        setForm({
            name: "",
            key: generateKey(),
            dailyLimit: "",
            totalQuota: "",
            concurrencyLimit: "",
            rpmLimit: "",
            tpmLimit: "",
            allowedModels: [],
            systemPrompt: "",
        });
        setShowCreate(true);
    };

    const handleCreate = async () => {
        if (!form.name.trim()) {
            notify({ type: "error", message: t("api_keys_page.name_required") });
            return;
        }
        if (!form.key.trim()) {
            notify({ type: "error", message: t("api_keys_page.key_empty") });
            return;
        }
        setSaving(true);
        try {
            const newEntry: ApiKeyEntry = {
                key: form.key.trim(),
                name: form.name.trim(),
                "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : undefined,
                "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : undefined,
                "concurrency-limit": form.concurrencyLimit ? parseInt(form.concurrencyLimit, 10) || 0 : undefined,
                "rpm-limit": form.rpmLimit ? parseInt(form.rpmLimit, 10) || 0 : undefined,
                "tpm-limit": form.tpmLimit ? parseInt(form.tpmLimit, 10) || 0 : undefined,
                "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : undefined,
                "system-prompt": form.systemPrompt.trim() || undefined,
                "created-at": new Date().toISOString(),
            };
            await apiKeyEntriesApi.replace([...entries, newEntry]);
            notify({ type: "success", message: t("api_keys_page.created_success") });
            setShowCreate(false);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.create_failed") });
        } finally {
            setSaving(false);
        }
    };

    /* ─── edit ─── */

    const handleOpenEdit = (index: number) => {
        const entry = entries[index];
        setForm({
            name: entry.name || "",
            key: entry.key,
            dailyLimit: entry["daily-limit"]?.toString() || "",
            totalQuota: entry["total-quota"]?.toString() || "",
            concurrencyLimit: entry["concurrency-limit"]?.toString() || "",
            rpmLimit: entry["rpm-limit"]?.toString() || "",
            tpmLimit: entry["tpm-limit"]?.toString() || "",
            allowedModels: entry["allowed-models"] || [],
            systemPrompt: entry["system-prompt"] || "",
        });
        setEditIndex(index);
    };

    const handleEdit = async () => {
        if (editIndex === null) return;
        if (!form.name.trim()) {
            notify({ type: "error", message: t("api_keys_page.name_required") });
            return;
        }
        setSaving(true);
        try {
            await apiKeyEntriesApi.update({
                index: editIndex,
                value: {
                    name: form.name.trim(),
                    "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : 0,
                    "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : 0,
                    "concurrency-limit": form.concurrencyLimit ? parseInt(form.concurrencyLimit, 10) || 0 : 0,
                    "rpm-limit": form.rpmLimit ? parseInt(form.rpmLimit, 10) || 0 : 0,
                    "tpm-limit": form.tpmLimit ? parseInt(form.tpmLimit, 10) || 0 : 0,
                    "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : [],
                    "system-prompt": form.systemPrompt.trim(),
                },
            });
            notify({ type: "success", message: t("api_keys_page.updated_success") });
            setEditIndex(null);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.update_failed") });
        } finally {
            setSaving(false);
        }
    };

    /* ─── delete ─── */

    const handleDelete = async () => {
        if (deleteIndex === null) return;
        setSaving(true);
        try {
            await apiKeyEntriesApi.delete({ index: deleteIndex });
            notify({ type: "success", message: t("api_keys_page.deleted_success") });
            setDeleteIndex(null);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.delete_failed") });
        } finally {
            setSaving(false);
        }
    };

    /* ─── copy ─── */

    const handleCopy = async (key: string) => {
        try {
            await navigator.clipboard.writeText(key);
            notify({ type: "success", message: t("api_keys_page.copied_toast") });
        } catch {
            notify({ type: "error", message: t("api_keys_page.copy_failed") });
        }
    };

    /* ─── usage view ─── */

    const handleViewUsage = (entry: ApiKeyEntry) => {
        setUsageViewKey(entry.key);
        setUsageViewName(entry.name || t("api_keys_page.unnamed"));
        void loadUsage();
    };

    const usageRows = useMemo<UsageLogRow[]>(() => {
        if (!usageViewKey) return [];
        return buildUsageRows(usage, usageViewKey);
    }, [usageViewKey, usage]);

    /* ─── column definitions ─── */

    const apiKeyColumns = useMemo<VirtualTableColumn<ApiKeyEntry>[]>(() => [
        {
            key: "status",
            label: t("api_keys_page.col_status"),
            width: "w-[52px]",
            headerClassName: "text-center",
            cellClassName: "text-center",
            render: (row, idx) => (
                <button
                    onClick={() => void handleToggleDisable(idx)}
                    title={row.disabled ? t("api_keys_page.click_enable") : t("api_keys_page.click_disable")}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${row.disabled
                        ? "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        : "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        }`}
                >
                    <Power size={15} />
                </button>
            ),
        },
        {
            key: "name",
            label: t("api_keys_page.col_name"),
            width: "w-[80px]",
            cellClassName: "font-medium",
            render: (row) => (
                <OverflowTooltip content={row.name || t("api_keys_page.unnamed")} className="block min-w-0">
                    <span className="block min-w-0 truncate">
                        {row.name || <span className="text-slate-400 dark:text-white/40">{t("common.unnamed", "Unnamed")}</span>}
                    </span>
                </OverflowTooltip>
            ),
        },
        {
            key: "key",
            label: t("api_keys_page.col_key"),
            width: "w-[220px]",
            cellClassName: "whitespace-nowrap",
            render: (row) => (
                <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
                    {maskKey(row.key)}
                </code>
            ),
        },
        {
            key: "dailyLimit",
            label: t("api_keys_page.col_daily_limit"),
            width: "w-[80px]",
            cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
            render: (row) => (
                <span className="inline-flex items-center gap-1">
                    {!row["daily-limit"] ? (
                        <><Infinity size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}</>
                    ) : (
                        formatLimit(row["daily-limit"])
                    )}
                </span>
            ),
        },
        {
            key: "totalQuota",
            label: t("api_keys_page.col_total_quota"),
            width: "w-[80px]",
            cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
            render: (row) => (
                <span className="inline-flex items-center gap-1">
                    {!row["total-quota"] ? (
                        <><Infinity size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}</>
                    ) : (
                        formatLimit(row["total-quota"])
                    )}
                </span>
            ),
        },
        {
            key: "rpmLimit",
            label: "RPM",
            width: "w-[70px]",
            cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
            headerRender: () => (
                <HoverTooltip content={t("api_keys.rpm_full")} className="inline-flex items-center gap-1">
                    <span>{t("api_keys_page.rpm")}</span>
                    <Info size={12} className="text-slate-400 dark:text-white/40" />
                </HoverTooltip>
            ),
            render: (row) => (
                <span className="inline-flex items-center gap-1">
                    {!row["rpm-limit"] ? (
                        <><Infinity size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}</>
                    ) : (
                        formatLimit(row["rpm-limit"])
                    )}
                </span>
            ),
        },
        {
            key: "tpmLimit",
            label: "TPM",
            width: "w-[70px]",
            cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
            headerRender: () => (
                <HoverTooltip content={t("api_keys.tpm_full")} className="inline-flex items-center gap-1">
                    <span>{t("api_keys_page.tpm")}</span>
                    <Info size={12} className="text-slate-400 dark:text-white/40" />
                </HoverTooltip>
            ),
            render: (row) => (
                <span className="inline-flex items-center gap-1">
                    {!row["tpm-limit"] ? (
                        <><Infinity size={14} className="text-green-500" /> {t("api_keys_page.unlimited")}</>
                    ) : (
                        formatLimit(row["tpm-limit"])
                    )}
                </span>
            ),
        },
        {
            key: "allowedModels",
            label: t("api_keys_page.col_models"),
            width: "w-[110px]",
            cellClassName: "text-slate-700 dark:text-white/70 overflow-hidden min-w-0",
            render: (row) =>
                row["allowed-models"]?.length ? (
                    <HoverTooltip
                        content={
                            <div className="flex flex-wrap gap-1.5 max-w-xs">
                                {row["allowed-models"].map((m) => (
                                    <span key={m} className="inline-flex items-center gap-1 rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80">
                                        <VendorIcon modelId={m} size={12} />
                                        {m}
                                    </span>
                                ))}
                            </div>
                        }
                        className="block min-w-0"
                    >
                        <span className="inline-flex items-center gap-1.5 text-xs min-w-0 w-full">
                            <span className="inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-md bg-indigo-50 px-1.5 font-semibold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                                {row["allowed-models"].length}
                            </span>
                            <span className="block min-w-0 flex-1 truncate text-slate-500 dark:text-white/50">
                                {row["allowed-models"][0]}
                                {row["allowed-models"].length > 1 ? " more" : ""}
                            </span>
                        </span>
                    </HoverTooltip>
                ) : (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
                        <ShieldCheck size={14} /> {t("api_keys_page.all_models")}
                    </span>
                ),
        },
        {
            key: "createdAt",
            label: t("api_keys_page.col_created"),
            width: "w-[140px]",
            cellClassName: "whitespace-nowrap text-slate-500 dark:text-white/50",
            render: (row) => <>{formatDate(row["created-at"])}</>,
        },
        {
            key: "actions",
            label: t("api_keys_page.col_actions"),
            width: "w-[130px]",
            render: (row, idx) => (
                <div className="flex gap-1">
                    <button
                        onClick={() => handleViewUsage(row)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-blue-400"
                        title={t("api_keys_page.view_usage")}
                    >
                        <BarChart3 size={15} />
                    </button>
                    <button
                        onClick={() => void handleCopy(row.key)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                        title={t("api_keys_page.copy_key")}
                    >
                        <Copy size={15} />
                    </button>
                    <button
                        onClick={() => handleOpenEdit(idx)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
                        title={t("common.edit")}
                    >
                        <Pencil size={15} />
                    </button>
                    <button
                        onClick={() => setDeleteIndex(idx)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        title={t("common.delete")}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            ),
        },
    ], [handleToggleDisable, handleViewUsage, handleCopy, handleOpenEdit]);

    const usageLogColumns = useMemo<VirtualTableColumn<UsageLogRow>[]>(() => [
        {
            key: "timestamp",
            label: t("api_keys_page.col_time"),
            width: "w-48",
            cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
            render: (row) => <span className="block min-w-0 truncate">{formatTimestamp(row.timestamp)}</span>,
        },
        {
            key: "model",
            label: t("api_keys_page.col_model"),
            width: "w-48",
            render: (row) => (
                <OverflowTooltip content={row.model} className="block min-w-0">
                    <span className="block min-w-0 truncate">{row.model}</span>
                </OverflowTooltip>
            ),
        },
        {
            key: "status",
            label: t("api_keys_page.col_status"),
            width: "w-16",
            render: (row) =>
                row.failed ? (
                    <span className="inline-flex min-w-[44px] justify-center rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                        {t("api_keys_page.status_failed")}
                    </span>
                ) : (
                    <span className="inline-flex min-w-[44px] justify-center rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                        {t("api_keys_page.status_success")}
                    </span>
                ),
        },
        {
            key: "latency",
            label: t("api_keys_page.col_duration"),
            width: "w-20",
            headerClassName: "text-right",
            cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
            render: (row) => <>{row.latencyText}</>,
        },
        {
            key: "inputTokens",
            label: t("api_keys_page.col_input"),
            width: "w-20",
            headerClassName: "text-right",
            cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
            render: (row) => <>{row.inputTokens.toLocaleString()}</>,
        },
        {
            key: "outputTokens",
            label: t("api_keys_page.col_output"),
            width: "w-20",
            headerClassName: "text-right",
            cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
            render: (row) => <>{row.outputTokens.toLocaleString()}</>,
        },
        {
            key: "totalTokens",
            label: t("api_keys_page.col_total_token"),
            width: "w-24",
            headerClassName: "text-right",
            cellClassName: "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
            render: (row) => <>{row.totalTokens.toLocaleString()}</>,
        },
    ], []);

    /* ─── render form ─── */

    const renderForm = () => (
        <div className="space-y-4">
            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    {t("api_keys_page.form_name_label")} <span className="text-rose-500">*</span>
                </label>
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={t("api_keys_page.form_name_placeholder")}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    {t("api_keys_page.form_key_label")}
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={form.key}
                        onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                        placeholder="sk-..."
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                        readOnly={editIndex !== null}
                    />
                    {editIndex === null && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setForm((p) => ({ ...p, key: generateKey() }))}
                        >
                            <RefreshCw size={14} />
                            {t("api_keys_page.form_regenerate")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        {t("api_keys_page.form_daily_limit")}
                    </label>
                    <input
                        type="number"
                        value={form.dailyLimit}
                        onChange={(e) => setForm((p) => ({ ...p, dailyLimit: e.target.value }))}
                        placeholder={t("api_keys_page.form_unlimited_hint")}
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        {t("api_keys_page.form_total_quota")}
                    </label>
                    <input
                        type="number"
                        value={form.totalQuota}
                        onChange={(e) => setForm((p) => ({ ...p, totalQuota: e.target.value }))}
                        placeholder="0 = Unlimited"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        {t("api_keys_page.form_concurrency_limit")}
                    </label>
                    <input
                        type="number"
                        value={form.concurrencyLimit}
                        onChange={(e) => setForm((p) => ({ ...p, concurrencyLimit: e.target.value }))}
                        placeholder="0 = Unlimited"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div>
                    <HoverTooltip content={t("api_keys.rpm_full")} className="mb-1 inline-flex items-center gap-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-white/80">
                            {t("api_keys_page.form_rpm_limit")}
                        </label>
                        <Info size={14} className="text-slate-400 dark:text-white/40" />
                    </HoverTooltip>
                    <input
                        type="number"
                        value={form.rpmLimit}
                        onChange={(e) => setForm((p) => ({ ...p, rpmLimit: e.target.value }))}
                        placeholder="0 = Unlimited"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
                <div>
                    <HoverTooltip content={t("api_keys.tpm_full")} className="mb-1 inline-flex items-center gap-1">
                        <label className="text-sm font-medium text-slate-700 dark:text-white/80">
                            {t("api_keys_page.form_tpm_limit")}
                        </label>
                        <Info size={14} className="text-slate-400 dark:text-white/40" />
                    </HoverTooltip>
                    <input
                        type="number"
                        value={form.tpmLimit}
                        onChange={(e) => setForm((p) => ({ ...p, tpmLimit: e.target.value }))}
                        placeholder="0 = Unlimited"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    {t("api_keys_page.form_allowed_models")}
                </label>
                <MultiSelect
                    options={availableModels}
                    value={form.allowedModels}
                    onChange={(selected) => setForm((p) => ({ ...p, allowedModels: selected }))}
                    placeholder={t("api_keys_page.select_models")}
                    emptyLabel={t("api_keys_page.form_all_models")}
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    {t("api_keys_page.form_system_prompt")}
                </label>
                <textarea
                    value={form.systemPrompt}
                    onChange={(e) => setForm((p) => ({ ...p, systemPrompt: e.target.value }))}
                    placeholder={t("api_keys_page.system_prompt_hint")}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500 resize-y"
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-white/40">
                    {t("api_keys_page.form_system_prompt_desc")}
                </p>
            </div>
        </div>
    );

    /* ─── main render ─── */

    return (
        <div className="space-y-6">
            <Card
                title={t("api_keys_page.title")}
                description={t("api_keys_page.description")}
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void loadEntries()} disabled={loading}>
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            {t("api_keys_page.refresh")}</Button>
                        <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                            <Plus size={14} />
                            {t("api_keys_page.create_key")}</Button>
                    </div>
                }
                loading={loading}
            >
                {entries.length === 0 ? (
                    <EmptyState
                        title={t("api_keys_page.no_keys")}
                        description={t("api_keys_page.no_keys_desc")}
                        icon={<KeyRound size={32} className="text-slate-400" />}
                    />
                ) : (
                    <VirtualTable<ApiKeyEntry>
                        rows={entries}
                        columns={apiKeyColumns}
                        rowKey={(row) => row.key}
                        rowHeight={44}
                        height="h-auto max-h-[70vh]"
                        minWidth="min-w-[1200px]"
                        caption={t("api_keys_page.table_caption")}
                        emptyText={t("api_keys_page.no_api_keys")}
                        rowClassName={(row) => row.disabled ? "opacity-50" : ""}
                    />
                )}
            </Card>

            {/* Create Modal */}
            <Modal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                title={t("api_keys_page.create")}
                description={t("api_keys_page.create_desc")}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowCreate(false)}>
                            {t("api_keys_page.cancel")}</Button>
                        <Button variant="primary" onClick={() => void handleCreate()} disabled={saving}>
                            {saving ? t("api_keys_page.creating") : t("api_keys_page.create_btn")}
                        </Button>
                    </>
                }
            >
                {renderForm()}
            </Modal>

            {/* Edit Modal */}
            <Modal
                open={editIndex !== null}
                onClose={() => setEditIndex(null)}
                title={t("api_keys_page.edit")}
                description={t("api_keys_page.edit_desc")}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditIndex(null)}>
                            {t("api_keys_page.cancel")}</Button>
                        <Button variant="primary" onClick={() => void handleEdit()} disabled={saving}>
                            {saving ? t("api_keys_page.saving") : t("api_keys_page.save_btn")}
                        </Button>
                    </>
                }
            >
                {renderForm()}
            </Modal>

            {/* Delete Confirm */}
            <Modal
                open={deleteIndex !== null}
                onClose={() => setDeleteIndex(null)}
                title={t("api_keys_page.confirm_delete")}
                description={t("api_keys_page.delete_warning")}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteIndex(null)}>
                            {t("api_keys_page.cancel")}</Button>
                        <Button variant="danger" onClick={() => void handleDelete()} disabled={saving}>
                            {saving ? t("api_keys_page.deleting") : t("api_keys_page.confirm_delete_btn")}
                        </Button>
                    </>
                }
            >
                {deleteIndex !== null && entries[deleteIndex] && (
                    <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                        <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {entries[deleteIndex].name || t("api_keys_page.unnamed")}
                        </div>
                        <code className="text-xs text-red-600 dark:text-red-400">
                            {maskKey(entries[deleteIndex].key)}
                        </code>
                    </div>
                )}
            </Modal>

            {/* Usage View — detailed call log table */}
            <Modal
                open={usageViewKey !== null}
                onClose={() => setUsageViewKey(null)}
                title={t("api_keys_page.usage_title", { name: usageViewName })}
                description={usageViewKey ? t("api_keys_page.usage_desc", { key: maskKey(usageViewKey), count: usageRows.length }) : ""}
            >
                {usageLoading ? (
                    <div className="py-8 text-center text-sm text-slate-500 dark:text-white/50">{t("api_keys_page.loading")}</div>
                ) : usageRows.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500 dark:text-white/50">{t("api_keys_page.no_usage")}</div>
                ) : (
                    <VirtualTable<UsageLogRow>
                        rows={usageRows}
                        columns={usageLogColumns}
                        rowKey={(row) => row.id}
                        rowHeight={40}
                        height="h-auto max-h-[60vh]"
                        minWidth="min-w-[700px]"
                        caption={t("api_keys_page.usage_table_caption")}
                        emptyText={t("api_keys_page.no_usage_records")}
                    />
                )}
            </Modal>
        </div>
    );
}
