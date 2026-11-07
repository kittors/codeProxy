import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@code-proxy/api-client";
import { extractErrorFromLogContent, type ExtractedErrorPayload } from "./extractErrorFromLogContent";
import { parseRequestDetails, readFailureFacts, type FailureFacts } from "./failureFacts";

export interface FailureDetail {
  /** 失败正文还在加载（或正文没说清、要等请求详情来还原）。 */
  loading: boolean;
  /** 失败正文加载失败的原因。 */
  error: string | null;
  extracted: ExtractedErrorPayload | null;
  /** 请求详情还在加载：「接下来会怎样」要等它。 */
  factsLoading: boolean;
  facts: FailureFacts | null;
}

const IDLE: FailureDetail = {
  loading: false,
  error: null,
  extracted: null,
  factsLoading: false,
  facts: null,
};

/**
 * 一条失败日志的错误详情。失败正文和请求详情同时去取：请求详情带着诊断和路由轨迹，「发生了什么、
 * 接下来会怎样」靠它；正文自己说清了错误时先把正文显示出来，不等请求详情。正文没说清（关了正文
 * 存储的旧日志、流在错误事件之前就被截断）时，摘要也从请求详情的诊断里还原。
 *
 * 请求详情可能没有权限读或根本没存：那时只按失败正文判断。
 */
export function useFailureDetail(open: boolean, logId: number | null): FailureDetail {
  const { t } = useTranslation();
  const [state, setState] = useState<FailureDetail>(IDLE);

  useEffect(() => {
    if (!open || !logId) return;
    let cancelled = false;
    setState({ ...IDLE, loading: true, factsLoading: true });

    // Never rejects: unreadable details leave the output to decide alone.
    const detailsRequest = (async () => {
      try {
        return (await usageApi.getLogContentPart(logId, "details")).content || "";
      } catch {
        return "";
      }
    })();

    void (async () => {
      let output: string;
      try {
        const outputRes = await usageApi.getLogContent(logId);
        output = outputRes.output_content || "";
      } catch (err) {
        if (!cancelled) {
          setState({
            ...IDLE,
            error: err instanceof Error ? err.message : t("error_detail.load_failed"),
          });
        }
        return;
      }
      if (cancelled) return;

      const own = extractErrorFromLogContent(output);
      if (own?.message) {
        setState((prev) => ({ ...prev, loading: false, extracted: own }));
      }
      const detailsContent = await detailsRequest;
      if (cancelled) return;
      setState({
        loading: false,
        error: null,
        extracted: own?.message ? own : extractErrorFromLogContent(output, detailsContent),
        factsLoading: false,
        facts: readFailureFacts(output, parseRequestDetails(detailsContent)),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [logId, open, t]);

  return state;
}
