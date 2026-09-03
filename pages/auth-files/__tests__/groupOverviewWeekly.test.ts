import { describe, expect, test } from "vitest";
import type { TFunction } from "i18next";
import type { QuotaCardSlot } from "../hooks/quotaCardSlots";
import {
  collectWeeklyFamilies,
  formatWeeklySeriesLabel,
  isWeeklyWindow,
  normalizeGroupTrendSeries,
} from "../hooks/groupOverviewWeekly";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";

const WEEK = 7 * 24 * 60 * 60;
const FIVE_HOUR = 5 * 60 * 60;
const t = ((key: string, opts?: { name?: string }) =>
  opts?.name ? `${key}:${opts.name}` : key) as unknown as TFunction;

const weeklySlot = (id: string, label: string, percent: number, windowSeconds = WEEK): QuotaCardSlot => ({
  id,
  label,
  item: { key: id, label, percent, windowSeconds } as QuotaItem,
});

describe("group overview weekly families", () => {
  test("treats seven-day windows as weekly and ignores 5h", () => {
    expect(isWeeklyWindow(WEEK)).toBe(true);
    expect(isWeeklyWindow(FIVE_HOUR)).toBe(false);
    expect(isWeeklyWindow(undefined)).toBe(false);
  });

  test("averages each Antigravity weekly separately instead of taking the first bar", () => {
    const files = [
      [
        weeklySlot("antigravity:gemini_weekly", "Gemini · 周", 40),
        weeklySlot("antigravity:gemini_5h", "Gemini · 5h", 10, FIVE_HOUR),
        weeklySlot("antigravity:3p_weekly", "Claude and GPT · 周", 80),
      ],
      [
        weeklySlot("antigravity:gemini_weekly", "Gemini · 周", 60),
        weeklySlot("antigravity:3p_weekly", "Claude and GPT · 周", 100),
      ],
    ];
    const families = collectWeeklyFamilies(files);
    expect(families.map((family) => ({ id: family.id, remainingPercent: family.remainingPercent }))).toEqual([
      { id: "antigravity:gemini_weekly", remainingPercent: 50 },
      { id: "antigravity:3p_weekly", remainingPercent: 90 },
    ]);
  });

  test("keeps Codex code_week and extra Spark weeks as distinct families", () => {
    const files = [
      [
        weeklySlot("code_week", "代码：周", 70),
        weeklySlot("additional:codex_bengalfox:week", "Spark：周", 100),
      ],
    ];
    expect(collectWeeklyFamilies(files).map((family) => family.id)).toEqual([
      "code_week",
      "additional:codex_bengalfox:week",
    ]);
  });

  test("keeps every quota_series line and only falls back to quota_points", () => {
    const dual = normalizeGroupTrendSeries(
      [
        { quota_key: "antigravity:gemini_weekly", points: [{ date: "2026-09-01", percent: 57 }] },
        { quota_key: "antigravity:3p_weekly", points: [{ date: "2026-09-01", percent: 90 }] },
      ],
      [{ date: "2026-09-01", percent: null }],
    );
    expect(dual.map((item) => item.quota_key)).toEqual([
      "antigravity:gemini_weekly",
      "antigravity:3p_weekly",
    ]);
    expect(normalizeGroupTrendSeries([], [{ date: "2026-09-01", percent: 70 }])[0]?.quota_key).toBe(
      "code_week",
    );
  });

  test("formats stored snapshot labels the way the card already does", () => {
    expect(formatWeeklySeriesLabel("code_week", "", t)).toBe("m_quota.code_weekly");
    expect(formatWeeklySeriesLabel("antigravity:gemini_weekly", "Gemini Models", t)).toBe(
      "Gemini · antigravity_quota.window_weekly",
    );
    expect(formatWeeklySeriesLabel("antigravity:3p_weekly", "Claude and GPT models", t)).toBe(
      "Claude and GPT · antigravity_quota.window_weekly",
    );
  });
});
