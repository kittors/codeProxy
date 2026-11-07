import { describe, expect, test } from "vitest";
import { normalizeRouteTrace } from "../../log-content/routeTrace";
import {
  answeredByGateway,
  explainFailure,
  failureExplanationKeys,
  type FailureExplanation,
} from "../explainFailure";
import { readFailureFacts, type FailureFacts } from "../failureFacts";

const facts = (patch: Partial<FailureFacts> = {}): FailureFacts => ({
  status: 0,
  upstreamStatus: 0,
  code: "",
  type: "",
  source: "",
  quotaRejectedBy: "",
  quotaPeriod: "",
  loopGuardKind: "",
  loopGuardSource: "",
  trace: null,
  ...patch,
});

const at = (second: number) => `2026-11-01T01:00:${String(second).padStart(2, "0")}Z`;

/** A trace whose first attempt failed as given; `then` is what the scheduler did next. */
function failedThen(failure: Record<string, unknown>, then: Record<string, unknown>[] = []) {
  return normalizeRouteTrace({
    steps: [
      { kind: "attempt", at: at(0), attempt: 1, auth_id: "a", auth_label: "A", outcome: "failed", ...failure },
      ...then,
    ],
  });
}

const movedOn = [{ kind: "attempt", at: at(2), attempt: 2, auth_id: "b", auth_label: "B" }];

const category = (input: Partial<FailureFacts>) => explainFailure(facts(input))?.category ?? null;

