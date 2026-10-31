import { describe, expect, test } from "vitest";
import {
  earliestCandidateRecovery,
  formatStepDuration,
  normalizeRouteTrace,
  readRouteTrace,
  routeTraceVerdict,
  type RouteTrace,
} from "../log-content/routeTrace";

// Steps as CliRelay writes them into detail_content.diagnostic.route_trace.
const failedOnA = {
  kind: "attempt",
  at: "2026-11-01T05:10:00.000+08:00",
  duration_ms: 1200,
  attempt: 1,
  group: "default",
  auth_id: "codex-a.json",
  auth_label: "Team A",
  provider: "codex",
  model: "gpt-5-codex",
  outcome: "failed",
  status: 429,
  cause: "rate_limited",
  error: "rate_limit: too many requests per minute",
  blocked: "cooldown",
  blocked_until: "2026-11-01T05:15:01.200+08:00",
};
const onB = {
  kind: "attempt",
  at: "2026-11-01T05:10:01.250+08:00",
  attempt: 2,
  group: "default",
  auth_id: "codex-b.json",
  auth_label: "Team B",
  provider: "codex",
  model: "gpt-5-codex",
};

const trace = (raw: Record<string, unknown>): RouteTrace => {
  const parsed = normalizeRouteTrace(raw);
  if (!parsed) throw new Error("fixture is not a trace");
  return parsed;
};

describe("normalizeRouteTrace", () => {
  test("reads a trace and keeps unknown kinds, outcomes and causes as sent", () => {
    const parsed = trace({
      pinned: true,
      steps: [
        { ...failedOnA, cause: "some_new_cause" },
        { kind: "future_kind", at: "2026-11-01T05:10:02+08:00" },
      ],
    });
    expect(parsed.pinned).toBe(true);
    expect(parsed.steps.map((step) => step.kind)).toEqual(["attempt", "future_kind"]);
    expect(parsed.steps[0]).toMatchObject({
      attempt: 1,
      authId: "codex-a.json",
      authLabel: "Team A",
      outcome: "failed",
      status: 429,
      cause: "some_new_cause",
      blocked: "cooldown",
      blockedUntil: "2026-11-01T05:15:01.200+08:00",
      durationMs: 1200,
      optimistic: false,
      candidates: [],
    });
  });

  test("is null for anything that is not a trace with steps, and drops broken steps", () => {
    for (const raw of [
      null,
      "steps",
      [],
      {},
      { steps: "x" },
      { steps: [] },
      { steps: [null, 3, {}] },
    ]) {
      expect(normalizeRouteTrace(raw)).toBeNull();
    }
    const parsed = trace({ steps: [{}, failedOnA, { kind: "" }] });
    expect(parsed.steps).toHaveLength(1);
  });

  test("keeps the omitted marker only where it falls between two kept steps", () => {
    const steps = Array.from({ length: 32 }, (_, index) => ({ ...onB, attempt: index + 1 }));
    expect(trace({ steps, omitted: 5, omitted_after: 8 })).toMatchObject({
      omitted: 5,
      omittedAfter: 8,
    });
    for (const omittedAfter of [0, 32, 40]) {
      expect(trace({ steps, omitted: 5, omitted_after: omittedAfter })).toMatchObject({
        omitted: 0,
        omittedAfter: 0,
      });
    }
  });

  test("drops candidates without an account and reads the rest", () => {
    const parsed = trace({
      steps: [
        {
          kind: "exhausted",
          at: "2026-11-01T05:10:02+08:00",
          candidates: [
            { auth_id: "codex-a.json", state: "tried", until: "2026-11-01T05:15:01+08:00" },
            { label: "no id" },
            "junk",
          ],
          candidates_omitted: 3,
        },
      ],
    });
    expect(parsed.steps[0].candidates).toEqual([
      {
        authId: "codex-a.json",
        label: "",
        provider: "",
        state: "tried",
        until: "2026-11-01T05:15:01+08:00",
        cause: "",
        status: 0,
      },
    ]);
    expect(parsed.steps[0].candidatesOmitted).toBe(3);
  });

  test("finds the trace in the request details' diagnostic", () => {
    expect(
      readRouteTrace({ diagnostic: { route_trace: { steps: [failedOnA] } } })?.steps,
    ).toHaveLength(1);
    expect(readRouteTrace({ diagnostic: {} })).toBeNull();
    expect(readRouteTrace({ route_trace: { steps: [failedOnA] } })).toBeNull();
    expect(readRouteTrace(null)).toBeNull();
  });
});

