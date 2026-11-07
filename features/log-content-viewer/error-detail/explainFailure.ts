import { normalizeCooldownReason } from "@code-proxy/domain";
import { routeTraceVerdict, type RouteTraceStep } from "../log-content/routeTrace";
import type { FailureFacts } from "./failureFacts";

/**
 * 一次失败属于哪一类：错误弹窗据此写「发生了什么」的标题和一句「接下来怎么办」。
 *
 * 先认中转自己拒绝的（客户端取消、循环保护、Key 额度、鉴权、路径分组、内容审核等，这些请求没有
 * 发往上游或由中转结束），再看路由轨迹里这次失败的尝试（原因码与账号冷却原因同一套，CliRelay
 * `sdk/cliproxy/auth/cooldown_reason.go`、`sdk/cliproxy/routetrace`），最后才退回到状态码。
 * 认不出来时为 null：弹窗只显示错误原文，不硬套一个类别。
 */
export type FailureCategory =
  | "client_canceled"
  | "loop_guard"
  | "key_quota"
  | "quota_unavailable"
  | "relay_auth"
  | "tenant_unavailable"
  | "route"
  | "content_moderation"
  | "virtual_model"
  | "context_length"
  | "no_account"
  | "upstream_rate_limit"
  | "upstream_quota"
  | "upstream_auth"
  | "upstream_billing"
  | "upstream_model"
  | "upstream_server"
  | "upstream_request"
  | "upstream_timeout"
  | "stream_cut"
  | "network";

/** Key 额度多久恢复：并发（在途请求结束）、一分钟、按天、按周期、永不（总额度）。 */
export type QuotaWindow = "concurrency" | "minute" | "day" | "period" | "lifetime";

export interface FailureExplanation {
  category: FailureCategory;
  /** key_quota 时，限额多久恢复。 */
  quotaWindow?: QuotaWindow;
  /** loop_guard 时，截断的是复读的回复，还是由中转代答的工具调用死循环。 */
  loopGuardKind?: "reply_loop" | "tool_loop";
  /** loop_guard 时，在哪一级开的：去那里关。 */
  loopGuardSource?: "tenant" | "api_key";
  /** stream_cut 时，断开前有没有内容发给了客户端：发了就不能再换账号。 */
  replyStarted?: boolean;
}

/** 中转自己写的额度错误码（`internal/api/middleware/quota_admission.go`、`quota_policy.go`）。 */
const RELAY_QUOTA_CODES: ReadonlySet<string> = new Set([
  "concurrency_limit_exceeded",
  "rpm_limit_exceeded",
  "tpm_limit_exceeded",
  "daily_limit_exceeded",
  "total_quota_exceeded",
  "spending_limit_exceeded",
  "daily_spending_limit_exceeded",
  "period_spending_limit_exceeded",
  "request_limit_exceeded",
  "token_limit_exceeded",
]);

/** 调度器没有账号可选时的错误码（`sdk/cliproxy/auth/selector_availability.go`）。 */
const NO_ACCOUNT_CODES: ReadonlySet<string> = new Set([
  "auth_not_found",
  "auth_unavailable",
  "auth_excluded_by_weight",
]);

function quotaWindowOf(facts: FailureFacts): QuotaWindow {
  switch (facts.quotaRejectedBy) {
    case "concurrency":
      return "concurrency";
    case "rpm":
    case "tpm":
      return "minute";
    case "daily":
    case "daily_spending":
      return "day";
    case "total":
    case "spending":
      return "lifetime";
  }
  // 周期额度与访问策略的额度格子：周期写在失败正文里。
  if (facts.quotaPeriod === "day") return "day";
  if (facts.quotaPeriod === "lifetime") return "lifetime";
  switch (facts.code) {
    case "concurrency_limit_exceeded":
      return "concurrency";
    case "rpm_limit_exceeded":
    case "tpm_limit_exceeded":
      return "minute";
    case "daily_limit_exceeded":
    case "daily_spending_limit_exceeded":
      return "day";
    case "total_quota_exceeded":
      return "lifetime";
  }
  return "period";
}

/** 一次失败的上游尝试属于哪一类：先看原因码，没有原因码再看状态码。 */
function attemptCategory(step: Pick<RouteTraceStep, "cause" | "status">): FailureCategory | null {
  switch (normalizeCooldownReason(step.cause)) {
    case "rate_limited":
      return "upstream_rate_limit";
    case "quota_exhausted":
      return "upstream_quota";
    case "unauthorized":
    case "token_refreshing":
    case "reauth_required":
      return "upstream_auth";
    case "payment_required":
      return "upstream_billing";
    case "model_unavailable":
    case "not_found":
      return "upstream_model";
    case "upstream_error":
      return "upstream_server";
  }
  switch (step.cause) {
    case "request_invalid":
      return "upstream_request";
    // 网关自己的内容审核和敏感词拦截（CliRelay `request_moderator.go`、`request_guard.go`）。
    case "content_policy":
      return "content_moderation";
    case "first_token_timeout":
      return "upstream_timeout";
    case "stream_incomplete":
      return "stream_cut";
    case "network_error":
      return "network";
  }
  return statusCategory(step.status);
}

