import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileQuestion } from "lucide-react";
import { Button, Callout, CopyButton, EmptyState, Modal, Skeleton, SkeletonLines } from "@code-proxy/ui";
import {
  answeredByGateway,
  explainFailure,
  failureExplanationKeys,
} from "../error-detail/explainFailure";
import { useFailureDetail } from "../error-detail/useFailureDetail";
import { routeTraceSummary } from "../log-content/RouteTimeline";

interface ErrorDetailModalProps {
  open: boolean;
  logId: number | null;
  model?: string;
  onClose: () => void;
}

/**
 * 失败请求的错误详情：先说发生了什么（红色提示条：失败的类别和错误摘要），再说接下来会怎样（路由
 * 轨迹的结论：换到了哪个账号、账号暂停到几点，以及这一类失败该怎么处理），最后是完整响应原文（可复制）。
 *
 * 外壳用通用 Modal：叠层（嵌在别的弹窗里时 Esc 只关这一层）、焦点进出、进退场都与全站一致，
 * 不再自己监听 Esc。标题下方的一句说明交代「这份错误是从哪来的」：上游原文，还是从请求详情还原。
 */
export function ErrorDetailModal({ open, logId, model, onClose }: ErrorDetailModalProps) {
  const { t, i18n } = useTranslation();
  const nextId = useId();
  const { loading, error, extracted, factsLoading, facts } = useFailureDetail(open, logId);

  const language = i18n.resolvedLanguage;
  const traceSummary = useMemo(
    () => (facts?.trace ? routeTraceSummary(t, language, facts.trace) : ""),
    [facts, language, t],
  );
  const explanation = useMemo(() => (facts ? explainFailure(facts) : null), [facts]);
  const keys = explanation ? failureExplanationKeys(explanation, traceSummary !== "") : null;
  const hint = keys?.hint ? t(keys.hint) : "";

  // 客户端走了，网关没有回任何错误：从诊断里还原出的「HTTP 499」不是谁收到过的响应，不显示。
  const noAnswer = explanation?.category === "client_canceled" && extracted?.reconstructed === true;
  const errorContent = noAnswer ? "" : (extracted?.content ?? "");
  const errorMessage = noAnswer ? "" : (extracted?.message ?? "");
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
  // 没有正文但认得出类别（比如客户端取消）时不说「未记录上游错误响应」：本来就没有。
  const description = loading
    ? t("common.loading_ellipsis")
    : error
      ? undefined
      : hasErrorContent
        ? extracted?.reconstructed
          ? t("error_detail.reconstructed_from_details")
          : facts && answeredByGateway(facts, explanation)
            ? t("error_detail.gateway_error")
            : t("error_detail.upstream_error")
        : keys
          ? undefined
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
      ) : !hasErrorContent && !keys ? (
        <EmptyState icon={<FileQuestion size={20} aria-hidden />} description={t("error_detail.no_content")} />
      ) : (
        <div className="space-y-4">
          {keys || errorMessage ? (
            <Callout tone="danger" title={keys ? t(keys.label) : undefined}>
              {errorMessage ? (
                <span
                  className={
                    keys
                      ? "[overflow-wrap:anywhere]"
                      : "font-medium text-ink [overflow-wrap:anywhere]"
                  }
                >
                  {errorMessage}
                </span>
              ) : null}
            </Callout>
          ) : null}

          {factsLoading ? (
            <SkeletonLines rows={2} />
          ) : traceSummary || hint ? (
            <section aria-labelledby={nextId} className="space-y-1">
              <h3 id={nextId} className="text-xs font-medium text-ink-3">
                {t("error_detail.next_title")}
              </h3>
              {traceSummary ? <p className="text-sm leading-6 text-ink">{traceSummary}</p> : null}
              {hint ? <p className="text-sm leading-6 text-ink-2">{hint}</p> : null}
            </section>
          ) : null}

          {hasErrorContent ? (
            <section>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium text-ink-3">{t("error_detail.full_response")}</h3>
                <CopyButton value={errorContent} label={t("error_detail.copy_response")} />
              </div>
              <pre className="max-h-[40vh] overflow-auto rounded-2xl bg-subtle p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
                {formattedContent}
              </pre>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