describe("routeTraceVerdict", () => {
  test("a success after a failover counts the failed attempts before it", () => {
    const served = trace({ steps: [failedOnA, { ...onB, outcome: "success", duration_ms: 3400 }] });
    expect(routeTraceVerdict(served)).toMatchObject({
      lead: { kind: "served", failedBefore: 1, attempt: { authId: "codex-b.json" } },
      next: null,
    });
    // The attempt number also counts attempts the trace dropped from its middle.
    const long = trace({ steps: [{ ...onB, attempt: 31, outcome: "success" }] });
    expect(routeTraceVerdict(long).lead).toMatchObject({ kind: "served", failedBefore: 30 });
  });

  test("a failed attempt's row ends with the attempt that came next", () => {
    expect(routeTraceVerdict(trace({ steps: [failedOnA, onB] }))).toMatchObject({
      lead: { kind: "failed", attempt: { authId: "codex-a.json" } },
      next: { kind: "moved_on", attempt: { authId: "codex-b.json" } },
    });
  });

  test("says why a failure was not tried on another account", () => {
    expect(routeTraceVerdict(trace({ pinned: true, steps: [failedOnA] })).next).toEqual({
      kind: "not_retried",
      why: "pinned",
    });
    for (const cause of ["request_invalid", "content_policy"]) {
      expect(
        routeTraceVerdict(trace({ steps: [{ ...failedOnA, status: 400, cause }] })).next,
      ).toEqual({ kind: "not_retried", why: "request" });
    }
    // A failure the scheduler simply did not follow up names no reason it cannot know.
    expect(routeTraceVerdict(trace({ steps: [failedOnA] }))).toMatchObject({
      lead: { kind: "failed" },
      next: null,
    });
  });

  test("an exhausted pool, a queue and a wait follow the failure they came after", () => {
    const exhausted = { kind: "exhausted", at: "2026-11-01T05:10:01.300+08:00", status: 429 };
    expect(routeTraceVerdict(trace({ steps: [failedOnA, exhausted] }))).toMatchObject({
      lead: { kind: "failed", attempt: { authId: "codex-a.json" } },
      next: { kind: "exhausted" },
    });
    const skip = {
      kind: "skip",
      at: "2026-11-01T05:10:01.260+08:00",
      reason: "saturated",
      auth_id: "codex-b.json",
    };
    const queue = { kind: "queue", at: "2026-11-01T05:10:01.270+08:00", accounts: 1 };
    expect(routeTraceVerdict(trace({ steps: [failedOnA, skip, queue] }))).toMatchObject({
      lead: { kind: "failed" },
      next: { kind: "queued" },
    });
    const wait = {
      kind: "wait",
      at: "2026-11-01T05:10:01.310+08:00",
      wait_kind: "request-retry",
      planned_ms: 15_000,
    };
    expect(routeTraceVerdict(trace({ steps: [failedOnA, exhausted, wait] }))).toMatchObject({
      lead: { kind: "failed", attempt: { authId: "codex-a.json" } },
      next: { kind: "waiting", wait: { waitKind: "request-retry", plannedMs: 15_000 } },
    });
    // No attempt before: the pass that found no account leads.
    expect(routeTraceVerdict(trace({ steps: [exhausted, wait] }))).toMatchObject({
      lead: { kind: "no_account" },
      next: { kind: "waiting" },
    });
    expect(routeTraceVerdict(trace({ steps: [exhausted] }))).toMatchObject({
      lead: { kind: "no_account" },
      next: null,
    });
  });

  test("names a client that left, whatever the request was doing", () => {
    expect(
      routeTraceVerdict(trace({ steps: [{ ...onB, outcome: "canceled" }] })).lead,
    ).toMatchObject({
      kind: "client_left",
      step: { kind: "attempt" },
    });
    for (const kind of ["queue", "wait"]) {
      expect(
        routeTraceVerdict(trace({ steps: [failedOnA, { kind, at: onB.at, outcome: "canceled" }] })),
      ).toMatchObject({ lead: { kind: "client_left", step: { kind } }, next: null });
    }
  });

  test("a queue that timed out and an attempt still running lead on their own", () => {
    expect(
      routeTraceVerdict(
        trace({ steps: [{ kind: "queue", at: onB.at, outcome: "failed", duration_ms: 30_000 }] }),
      ).lead,
    ).toMatchObject({ kind: "queue_gave_up", queue: { durationMs: 30_000 } });
    expect(routeTraceVerdict(trace({ steps: [onB] })).lead).toMatchObject({ kind: "running" });
  });

  test("draws no conclusion from a trace that ends on a skip with nothing failed before", () => {
    expect(
      routeTraceVerdict(trace({ steps: [{ kind: "skip", at: onB.at, reason: "saturated" }] })),
    ).toEqual({ lead: null, next: null });
  });
});

describe("helpers", () => {
  test("the earliest recovery among the candidates", () => {
    const step = trace({
      steps: [
        {
          kind: "exhausted",
          at: "2026-11-01T05:10:02+08:00",
          candidates: [
            { auth_id: "a", until: "2026-11-01T06:00:00+08:00" },
            { auth_id: "b", state: "saturated" },
            { auth_id: "c", until: "2026-11-01T05:20:00+08:00" },
          ],
        },
      ],
    }).steps[0];
    expect(earliestCandidateRecovery(step)).toBe("2026-11-01T05:20:00+08:00");
    expect(earliestCandidateRecovery({ ...step, candidates: [] })).toBe("");
  });

  test("step durations round before they pick a unit", () => {
    expect(formatStepDuration(0)).toBe("0ms");
    expect(formatStepDuration(0.4)).toBe("<1ms");
    expect(formatStepDuration(850)).toBe("850ms");
    expect(formatStepDuration(999.6)).toBe("1.00s");
    expect(formatStepDuration(1250)).toBe("1.25s");
    expect(formatStepDuration(9_999)).toBe("10.0s");
    expect(formatStepDuration(59_960)).toBe("1m 00s");
    expect(formatStepDuration(125_000)).toBe("2m 05s");
    expect(formatStepDuration(Number.NaN)).toBe("0ms");
  });
});
