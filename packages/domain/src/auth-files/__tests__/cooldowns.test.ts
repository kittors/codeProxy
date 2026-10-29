import { describe, expect, test } from "vitest";
import {
  AUTH_FILE_COOLDOWN_REASONS,
  formatCooldownRemaining,
  normalizeCooldownReason,
  resolveAuthFileModelCooldowns,
  resolveCooldownReasonTone,
} from "../cooldowns";
import { resolveAuthFileRestrictionBadges } from "../authFiles";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const at = (secondsFromNow: number) => new Date(NOW + secondsFromNow * 1000).toISOString();

describe("normalizeCooldownReason", () => {
  test.each(AUTH_FILE_COOLDOWN_REASONS)("recognises %s", (reason) => {
    expect(normalizeCooldownReason(reason)).toBe(reason);
  });

  test("ignores case and surrounding space", () => {
    expect(normalizeCooldownReason("  Rate_Limited ")).toBe("rate_limited");
  });

  test.each([undefined, null, "", "teapot", 429, {}, ["rate_limited"]])(
    "reads %j as no reason, so a code from a newer backend is not guessed at",
    (value) => {
      expect(normalizeCooldownReason(value)).toBeNull();
    },
  );
});

describe("resolveCooldownReasonTone", () => {
  test("a token being renewed is a warning, every other reason keeps the status colour", () => {
    expect(resolveCooldownReasonTone("token_refreshing")).toBe("warning");
    for (const reason of AUTH_FILE_COOLDOWN_REASONS.filter((r) => r !== "token_refreshing")) {
      expect(resolveCooldownReasonTone(reason)).toBeNull();
    }
    expect(resolveCooldownReasonTone(null)).toBeNull();
  });
});

describe("resolveAuthFileModelCooldowns", () => {
  test("an old backend without the field has nothing to retry", () => {
    expect(resolveAuthFileModelCooldowns({}, NOW)).toEqual([]);
    expect(resolveAuthFileModelCooldowns({ model_cooldowns: undefined }, NOW)).toEqual([]);
  });

  test("a field that is not a list is ignored", () => {
    const file = { model_cooldowns: "gpt-5" } as unknown as { model_cooldowns: [] };
    expect(resolveAuthFileModelCooldowns(file, NOW)).toEqual([]);
  });

  test("reads the model, the reason, the end time and the status", () => {
    const [first, second] = resolveAuthFileModelCooldowns(
      {
        model_cooldowns: [
          { model: "gpt-5.5", reason: "rate_limited", until: at(90), http_status: 429 },
          { model: "gpt-5.4-mini", reason: "quota_exhausted", until: at(7200), quota_exceeded: true },
        ],
      },
      NOW,
    );
    expect(first).toEqual({
      model: "gpt-5.5",
      reason: "rate_limited",
      untilMs: NOW + 90_000,
      httpStatus: 429,
    });
    expect(second).toMatchObject({
      model: "gpt-5.4-mini",
      reason: "quota_exhausted",
      untilMs: NOW + 7_200_000,
      httpStatus: null,
    });
  });

  test("drops a cooldown whose time has passed since the list was fetched", () => {
    const cooldowns = resolveAuthFileModelCooldowns(
      {
        model_cooldowns: [
          { model: "ended", until: at(-1) },
          { model: "ends-right-now", until: at(0) },
          { model: "still-cooling", until: at(1) },
        ],
      },
      NOW,
    );
    expect(cooldowns.map((c) => c.model)).toEqual(["still-cooling"]);
  });

  test("keeps a cooldown that has no end time (it waits for a probe)", () => {
    const [entry] = resolveAuthFileModelCooldowns(
      { model_cooldowns: [{ model: "weekly", reason: "quota_exhausted", quota_exceeded: true }] },
      NOW,
    );
    expect(entry).toMatchObject({ model: "weekly", untilMs: null });
  });

  test("accepts epoch seconds as well as ISO times", () => {
    const [entry] = resolveAuthFileModelCooldowns(
      { model_cooldowns: [{ model: "gpt-5", until: Math.floor(NOW / 1000) + 30 }] },
      NOW,
    );
    expect(entry?.untilMs).toBe(Math.floor(NOW / 1000) * 1000 + 30_000);
  });

  test("shows an unknown reason as no reason and skips rows that cannot be retried", () => {
    const cooldowns = resolveAuthFileModelCooldowns(
      {
        model_cooldowns: [
          { model: "  spaced  ", reason: "from_the_future", until: at(60) },
          { model: "", reason: "rate_limited", until: at(60) },
          { model: "   ", until: at(60) },
          null,
          "gpt-5",
          { reason: "rate_limited", until: at(60) },
        ] as never,
      },
      NOW,
    );
    expect(cooldowns).toEqual([
      { model: "spaced", reason: null, untilMs: NOW + 60_000, httpStatus: null },
    ]);
  });

  test("lists a model once, the first entry wins", () => {
    const cooldowns = resolveAuthFileModelCooldowns(
      {
        model_cooldowns: [
          { model: "gpt-5", reason: "rate_limited", until: at(10) },
          { model: "gpt-5", reason: "upstream_error", until: at(500) },
        ],
      },
      NOW,
    );
    expect(cooldowns).toHaveLength(1);
    expect(cooldowns[0]).toMatchObject({ reason: "rate_limited", untilMs: NOW + 10_000 });
  });
});

