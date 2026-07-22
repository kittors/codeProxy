import { describe, expect, test } from "vitest";
import {
  applyAccountStatuses,
  isAccountStatusFresher,
  mapAccountStatusToQuotaState,
  readAccountStatusFreshness,
} from "../mapAccountStatusToUi";
import type { AiAccountLatestStatusDto } from "@code-proxy/api-client";

describe("mapAccountStatusToUi", () => {
  test("maps quota + lifetime usage + reset credits by subject/index", () => {
    const accounts: AiAccountLatestStatusDto[] = [
      {
        auth_subject_id: "sub-77",
        auth_index: "77",
        plan_type: "plus",
        health_status: "ok",
        quotas: [
          {
            quota_key: "code_5h",
            quota_label: "m_quota.code_5h",
            percent: 55,
            value: "55%",
            meta: "meta",
          },
        ],
        usage: {
          request_total: 100,
          success_total: 90,
          failure_total: 10,
          request_total_30d: 80,
          success_total_30d: 72,
          failure_total_30d: 8,
          cycle_request_total: 4,
          cycle_cost_total: 0.5,
          weekly_quota_used_percent: 12,
          cycle_known: true,
        },
        reset_credit_count: 3,
        reset_credit_expirations: ["2026-08-01T00:00:00Z"],
        upstream_checked_at: "2026-07-16T12:00:00.000Z",
      },
    ];

    const patch = applyAccountStatuses(accounts);
    expect(patch.quotaByKey["sub-77"]?.status).toBe("success");
    expect(patch.quotaByKey["77"]?.items[0]?.percent).toBe(55);
    expect(patch.quotaByKey["77"]?.items[0]?.value).toBe("55%");
    expect(patch.quotaByKey["77"]?.resetCreditCount).toBe(3);
    expect(patch.cycleByKey["77"]?.calls).toBe(4);
    expect(patch.entityStats.auth_index[0]).toMatchObject({
      entity_name: "77",
      requests: 100,
      failed: 10,
    });
    expect(patch.planTypeByKey["sub-77"]).toBe("plus");
  });

  test("error health without quotas becomes error state", () => {
    const state = mapAccountStatusToQuotaState({
      auth_index: "x",
      health_status: "error",
      error_message: "upstream_timeout",
      quotas: [],
    });
    expect(state.status).toBe("error");
    expect(state.error).toBe("upstream_timeout");
  });

  test("unknown cycle does not emit a cycle snapshot that would wipe local 本周期", () => {
    const patch = applyAccountStatuses([
      {
        auth_index: "77",
        auth_subject_id: "sub-77",
        quotas: [],
        usage: {
          cycle_known: false,
          cycle_request_total: 0,
          request_total: 89,
        },
      },
    ]);
    expect(patch.cycleByKey["77"]).toBeUndefined();
    expect(patch.cycleByKey["sub-77"]).toBeUndefined();
  });

  test("isAccountStatusFresher prefers version then time", () => {
    expect(
      isAccountStatusFresher({ version: 2, timeMs: 1 }, { version: 1, timeMs: 99 }),
    ).toBe(true);
    expect(
      isAccountStatusFresher({ version: 1, timeMs: 99 }, { version: 2, timeMs: 1 }),
    ).toBe(false);
    expect(
      isAccountStatusFresher(
        { version: null, timeMs: 200 },
        { version: null, timeMs: 100 },
      ),
    ).toBe(true);
    expect(
      isAccountStatusFresher(
        { version: null, timeMs: 100 },
        { version: null, timeMs: 200 },
      ),
    ).toBe(false);
    // Unstamped progressive/final must not be blocked by stamped first paint.
    expect(
      isAccountStatusFresher(
        { version: null, timeMs: null },
        { version: null, timeMs: 100 },
      ),
    ).toBe(true);
    expect(isAccountStatusFresher({ version: 1, timeMs: null }, null)).toBe(true);
  });

  test("allows usage updates when the status version does not change", () => {
    const current = readAccountStatusFreshness({
      version: 7,
      updated_at: "2026-07-16T12:00:00.000Z",
      usage: {
        updated_at: "2026-07-16T11:00:00.000Z",
        cycle_request_total: 10,
      },
    });
    const newerUsage = readAccountStatusFreshness({
      version: 7,
      updated_at: "2026-07-16T10:00:00.000Z",
      usage: {
        updated_at: "2026-07-16T13:00:00.000Z",
        cycle_request_total: 10,
      },
    });
    const changedCycle = readAccountStatusFreshness({
      version: 7,
      updated_at: "2026-07-16T10:00:00.000Z",
      usage: { cycle_request_total: 11 },
    });

    expect(isAccountStatusFresher(newerUsage, current)).toBe(true);
    expect(isAccountStatusFresher(changedCycle, current)).toBe(true);
    expect(
      applyAccountStatuses([
        {
          auth_index: "77",
          version: 7,
          quotas: [],
          usage: { cycle_known: true, cycle_request_total: 11 },
        },
      ]).cycleByKey["77"]?.calls,
    ).toBe(11);
  });

  test("readAccountStatusFreshness uses server fields only", () => {
    expect(
      readAccountStatusFreshness({
        version: "7",
        upstream_checked_at: "2026-07-16T12:00:00.000Z",
        updated_at: "2026-07-16T11:00:00.000Z",
      }),
    ).toEqual({
      version: 7,
      timeMs: Date.parse("2026-07-16T12:00:00.000Z"),
      usageTimeMs: null,
      cycleRequestTotal: null,
    });
  });
});
