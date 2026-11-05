import { describe, expect, test } from "vitest";
import type {
  RoutingSimulationCredential,
  RoutingSimulationGroup,
  RoutingSimulationResult,
} from "@code-proxy/api-client/endpoints/routing-simulation";
import {
  credentialName,
  durationParts,
  findCredential,
  formatList,
  msUntil,
  percent,
  simulationOutcome,
  splitCredentials,
} from "../simulationView";

const credential = (
  authID: string,
  extra: Partial<RoutingSimulationCredential> = {},
): RoutingSimulationCredential => ({
  "auth-id": authID,
  provider: "codex",
  weight: 1,
  "in-flight": 0,
  "load-ratio": 0,
  ...extra,
});

const group = (
  name: string,
  credentials: RoutingSimulationCredential[],
): RoutingSimulationGroup => ({
  name,
  distribution: "weighted",
  credentials,
});

const result = (extra: Partial<RoutingSimulationResult>): RoutingSimulationResult => ({
  "api-key": { id: "key-1" },
  endpoint: "chat-completions",
  "requested-model": "gpt-5",
  stages: [],
  ...extra,
});

describe("simulationOutcome", () => {
  test("names the stage that rejects the request", () => {
    expect(
      simulationOutcome(
        result({
          rejection: { stage: "model-gate", "http-status": 403, code: "model_not_allowed" },
          stages: [
            { name: "auth", outcome: "passed" },
            { name: "model-gate", outcome: "rejected" },
          ],
        }),
      ),
    ).toEqual({
      kind: "rejected",
      stage: "model-gate",
      error: { stage: "model-gate", "http-status": 403, code: "model_not_allowed" },
    });
  });

  test("falls back to the rejected stage in the list when the error does not name one", () => {
    const outcome = simulationOutcome(
      result({
        rejection: { "http-status": 401 },
        stages: [{ name: "auth", outcome: "rejected" }],
      }),
    );
    expect(outcome).toMatchObject({ kind: "rejected", stage: "auth" });
  });

  test("reports the first attempt and how many accounts can take over after it", () => {
    const first = credential("auth-a", { label: "Team A", attempt: 1 });
    const outcome = simulationOutcome(
      result({
        selection: {
          model: "gpt-5",
          "model-key": "gpt-5",
          providers: ["codex"],
          groups: [group("team", [first, credential("auth-b", { attempt: 2 })])],
          attempts: [
            { "auth-id": "auth-a", group: "team", "upstream-model": "gpt-5" },
            { "auth-id": "auth-b", group: "team" },
            { "auth-id": "auth-c", group: "" },
          ],
        },
      }),
    );
    expect(outcome).toEqual({
      kind: "served",
      attempt: { "auth-id": "auth-a", group: "team", "upstream-model": "gpt-5" },
      credential: first,
      failovers: 2,
    });
  });

  test("reports the wait a request takes when no account can serve it", () => {
    const outcome = simulationOutcome(
      result({
        selection: {
          model: "gpt-5",
          "model-key": "gpt-5",
          providers: ["codex"],
          groups: [],
          attempts: [],
          error: { "http-status": 429, code: "model_cooldown" },
          "retry-wait-ms": 40_000,
          "retry-wait-kind": "busy-wait",
        },
      }),
    );
    expect(outcome).toEqual({
      kind: "unavailable",
      error: { "http-status": 429, code: "model_cooldown" },
      retryWaitMs: 40_000,
      retryWaitKind: "busy-wait",
    });
  });

  test("treats a missing wait kind as failing at once", () => {
    const outcome = simulationOutcome(
      result({
        selection: {
          model: "gpt-5",
          "model-key": "gpt-5",
          providers: [],
          groups: [],
          attempts: [],
          "retry-wait-kind": "",
        },
      }),
    );
    expect(outcome).toEqual({
      kind: "unavailable",
      error: undefined,
      retryWaitMs: 0,
      retryWaitKind: undefined,
    });
  });
});

describe("findCredential", () => {
  test("prefers the account in the group the attempt was picked from", () => {
    const inTeam = credential("auth-a", { label: "in team" });
    const inDefault = credential("auth-a", { label: "in default" });
    const groups = [group("", [inDefault]), group("team", [inTeam])];
    expect(findCredential(groups, { "auth-id": "auth-a", group: "team" })).toBe(inTeam);
    expect(findCredential(groups, { "auth-id": "auth-a", group: "other" })).toBe(inDefault);
    expect(findCredential(groups, { "auth-id": "missing", group: "team" })).toBeUndefined();
  });
});

