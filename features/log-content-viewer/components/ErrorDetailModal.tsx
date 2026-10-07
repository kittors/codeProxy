import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileQuestion } from "lucide-react";
import { usageApi } from "@code-proxy/api-client";
import { Button, Callout, CopyButton, EmptyState, Modal, Skeleton, SkeletonLines } from "@code-proxy/ui";
import { extractErrorFromLogContent } from "../error-detail/extractErrorFromLogContent";

interface ErrorDetailModalProps {
  open: boolean;
  logId: number | null;
  model?: string;
  onClose: () => void;
}

/**
 * 失败请求的错误详情：先给一句错误摘要（红色提示条），再给完整响应原文（可复制）。
 *
 * 外壳用通用 Modal：叠层（嵌在别的弹窗里时 Esc 只关这一层）、焦点进出、进退场都与全站一致，
 * 不再自己监听 Esc。标题下方的一句说明交代「这份错误是从哪来的」：上游原文，还是从请求详情还原。
 */
export function ErrorDetailModal({ open, logId, model, onClose }: ErrorDetailModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorContent, setErrorContent] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reconstructed, setReconstructed] = useState(false);

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

  const hasErrorContent = errorContent.trim().length > 0;
  /** Try to format JSON nicely */
  const formattedContent = useMemo(() => {
    if (!hasErrorContent) return errorContent;
    try {
      return JSON.stringify(JSON.parse(errorContent), null, 2);
    } catch {
      return errorContent;
    }
  }, [errorContent, hasErrorContent]);

  const title = model
    ? `${t("error_detail.request_failed")} · ${model}`
    : t("error_detail.request_failed");
  // 加载中不下结论：以前这时就显示「未记录上游错误响应」，数据一到又改口。
  // 加载失败时原因写在正文的红色提示里，这里不再重复。
  const description = loading
    ? t("common.loading_ellipsis")
    : error
      ? undefined
      : hasErrorContent
        ? reconstructed
          ? t("error_detail.reconstructed_from_details")
          : t("error_detail.upstream_error")
        : t("error_detail.historical_missing");

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      icon={<AlertTriangle />}
      tone="danger"
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton rounded="lg" className="h-12" />
          <SkeletonLines rows={5} />
        </div>
      ) : error ? (
        <Callout tone="danger" role="alert" title={t("error_detail.load_failed")}>
          {error === t("error_detail.load_failed") ? null : error}
        </Callout>
      ) : !hasErrorContent ? (
        <EmptyState icon={<FileQuestion size={20} aria-hidden />} description={t("error_detail.no_content")} />
      ) : (
        <div className="space-y-4">
          {errorMessage ? (
            <Callout tone="danger">
              <span className="font-medium text-ink [overflow-wrap:anywhere]">{errorMessage}</span>
            </Callout>
          ) : null}

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-ink-3">{t("error_detail.full_response")}</h3>
              <CopyButton value={errorContent} label={t("error_detail.copy_response")} />
            </div>
            <pre className="max-h-[40vh] overflow-auto rounded-2xl bg-subtle p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
              {formattedContent}
            </pre>
          </section>
        </div>
      )}
    </Modal>
  );
}
