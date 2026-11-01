import { readRouteTrace, type RouteTrace } from "../log-content/routeTrace";
import { errorRecordFromOutput } from "./extractErrorFromLogContent";

/**
 * 判断一次失败「是什么、接下来会怎样」要用到的事实，全部取自后端写下的结构化字段：请求详情的
 * `diagnostic`（CliRelay `internal/diagnostics`）和失败正文里的错误对象。上游的错误原文各家措辞
 * 不同，只拿来显示，不拿来分类。
 *
 * 字段缺失时取空值：旧日志没有诊断，没权限读请求详情时也只有失败正文。
 */
export interface FailureFacts {
  /** 中转回给客户端的状态码；没有记录时为 0。 */
  status: number;
  /** 最后一次上游调用的状态码；请求没到上游时为 0。 */
  upstreamStatus: number;
  /** 回给客户端的错误码与类型：诊断里的优先，没有就取失败正文里的。 */
  code: string;
  type: string;
  /**
   * 谁写的错误：`local_quota`、`local_auth`、`local_route` 是中转自己拒绝的（没有发往上游），
   * `upstream` 是上游的；其余情况为空。
   */
  source: string;
  /** Key 额度拒绝时是哪一项限额（concurrency、rpm、tpm、daily、total、spending、daily_spending、period_spending、quota_limits）。 */
  quotaRejectedBy: string;
  /** 额度拒绝的周期（5h、day、week、month 等），只有周期额度的失败正文里有。 */
  quotaPeriod: string;
  /** 结束这次请求的循环保护（reply_loop、tool_loop）和开启它的那一级（tenant、api_key）。 */
  loopGuardKind: string;
  loopGuardSource: string;
  trace: RouteTrace | null;
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const status = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

/** 请求详情（detail_content 的 JSON 文本）；读不出来时为 null。 */
export function parseRequestDetails(detailsContent: string): unknown {
  const trimmed = detailsContent.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function readFailureFacts(outputContent: string, details: unknown): FailureFacts {
  const diagnostic = asRecord(asRecord(details)?.diagnostic);
  const response = asRecord(diagnostic?.response);
  const upstream = asRecord(diagnostic?.upstream);
  const quota = asRecord(diagnostic?.quota);
  const loopGuard = asRecord(diagnostic?.loop_guard);
  const outputError = errorRecordFromOutput(outputContent);
  return {
    status: status(response?.status),
    upstreamStatus: status(upstream?.status),
    code: text(response?.error_code) || text(quota?.error_code) || text(outputError?.code),
    type: text(response?.error_type) || text(quota?.error_type) || text(outputError?.type),
    source: text(response?.source),
    quotaRejectedBy: quota?.rejected === true ? text(quota.rejected_by) : "",
    quotaPeriod: text(outputError?.period),
    loopGuardKind: text(loopGuard?.kind),
    loopGuardSource: text(loopGuard?.source),
    trace: readRouteTrace(details),
  };
}