describe("credentialName", () => {
  test("uses the label and falls back to the id", () => {
    expect(credentialName({ "auth-id": "auth-a", label: " Team A " })).toBe("Team A");
    expect(credentialName({ "auth-id": "auth-a", label: "  " })).toBe("auth-a");
    expect(credentialName({ "auth-id": "auth-a" })).toBe("auth-a");
  });
});

describe("splitCredentials", () => {
  test("lists candidates in attempt order, the rest by name, and the excluded apart", () => {
    const { candidates, excluded } = splitCredentials(
      group("team", [
        credential("auth-z", { label: "Zed", blocked: "cooldown" }),
        credential("auth-2", { label: "Second", attempt: 2 }),
        credential("auth-x", { label: "Excluded B", excluded: "channel" }),
        credential("auth-a", { label: "Alpha", blocked: "unavailable" }),
        credential("auth-1", { label: "First", attempt: 1 }),
        credential("auth-y", { label: "Excluded A", excluded: "model" }),
      ]),
    );
    expect(candidates.map((c) => c["auth-id"])).toEqual(["auth-1", "auth-2", "auth-a", "auth-z"]);
    expect(excluded.map((c) => c["auth-id"])).toEqual(["auth-y", "auth-x"]);
  });

  test.each([[[1, 3, 2]], [[3, 1, 2]], [[2, 3, 1]]])(
    "orders attempts by number whatever order they arrive in: %o",
    (order) => {
      const { candidates } = splitCredentials(
        group(
          "team",
          order.map((n) => credential(`auth-${n}`, { label: `Account ${4 - n}`, attempt: n })),
        ),
      );
      expect(candidates.map((c) => c.attempt)).toEqual([1, 2, 3]);
    },
  );
});

describe("durationParts", () => {
  test.each([
    [0, { unit: "second", count: 1 }],
    [1_200, { unit: "second", count: 2 }],
    [59_000, { unit: "second", count: 59 }],
    // 59.5 秒向上取整是 60 秒，要换成「1 分钟」，不显示「60 秒」。
    [59_500, { unit: "minute", count: 1 }],
    [61_000, { unit: "minute", count: 2 }],
    [59 * 60_000, { unit: "minute", count: 59 }],
    [61 * 60_000, { unit: "hour", count: 1 }],
    [90 * 60_000, { unit: "hour", count: 2 }],
    [47 * 3_600_000, { unit: "hour", count: 47 }],
    [48 * 3_600_000, { unit: "day", count: 2 }],
    [-5_000, { unit: "second", count: 1 }],
  ])("%d ms → %o", (ms, expected) => {
    expect(durationParts(ms)).toEqual(expected);
  });
});

describe("msUntil", () => {
  test("measures from the given time and ignores what does not parse", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(msUntil("2026-11-01T00:01:00Z", now)).toBe(60_000);
    expect(msUntil("2026-10-31T23:59:00Z", now)).toBe(-60_000);
    expect(msUntil("not a time", now)).toBeNull();
    expect(msUntil(undefined, now)).toBeNull();
  });
});

describe("percent", () => {
  test("rounds and clamps to 0–100%", () => {
    expect(percent(0.123)).toBe("12%");
    expect(percent(1.4)).toBe("100%");
    expect(percent(-0.2)).toBe("0%");
  });
});

describe("formatList", () => {
  test("joins the way the interface language reads", () => {
    expect(formatList(["team", "pro"], "en")).toBe("team and pro");
    expect(formatList(["team", "pro"], "ru")).toBe("team и pro");
    expect(formatList(["team"], "en")).toBe("team");
    // 中文用顿号和「和」，不是英文逗号。具体写法跟着 ICU 走，只看分隔符。
    const zh = formatList(["team", "pro", "max"], "zh-CN");
    expect(zh).toMatch(/^team.+pro.+max$/);
    expect(zh).not.toContain(",");
  });

  test("falls back to commas when the language tag is not one Intl accepts", () => {
    expect(formatList(["team", "pro"], "not a language")).toBe("team, pro");
  });
});
