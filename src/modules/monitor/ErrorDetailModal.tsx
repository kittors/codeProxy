import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X, Loader2, Copy, Check } from "lucide-react";
import { usageApi } from "@/lib/http/apis";

interface ErrorDetailModalProps {
    open: boolean;
    logId: number | null;
    model?: string;
    onClose: () => void;
}

export function ErrorDetailModal({ open, logId, model, onClose }: ErrorDetailModalProps) {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorContent, setErrorContent] = useState("");
    const [copied, setCopied] = useState(false);

    // Animation
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => setVisible(true));
        } else {
            setVisible(false);
        }
    }, [open]);

    // Fetch
    useEffect(() => {
        if (!open || !logId) return;
        setLoading(true);
        setError(null);
        setErrorContent("");
        usageApi.getLogContent(logId).then((res) => {
            setErrorContent(res.output_content || "");
        }).catch((err) => {
            setError(err instanceof Error ? err.message : "加载失败");
        }).finally(() => setLoading(false));
    }, [open, logId]);

    // Escape key
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(errorContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [errorContent]);

    if (!open) return null;

    /** Try to format JSON nicely, extract error message */
    let formattedContent = errorContent;
    let errorMessage = "";
    try {
        const parsed = JSON.parse(errorContent);
        formattedContent = JSON.stringify(parsed, null, 2);
        // Extract common error message patterns
        if (parsed?.error?.message) errorMessage = parsed.error.message;
        else if (parsed?.error && typeof parsed.error === "string") errorMessage = parsed.error;
        else if (parsed?.message) errorMessage = parsed.message;
    } catch {
        // Not JSON, use raw text
        errorMessage = errorContent.slice(0, 200);
    }

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className={[
                    "absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm dark:bg-black/50",
                    "transition-opacity duration-200",
                    visible ? "opacity-100" : "opacity-0",
                ].join(" ")}
            />

            {/* Dialog */}
            <div
                role="dialog"
                aria-modal="true"
                className={[
                    "relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-red-200 bg-white shadow-xl dark:border-red-900/40 dark:bg-neutral-950",
                    "max-h-[70vh] transition-all duration-200",
                    visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
                ].join(" ")}
            >
                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-red-100 bg-red-50/50 px-5 py-4 dark:border-red-900/30 dark:bg-red-950/20">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                            <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold tracking-tight text-red-900 dark:text-red-200">
                                请求失败{model ? ` · ${model}` : ""}
                            </h2>
                            <p className="mt-0.5 text-xs text-red-600/70 dark:text-red-400/60">上游 API 返回的错误响应</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white/80 text-red-700 transition hover:bg-white dark:border-red-900/40 dark:bg-neutral-950/60 dark:text-red-300 dark:hover:bg-neutral-900"
                        aria-label="关闭"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={22} className="animate-spin text-slate-400" />
                            <span className="ml-2 text-sm text-slate-500">加载中…</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <p className="text-sm text-red-500">{error}</p>
                        </div>
                    ) : !errorContent ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-white/30">
                            <AlertTriangle size={32} className="mb-2 opacity-40" />
                            <p className="text-sm">无错误内容记录</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Error summary */}
                            {errorMessage && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-950/20">
                                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{errorMessage}</p>
                                </div>
                            )}

                            {/* Full response */}
                            <div className="relative">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/35">完整响应</span>
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 dark:text-white/40 dark:hover:bg-neutral-800"
                                    >
                                        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                        {copied ? "已复制" : "复制"}
                                    </button>
                                </div>
                                <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">
                                    {formattedContent}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