describe("explainFailure", () => {
  test("names what loop protection did and where it was switched on", () => {
    expect(explainFailure(facts({ loopGuardKind: "tool_loop", loopGuardSource: "tenant" }))).toEqual({
      category: "loop_guard",
      loopGuardKind: "tool_loop",
      loopGuardSource: "tenant",
    });
    expect(explainFailure(facts({ loopGuardKind: "reply_loop", loopGuardSource: "api_key" }))).toEqual({
      category: "loop_guard",
      loopGuardKind: "reply_loop",
      loopGuardSource: "api_key",
    });
  });

  test("tells the key's limits apart by when they recover", () => {
    const window = (input: Partial<FailureFacts>) => explainFailure(facts(input))?.quotaWindow;
    expect(window({ quotaRejectedBy: "concurrency" })).toBe("concurrency");
    expect(window({ quotaRejectedBy: "rpm" })).toBe("minute");
    expect(window({ quotaRejectedBy: "tpm" })).toBe("minute");
    expect(window({ quotaRejectedBy: "daily" })).toBe("day");
    expect(window({ quotaRejectedBy: "daily_spending" })).toBe("day");
    expect(window({ quotaRejectedBy: "total" })).toBe("lifetime");
    expect(window({ quotaRejectedBy: "spending" })).toBe("lifetime");
    expect(window({ quotaRejectedBy: "period_spending", quotaPeriod: "week" })).toBe("period");
    expect(window({ quotaRejectedBy: "quota_limits", quotaPeriod: "lifetime" })).toBe("lifetime");
    expect(window({ quotaRejectedBy: "quota_limits", quotaPeriod: "day" })).toBe("day");
    // An older log with only the response code the gateway wrote.
    expect(window({ source: "local_quota", code: "daily_limit_exceeded" })).toBe("day");
    expect(window({ code: "rpm_limit_exceeded", status: 429 })).toBe("minute");
  });

  test("does not take an upstream's code for the key's own limit", () => {
    expect(category({ code: "request_limit_exceeded", status: 429, upstreamStatus: 429 })).toBe(
      "upstream_rate_limit",
    );
  });

  test("recognises what the gateway refused before scheduling", () => {
    expect(category({ code: "quota_usage_unavailable", status: 503 })).toBe("quota_unavailable");
    expect(category({ source: "local_auth", code: "authentication_failed", status: 401 })).toBe(
      "relay_auth",
    );
    expect(category({ source: "local_auth", code: "tenant_unavailable", status: 403 })).toBe(
      "tenant_unavailable",
    );
    expect(category({ source: "local_route", code: "channel_group_forbidden", status: 403 })).toBe(
      "route",
    );
    expect(category({ code: "content_policy_violation", status: 403 })).toBe("content_moderation");
    expect(category({ code: "virtual_model_unavailable", status: 403 })).toBe("virtual_model");
    expect(category({ code: "auth_unavailable", status: 503 })).toBe("no_account");
    expect(category({ code: "context_length_exceeded", status: 400, upstreamStatus: 400 })).toBe(
      "context_length",
    );
  });

  test("reads the attempt of this log from the route trace", () => {
    const failedWith = (failure: Record<string, unknown>) =>
      category({ trace: failedThen(failure, movedOn) });
    expect(failedWith({ status: 429, cause: "rate_limited" })).toBe("upstream_rate_limit");
    expect(failedWith({ status: 429, cause: "quota_exhausted" })).toBe("upstream_quota");
    expect(failedWith({ status: 401, cause: "reauth_required" })).toBe("upstream_auth");
    expect(failedWith({ status: 402, cause: "payment_required" })).toBe("upstream_billing");
    expect(failedWith({ status: 404, cause: "model_unavailable" })).toBe("upstream_model");
    expect(failedWith({ status: 502, cause: "upstream_error" })).toBe("upstream_server");
    expect(failedWith({ status: 400, cause: "request_invalid" })).toBe("upstream_request");
    expect(failedWith({ status: 403, cause: "content_policy" })).toBe("content_moderation");
    expect(failedWith({ cause: "first_token_timeout" })).toBe("upstream_timeout");
    expect(failedWith({ cause: "network_error" })).toBe("network");
    // A cause it does not know falls back to the status.
    expect(failedWith({ status: 503, cause: "something_new" })).toBe("upstream_server");
  });

  test("a later attempt the client left does not hide this attempt's failure", () => {
    // The first attempt's log: its trace stops where the scheduler moved on.
    expect(category({ status: 499, trace: failedThen({ status: 429, cause: "rate_limited" }, movedOn) })).toBe(
      "upstream_rate_limit",
    );
    // The second attempt's log: the client left while it ran.
    const left = failedThen({ status: 429, cause: "rate_limited" }, [
      { ...movedOn[0], outcome: "canceled" },
    ]);
    expect(category({ status: 499, trace: left })).toBe("client_canceled");
    expect(category({ status: 499 })).toBe("client_canceled");
  });

  test("says whether a broken stream had already reached the client", () => {
    expect(
      explainFailure(facts({ trace: failedThen({ cause: "stream_incomplete" }) })),
    ).toEqual({ category: "stream_cut", replyStarted: true });
    expect(
      explainFailure(
        facts({ trace: failedThen({ cause: "stream_incomplete", before_first_byte: true }, movedOn) }),
      ),
    ).toEqual({ category: "stream_cut", replyStarted: false });
  });

  test("a trace with no account left, or a queue given up, is no account", () => {
    const exhausted = normalizeRouteTrace({
      steps: [{ kind: "exhausted", at: at(0), candidates: [{ auth_id: "a", state: "cooldown" }] }],
    });
    expect(category({ trace: exhausted })).toBe("no_account");
    const gaveUp = normalizeRouteTrace({
      steps: [{ kind: "queue", at: at(0), outcome: "failed", accounts: 2 }],
    });
    expect(category({ trace: gaveUp })).toBe("no_account");
  });

  test("a virtual model whose members were all passed over", () => {
    const passedOver = normalizeRouteTrace({
      steps: [
        {
          kind: "member",
          at: at(0),
          virtual_model: "smart",
          member: 1,
          members: 1,
          group: "team",
          model: "gpt-5",
          reason: "not_allowed",
        },
      ],
    });
    expect(category({ trace: passedOver })).toBe("virtual_model");
  });

  test("falls back to the status, and to nothing when there is none", () => {
    expect(category({ upstreamStatus: 401 })).toBe("upstream_auth");
    expect(category({ upstreamStatus: 403 })).toBe("upstream_billing");
    expect(category({ upstreamStatus: 404 })).toBe("upstream_model");
    expect(category({ upstreamStatus: 400 })).toBe("upstream_request");
    expect(category({ status: 529 })).toBe("upstream_server");
    expect(explainFailure(facts())).toBeNull();
  });
});