function statusCategory(status: number): FailureCategory | null {
  if (status === 429) return "upstream_rate_limit";
  if (status === 401) return "upstream_auth";
  if (status === 402 || status === 403) return "upstream_billing";
  if (status === 404) return "upstream_model";
  if (status >= 500) return "upstream_server";
  if (status >= 400) return "upstream_request";
  return null;
}

export function explainFailure(facts: FailureFacts): FailureExplanation | null {
  if (facts.loopGuardKind) {
    return {
      category: "loop_guard",
      loopGuardKind: facts.loopGuardKind === "tool_loop" ? "tool_loop" : "reply_loop",
      loopGuardSource: facts.loopGuardSource === "tenant" ? "tenant" : "api_key",
    };
  }
  // 网关在调度之前就拒绝的：没有路由轨迹。上游的错误码可能恰好同名，所以额度错误码只在请求根本
  // 没到上游时才认。
  if (
    facts.quotaRejectedBy ||
    facts.source === "local_quota" ||
    (RELAY_QUOTA_CODES.has(facts.code) && facts.upstreamStatus === 0)
  ) {
    return { category: "key_quota", quotaWindow: quotaWindowOf(facts) };
  }
  if (facts.code === "quota_usage_unavailable") return { category: "quota_unavailable" };
  if (facts.source === "local_auth") {
    return { category: facts.code === "tenant_unavailable" ? "tenant_unavailable" : "relay_auth" };
  }
  if (facts.source === "local_route") return { category: "route" };

  // 一条日志对应一次上游尝试，轨迹却记着整个请求：先看这条日志的那次尝试（轨迹结尾前最近一次
  // 失败的尝试），而不是请求最后的结局——第一次 429、第二次客户端断开时，第一条日志说的是 429。
  const lead = facts.trace ? routeTraceVerdict(facts.trace).lead : null;
  switch (lead?.kind) {
    case "client_left":
      return { category: "client_canceled" };
    case "failed": {
      const category = attemptCategory(lead.attempt);
      if (category === "stream_cut") {
        return { category, replyStarted: !lead.attempt.beforeFirstByte };
      }
      if (category === "upstream_request" && facts.code === "context_length_exceeded") {
        return { category: "context_length" };
      }
      if (category) return { category };
      break;
    }
    case "no_member":
      return { category: "virtual_model" };
    case "no_account":
    case "queue_gave_up":
      return { category: "no_account" };
  }

  // 没有轨迹（旧日志）或轨迹说明不了：按回给客户端的错误码和状态码。
  if (facts.code === "content_policy_violation" && facts.upstreamStatus === 0) {
    return { category: "content_moderation" };
  }
  if (facts.code === "virtual_model_unavailable") return { category: "virtual_model" };
  if (facts.code === "context_length_exceeded") return { category: "context_length" };
  if (NO_ACCOUNT_CODES.has(facts.code)) return { category: "no_account" };
  if (facts.status === 499) return { category: "client_canceled" };
  const category = statusCategory(facts.upstreamStatus || facts.status);
  return category ? { category } : null;
}

/** 网关自己拒绝或结束的失败：错误响应是网关写的，不是上游的。 */
const GATEWAY_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  "loop_guard",
  "key_quota",
  "quota_unavailable",
  "relay_auth",
  "tenant_unavailable",
  "route",
  "content_moderation",
  "virtual_model",
  "no_account",
]);

/** 错误响应是不是网关自己写的：请求没到上游，或网关记下了是自己拒绝的。 */
export function answeredByGateway(facts: FailureFacts, explanation: FailureExplanation | null): boolean {
  if (facts.source.startsWith("local_")) return true;
  return facts.upstreamStatus === 0 && explanation !== null && GATEWAY_CATEGORIES.has(explanation.category);
}

/** 会自己恢复的失败：路由轨迹已经写明账号暂停到几点时，不再泛泛地说一遍。 */
const SELF_RECOVERING: ReadonlySet<FailureCategory> = new Set([
  "upstream_rate_limit",
  "upstream_quota",
  "upstream_server",
  "network",
]);

/**
 * 弹窗文案的 i18n key：标题说发生了什么，提示说接下来怎么办。traced 表示弹窗已经显示了路由轨迹的
 * 结论（哪次尝试失败、换到了谁、账号暂停到几点），这时只留轨迹说不出的那部分。
 */
export function failureExplanationKeys(
  explanation: FailureExplanation,
  traced: boolean,
): { label: string; hint: string | null } {
  const { category } = explanation;
  switch (category) {
    case "loop_guard":
      return {
        label: `error_detail.category.loop_guard_${explanation.loopGuardKind === "tool_loop" ? "tool" : "reply"}`,
        hint: `error_detail.hint.loop_guard_${explanation.loopGuardSource ?? "api_key"}`,
      };
    case "key_quota":
      return {
        label: "error_detail.category.key_quota",
        hint: `error_detail.hint.key_quota_${explanation.quotaWindow ?? "period"}`,
      };
    case "stream_cut":
      return {
        label: "error_detail.category.stream_cut",
        hint:
          explanation.replyStarted === false
            ? "error_detail.hint.stream_cut_before"
            : "error_detail.hint.stream_cut",
      };
    default:
      return {
        label: `error_detail.category.${category}`,
        hint: traced && SELF_RECOVERING.has(category) ? null : `error_detail.hint.${category}`,
      };
  }
}
