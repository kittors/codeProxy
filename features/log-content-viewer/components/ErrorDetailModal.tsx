import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { AlertTriangle, X, Loader2, Copy, Check } from "lucide-react";
import { usageApi } from "@code-proxy/api-client";
import { extractErrorFromLogContent } from "../error-detail/extractErrorFromLogContent";

interface ErrorDetailModalProps {
  open: boolean;
  logId: number | null;
  model?: string;
  onClose: () => void;
}

export function ErrorDetailModal({ open, logId, model, onClose }: ErrorDetailModalProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorContent, setErrorContent] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reconstructed, setReconstructed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Animation
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  // Fetch output first; when empty, fall back to request details so historical
  // failed logs (store-content off) can still surface status / diagnostic info.
  useEffect(() => {
    if (!open || !logId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorContent("");
    setErrorMessage("");
    setReconstructed(false);

    void (async () => {
      try {
        const outputRes = await usageApi.getLogContent(logId);
        if (cancelled) return;
        const extracted = extractErrorFromLogContent(outputRes.output_content || "");
        if (extracted) {
          setErrorContent(extracted.content);
          setErrorMessage(extracted.message);
          setReconstructed(extracted.reconstructed);
          return;
        }

        try {
          const detailsRes = await usageApi.getLogContentPart(logId, "details");
          if (cancelled) return;
          const fromDetails = extractErrorFromLogContent("", detailsRes.content || "");
          if (fromDetails) {
            setErrorContent(fromDetails.content);
            setErrorMessage(fromDetails.message);
            setReconstructed(fromDetails.reconstructed);
            return;
          }
        } catch {
          // Details may be unauthorized or missing; keep empty-state UX.
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("error_detail.load_failed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [logId, open, t]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(errorContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [errorContent]);

  if (!open) return null;

  const hasErrorContent = errorContent.trim().length > 0;

  /** Try to format JSON nicely */
  let formattedContent = errorContent;
  if (hasErrorContent) {
    try {
      const parsed = JSON.parse(errorContent);
      formattedContent = JSON.stringify(parsed, null, 2);
    } catch {
      // keep raw text
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className={[
          "absolute inset-0 cursor-default bg-black/25 dark:bg-black/55",
          "transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className={[
          // 与通用弹窗同一种面板：错误只体现在图标和错误摘要上，不再给整张面板描红边、铺红色标题栏。
          "relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-elevated text-ink shadow-dialog",
          "max-h-[70vh] transition-all duration-[250ms] ease-soft",
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.97]",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle size={16} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight text-ink">
                {t("error_detail.request_failed")}
                {model ? ` · ${model}` : ""}
              </h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {hasErrorContent
                  ? reconstructed
                    ? t("error_detail.reconstructed_from_details")
                    : t("error_detail.upstream_error")
                  : t("error_detail.historical_missing")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-3 shadow-none transition-colors hover:bg-hover hover:text-ink"
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pt-2 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={22} className="animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">{t("common.loading_ellipsis")}</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : !hasErrorContent ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-white/45">
              <AlertTriangle size={32} className="mb-2 opacity-40" />
              <p className="max-w-sm text-sm leading-6">{t("error_detail.no_content")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Error summary */}
              {errorMessage && (
                <div className="min-w-0 overflow-hidden rounded-2xl bg-rose-500/[0.07] px-4 py-3">
                  <p
                    className="text-sm font-medium text-red-700 dark:text-red-300"
                    style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}
                  >
                    {errorMessage}
                  </p>
                </div>
              )}

              {/* Full response */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-2xs font-medium text-slate-400 dark:text-white/35">
                    {t("error_detail.full_response")}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                  >
                    {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    {copied ? t("common.copied") : t("log_content.copy")}
                  </button>
                </div>
                <pre
                  className="max-h-[40vh] overflow-auto rounded-2xl bg-subtle p-4 text-xs leading-relaxed text-ink-2"
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    overflowWrap: "anywhere",
                  }}
                >
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