describe("failureExplanationKeys", () => {
  const keys = (explanation: FailureExplanation, traced = false) =>
    failureExplanationKeys(explanation, traced);

  test("picks the hint for the limit, the loop check and the broken stream", () => {
    expect(keys({ category: "key_quota", quotaWindow: "minute" })).toEqual({
      label: "error_detail.category.key_quota",
      hint: "error_detail.hint.key_quota_minute",
    });
    expect(keys({ category: "loop_guard", loopGuardKind: "tool_loop", loopGuardSource: "tenant" })).toEqual({
      label: "error_detail.category.loop_guard_tool",
      hint: "error_detail.hint.loop_guard_tenant",
    });
    expect(keys({ category: "stream_cut", replyStarted: false }).hint).toBe(
      "error_detail.hint.stream_cut_before",
    );
    expect(keys({ category: "stream_cut", replyStarted: true }).hint).toBe("error_detail.hint.stream_cut");
  });

  test("leaves recovery to the route trace when it already says when", () => {
    expect(keys({ category: "upstream_rate_limit" }, true).hint).toBeNull();
    expect(keys({ category: "upstream_rate_limit" }, false).hint).toBe(
      "error_detail.hint.upstream_rate_limit",
    );
    // What to do about it is not in the trace.
    expect(keys({ category: "upstream_request" }, true).hint).toBe("error_detail.hint.upstream_request");
  });
});

describe("answeredByGateway", () => {
  test("is the gateway's own answer only when the request did not reach the upstream", () => {
    expect(answeredByGateway(facts({ source: "local_quota" }), null)).toBe(true);
    expect(answeredByGateway(facts(), { category: "no_account" })).toBe(true);
    expect(answeredByGateway(facts({ upstreamStatus: 429 }), { category: "no_account" })).toBe(false);
    expect(answeredByGateway(facts(), { category: "upstream_server" })).toBe(false);
  });
});

describe("readFailureFacts", () => {
  test("reads the diagnostic first and the stored error body after", () => {
    const details = {
      diagnostic: {
        response: { status: 429, error_code: "daily_limit_exceeded", source: "local_quota" },
        quota: { rejected: true, rejected_by: "daily", error_code: "daily_limit_exceeded" },
        loop_guard: { kind: "reply_loop", source: "tenant" },
        upstream: { status: 0 },
      },
    };
    expect(readFailureFacts("", details)).toMatchObject({
      status: 429,
      upstreamStatus: 0,
      code: "daily_limit_exceeded",
      source: "local_quota",
      quotaRejectedBy: "daily",
      loopGuardKind: "reply_loop",
      loopGuardSource: "tenant",
      trace: null,
    });
    // Without details: the error object of the body, as a stream event too.
    expect(
      readFailureFacts(
        '{"error":{"code":"period_spending_limit_exceeded","type":"rate_limit_exceeded","period":"week"}}',
        null,
      ),
    ).toMatchObject({ code: "period_spending_limit_exceeded", type: "rate_limit_exceeded", quotaPeriod: "week" });
    expect(
      readFailureFacts(
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
        null,
      ),
    ).toMatchObject({ type: "overloaded_error", code: "" });
    // A quota that was only read, not refused, names no limit.
    expect(
      readFailureFacts("", { diagnostic: { quota: { rejected_by: "daily" } } }).quotaRejectedBy,
    ).toBe("");
  });
});
