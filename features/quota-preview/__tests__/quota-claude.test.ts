import { describe, expect, test } from "vitest";
import { buildClaudeItems } from "@features/quota-preview/quota-claude";

describe("buildClaudeItems", () => {
  test("maps flat windows to remaining percent", () => {
    const items = buildClaudeItems({
      five_hour: { utilization: 10, resets_at: "2026-07-16T12:00:00Z" },
      seven_day: { utilization: 40, resets_at: "2026-07-20T12:00:00Z" },
    });
    expect(items.map((item) => item.key)).toEqual(["five_hour", "seven_day"]);
    expect(items[1]?.percent).toBe(60);
  });

  test("accepts seven_day_routines as the cowork window alias", () => {
    const items = buildClaudeItems({
      seven_day_routines: { utilization: 5, resets_at: "2026-07-20T12:00:00Z" },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.key).toBe("seven_day_cowork");
    expect(items[0]?.label).toBe("claude_quota.seven_day_cowork");
    expect(items[0]?.percent).toBe(95);
  });

  test("maps weekly_scoped limits with model name and skips all-models scope", () => {
    const items = buildClaudeItems({
      seven_day: { utilization: 40, resets_at: "2026-07-20T12:00:00Z" },
      limits: [
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 30,
          resets_at: "2026-07-20T12:00:00Z",
          scope: { model: { id: "claude-opus-5", display_name: "Opus" } },
        },
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 80,
          scope: { model: { id: "all-models", display_name: "All models" } },
        },
        {
          kind: "five_hour",
          group: "session",
          percent: 10,
          scope: { model: { id: "claude-opus-5", display_name: "Opus" } },
        },
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["seven_day", "weekly_scoped_claude-opus-5"]);
    const scoped = items[1];
    expect(scoped?.label).toBe("claude_quota.model_weekly::Opus");
    expect(scoped?.percent).toBe(70);
    expect(scoped?.resetAtMs).toBe(Date.parse("2026-07-20T12:00:00Z"));
  });

  test("prefers flat seven_day_opus window over the scoped duplicate", () => {
    const items = buildClaudeItems({
      seven_day_opus: { utilization: 20, resets_at: "2026-07-20T12:00:00Z" },
      limits: [
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 30,
          scope: { model: { id: "claude-opus-5", display_name: "Opus" } },
        },
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["seven_day_opus"]);
  });
});