describe("formatCooldownRemaining", () => {
  const cases: Array<[string, number, string]> = [
    ["under a second still reads as one second", 0.2, "1s"],
    ["seconds", 45, "45s"],
    ["minutes and seconds", 5 * 60 + 12, "5m 12s"],
    ["whole minutes drop the zero seconds", 5 * 60, "5m"],
    ["hours and minutes only", 3600 + 5 * 60 + 3, "1h 5m"],
    ["a whole hour", 3600, "1h"],
    ["days and hours only", 6 * 86400 + 23 * 3600 + 59 * 60 + 59, "6d 23h"],
    ["a week", 7 * 86400, "7d"],
    ["a unit that is skipped does not leave a gap", 86400 + 30, "1d 30s"],
  ];
  test.each(cases)("%s", (_label, seconds, expected) => {
    expect(formatCooldownRemaining(NOW + seconds * 1000, NOW)).toBe(expected);
  });

  test("uses the unit labels it is given, with their own spacing", () => {
    expect(
      formatCooldownRemaining(NOW + 3 * 60_000 + 4_000, NOW, {
        day: " 天",
        hour: " 小时",
        minute: " 分",
        second: " 秒",
      }),
    ).toBe("3 分 4 秒");
  });

  test("a time that has already passed reads as one second, never negative", () => {
    expect(formatCooldownRemaining(NOW - 5000, NOW)).toBe("1s");
  });
});

describe("restriction badges carry the cooldown reason", () => {
  const file = (restriction: Record<string, unknown>) => ({
    name: "codex-1.json",
    type: "codex",
    restrictions: [{ scope: "auth", status: "error", unavailable: true, ...restriction }],
  });

  test("a rate limit keeps the status colour and names its reason", () => {
    const [badge] = resolveAuthFileRestrictionBadges(
      file({ http_status: 429, cooldown_reason: "rate_limited", next_retry_after: at(45) }),
      NOW,
    );
    expect(badge).toMatchObject({
      cooldownReason: "rate_limited",
      label: "429 Error",
      tone: "danger",
      recoverAtMs: NOW + 45_000,
    });
  });

  test("a token being refreshed is a warning, not the red of a 401", () => {
    const [badge] = resolveAuthFileRestrictionBadges(
      file({ http_status: 401, cooldown_reason: "token_refreshing", next_retry_after: at(30) }),
      NOW,
    );
    expect(badge).toMatchObject({ cooldownReason: "token_refreshing", tone: "warning" });
  });

  test("a dead credential stays a danger", () => {
    const [badge] = resolveAuthFileRestrictionBadges(
      file({ http_status: 401, cooldown_reason: "reauth_required", next_retry_after: at(1800) }),
      NOW,
    );
    expect(badge).toMatchObject({ cooldownReason: "reauth_required", tone: "danger" });
  });

  test("an old backend sends no reason and the badge is what it always was", () => {
    const [badge] = resolveAuthFileRestrictionBadges(
      file({ http_status: 429, next_retry_after: at(45) }),
      NOW,
    );
    expect(badge).not.toHaveProperty("cooldownReason");
    expect(badge).toMatchObject({ label: "429 Error", tone: "danger" });
  });

  test("a reason code this panel does not know is left off the badge", () => {
    const [badge] = resolveAuthFileRestrictionBadges(
      file({ http_status: 429, cooldown_reason: "from_the_future", next_retry_after: at(45) }),
      NOW,
    );
    expect(badge).not.toHaveProperty("cooldownReason");
    expect(badge).toMatchObject({ label: "429 Error" });
  });
});
