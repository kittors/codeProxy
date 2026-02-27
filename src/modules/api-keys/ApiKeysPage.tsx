import { useCallback, useEffect, useState } from "react";
import {
    Plus,
    Copy,
    Pencil,
    Trash2,
    KeyRound,
    ShieldCheck,
    RefreshCw,
    Infinity,
} from "lucide-react";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { Modal } from "@/modules/ui/Modal";

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
    if (!limit || limit <= 0) return "无限制";
    return limit.toLocaleString();
};

/* ─── types ─── */

interface FormValues {
    name: string;
    key: string;
    dailyLimit: string;
    totalQuota: string;
    allowedModels: string;
}

/* ─── component ─── */

export function ApiKeysPage() {
    const { notify } = useToast();

    const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<FormValues>({
        name: "",
        key: "",
        dailyLimit: "",
        totalQuota: "",
        allowedModels: "",
    });

    /* ─── load ─── */

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiKeyEntriesApi.list();
            setEntries(data);
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "加载 API Keys 失败" });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        void loadEntries();
    }, [loadEntries]);

    /* ─── create ─── */

    const handleOpenCreate = () => {
        setForm({
            name: "",
            key: generateKey(),
            dailyLimit: "",
            totalQuota: "",
            allowedModels: "",
        });
        setShowCreate(true);
    };

    const handleCreate = async () => {
        if (!form.key.trim()) {
            notify({ type: "error", message: "Key 不能为空" });
            return;
        }
        setSaving(true);
        try {
            const newEntry: ApiKeyEntry = {
                key: form.key.trim(),
                name: form.name.trim() || undefined,
                "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : undefined,
                "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : undefined,
                "allowed-models": form.allowedModels
                    ? form.allowedModels
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : undefined,
                "created-at": new Date().toISOString(),
            };
            await apiKeyEntriesApi.replace([...entries, newEntry]);
            notify({ type: "success", message: "创建成功" });
            setShowCreate(false);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "创建失败" });
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
            allowedModels: entry["allowed-models"]?.join(", ") || "",
        });
        setEditIndex(index);
    };

    const handleEdit = async () => {
        if (editIndex === null) return;
        setSaving(true);
        try {
            await apiKeyEntriesApi.update({
                index: editIndex,
                value: {
                    name: form.name.trim() || undefined,
                    "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : 0,
                    "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : 0,
                    "allowed-models": form.allowedModels
                        ? form.allowedModels
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : [],
                },
            });
            notify({ type: "success", message: "更新成功" });
            setEditIndex(null);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "更新失败" });
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
            notify({ type: "success", message: "删除成功" });
            setDeleteIndex(null);
            await loadEntries();
        } catch (err: unknown) {
            notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
        } finally {
            setSaving(false);
        }
    };

    /* ─── copy ─── */

    const handleCopy = async (key: string) => {
        try {
            await navigator.clipboard.writeText(key);
            notify({ type: "success", message: "已复制到剪贴板" });
        } catch {
            notify({ type: "error", message: "复制失败" });
        }
    };

    /* ─── render form ─── */

    const renderForm = () => (
        <div className="space-y-4">
            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    名称
                </label>
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="例如：团队A"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    API Key
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
                            重新生成
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        每日请求限制
                    </label>
                    <input
                        type="number"
                        value={form.dailyLimit}
                        onChange={(e) => setForm((p) => ({ ...p, dailyLimit: e.target.value }))}
                        placeholder="0 = 无限制"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                        总请求额度
                    </label>
                    <input
                        type="number"
                        value={form.totalQuota}
                        onChange={(e) => setForm((p) => ({ ...p, totalQuota: e.target.value }))}
                        placeholder="0 = 无限制"
                        min={0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                    />
                </div>
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                    允许的模型（逗号分隔，留空 = 全部）
                </label>
                <input
                    type="text"
                    value={form.allowedModels}
                    onChange={(e) => setForm((p) => ({ ...p, allowedModels: e.target.value }))}
                    placeholder="gemini-*, claude-sonnet-4-*, gpt-4o"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
                />
            </div>
        </div>
    );

    /* ─── main render ─── */

    return (
        <div className="space-y-6">
            <Card
                title="API Keys 管理"
                description="创建和管理 API Keys，设置请求限制和模型权限。数据持久化在服务端，重启不丢失。"
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void loadEntries()} disabled={loading}>
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            刷新
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                            <Plus size={14} />
                            创建 Key
                        </Button>
                    </div>
                }
                loading={loading}
            >
                {entries.length === 0 ? (
                    <EmptyState
                        title="暂无 API Key"
                        description="点击「创建 Key」按钮来添加第一个 API Key。"
                        icon={<KeyRound size={32} className="text-slate-400" />}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-neutral-700">
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">名称</th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">Key</th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">每日限制</th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">总配额</th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">可用模型</th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">创建时间</th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-white/65">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry, i) => (
                                    <tr
                                        key={entry.key}
                                        className="border-b border-slate-100 transition-colors hover:bg-slate-50/60 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
                                    >
                                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                                            {entry.name || <span className="text-slate-400 dark:text-white/40">未命名</span>}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
                                                {maskKey(entry.key)}
                                            </code>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-700 dark:text-white/70">
                                            <span className="inline-flex items-center gap-1">
                                                {!entry["daily-limit"] ? (
                                                    <>
                                                        <Infinity size={14} className="text-green-500" /> 无限制
                                                    </>
                                                ) : (
                                                    formatLimit(entry["daily-limit"])
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-700 dark:text-white/70">
                                            <span className="inline-flex items-center gap-1">
                                                {!entry["total-quota"] ? (
                                                    <>
                                                        <Infinity size={14} className="text-green-500" /> 无限制
                                                    </>
                                                ) : (
                                                    formatLimit(entry["total-quota"])
                                                )}
                                            </span>
                                        </td>
                                        <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-700 dark:text-white/70">
                                            {entry["allowed-models"]?.length ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {entry["allowed-models"].slice(0, 3).map((m) => (
                                                        <span
                                                            key={m}
                                                            className="inline-block rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
                                                        >
                                                            {m}
                                                        </span>
                                                    ))}
                                                    {entry["allowed-models"].length > 3 && (
                                                        <span className="text-xs text-slate-400">+{entry["allowed-models"].length - 3}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                                    <ShieldCheck size={14} /> 全部
                                                </span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-white/50">
                                            {formatDate(entry["created-at"])}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => void handleCopy(entry.key)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                                                    title="复制 Key"
                                                >
                                                    <Copy size={15} />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenEdit(i)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
                                                    title="编辑"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteIndex(i)}
                                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                                    title="删除"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create Modal */}
            <Modal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                title="创建 API Key"
                description="填写信息并生成新的 API Key"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowCreate(false)}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={() => void handleCreate()} disabled={saving}>
                            {saving ? "创建中..." : "创建"}
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
                title="编辑 API Key"
                description="修改名称、限制和模型权限"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditIndex(null)}>
                            取消
                        </Button>
                        <Button variant="primary" onClick={() => void handleEdit()} disabled={saving}>
                            {saving ? "保存中..." : "保存"}
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
                title="确认删除"
                description="删除后将无法恢复，使用此 Key 的所有客户端将无法访问。"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteIndex(null)}>
                            取消
                        </Button>
                        <Button variant="danger" onClick={() => void handleDelete()} disabled={saving}>
                            {saving ? "删除中..." : "确认删除"}
                        </Button>
                    </>
                }
            >
                {deleteIndex !== null && entries[deleteIndex] && (
                    <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                        <div className="text-sm font-medium text-red-800 dark:text-red-300">
                            {entries[deleteIndex].name || "未命名"}
                        </div>
                        <code className="text-xs text-red-600 dark:text-red-400">
                            {maskKey(entries[deleteIndex].key)}
                        </code>
                    </div>
                )}
            </Modal>
        </div>
    );
}
