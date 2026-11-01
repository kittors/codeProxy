import { describe, expect, test } from "vitest";
import type { PoolCapacityEntry } from "@code-proxy/api-client";
import {
  POOL_STALE_AFTER_MS,
  buildPoolRows,
  formatClockTime,
  formatRelativeTime,
  poolTone,
  providerDisplayName,
} from "../poolSummary";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Local-time constructors keep the day arithmetic below independent of the machine's time zone.
const NOW = new Date(2026, 10, 1, 9, 30).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function pool(overrides: Partial<PoolCapacityEntry> = {}): PoolCapacityEntry {
  return {
    provider: "codex",
    window_key: "code_week",
    window_label: "Weekly",
    window_seconds: 7 * 24 * 3600,
    accounts: 4,
    accounts_with_data: 4,
    remaining_percent: 50,
    earliest_reset_at: iso(NOW + 2 * DAY),
    observed_at: iso(NOW - 10 * 60_000),
    ...overrides,
  };
}

describe("poolTone", () => {
  test("follows the quota bars: plenty from 60%, tight from 20%, then danger", () => {
    expect(poolTone(100)).toBe("healthy");
    expect(poolTone(60)).toBe("healthy");
    expect(poolTone(59.9)).toBe("warning");
    expect(poolTone(20)).toBe("warning");
    expect(poolTone(19.9)).toBe("danger");
    expect(poolTone(0)).toBe("danger");
    expect(poolTone(null)).toBe("unknown");
  });
});

describe("providerDisplayName", () => {
  test("uses brand spellings and never lets an unlisted provider disappear", () => {
    expect(providerDisplayName("codex")).toBe("Codex");
    expect(providerDisplayName(" Gemini-CLI ")).toBe("Gemini CLI");
    expect(providerDisplayName("xai")).toBe("Grok");
    expect(providerDisplayName("some-new-vendor")).not.toBe("");
  });
});

describe("buildPoolRows", () => {
  test("lists the tightest pool first and a pool with no data last", () => {
    const rows = buildPoolRows(
      [
        pool({ provider: "claude", window_key: "seven_day", remaining_percent: 72 }),
        pool({
          provider: "kiro",
          window_key: "monthly_credits",
          accounts_with_data: 0,
          remaining_percent: 0,
        }),
        pool({ provider: "codex", window_key: "code_week", remaining_percent: 12.4 }),
        pool({
          provider: "codex",
          window_key: "code_5h",
          window_seconds: 5 * 3600,
          remaining_percent: 40,
        }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual([
      "codex:code_week",
      "codex:code_5h",
      "claude:seven_day",
      "kiro:monthly_credits",
    ]);
    expect(rows[3]).toMatchObject({ remainingPercent: null, tone: "unknown", projection: null });
  });

  test("equally tight pools keep a stable order: provider name, then window length", () => {
    const rows = buildPoolRows(
      [
        pool({ provider: "codex", window_key: "code_week", remaining_percent: 30 }),
        pool({ provider: "claude", window_key: "seven_day", remaining_percent: 30 }),
        pool({
          provider: "codex",
          window_key: "code_5h",
          window_seconds: 5 * 3600,
          remaining_percent: 30,
        }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual([
      "claude:seven_day",
      "codex:code_5h",
      "codex:code_week",
    ]);
  });

  test("keeps the share between 0 and 100 whatever the backend sends", () => {
    // Tightest first, so the clamped-up value comes first.
    const [under, over] = buildPoolRows(
      [
        pool({ window_key: "a", remaining_percent: 140 }),
        pool({ window_key: "b", remaining_percent: -3 }),
      ],
      NOW,
    );
    expect(under.remainingPercent).toBe(0);
    expect(over.remainingPercent).toBe(100);
  });

  test("an average over a few accounts says so; a complete one does not", () => {
    const [partial, complete] = buildPoolRows(
      [
        pool({ window_key: "a", remaining_percent: 10, accounts: 5, accounts_with_data: 4 }),
        pool({ window_key: "b", remaining_percent: 20, accounts: 5, accounts_with_data: 5 }),
      ],
      NOW,
    );
    expect(partial.coverage).toEqual({ withData: 4, total: 5 });
    expect(complete.coverage).toBeNull();
  });

  test("marks data older than six hours as possibly stale", () => {
    const [fresh, edge, stale, unknown] = buildPoolRows(
      [
        pool({ window_key: "a", remaining_percent: 1, observed_at: iso(NOW - HOUR) }),
        pool({
          window_key: "b",
          remaining_percent: 2,
          observed_at: iso(NOW - POOL_STALE_AFTER_MS),
        }),
        pool({
          window_key: "c",
          remaining_percent: 3,
          observed_at: iso(NOW - POOL_STALE_AFTER_MS - 60_000),
        }),
        pool({ window_key: "d", remaining_percent: 4, observed_at: undefined }),
      ],
      NOW,
    );
    expect(fresh.stale).toBe(false);
    expect(edge.stale).toBe(false);
    expect(stale.stale).toBe(true);
    expect(unknown.stale).toBe(false);
  });

  describe("projection", () => {
    const project = (entry: Partial<PoolCapacityEntry>) =>
      buildPoolRows([pool(entry)], NOW)[0].projection;

    test("an exhaustion time in the future is reported as such", () => {
      expect(
        project({ burn_percent_per_hour: 2, projected_exhaustion_at: iso(NOW + 6 * HOUR) }),
      ).toEqual({ kind: "exhaustion", atMs: NOW + 6 * HOUR });
    });

    test("an exhaustion time already in the past means the snapshot is old, so nothing is claimed", () => {
      expect(
        project({ burn_percent_per_hour: 2, projected_exhaustion_at: iso(NOW - HOUR) }),
      ).toBeNull();
    });

    test("a pace that lasts until the reset is 'safe'", () => {
      expect(project({ burn_percent_per_hour: 0.5 })).toEqual({ kind: "safe" });
      expect(project({ burn_percent_per_hour: 0 })).toEqual({ kind: "safe" });
    });

    test("'not estimated' is never presented as 'safe'", () => {
      // No pace at all, or a pace but no reset to compare it with.
      expect(project({ burn_percent_per_hour: undefined })).toBeNull();
      expect(project({ burn_percent_per_hour: 1, earliest_reset_at: undefined })).toBeNull();
    });
  });
});

describe("formatRelativeTime", () => {
  const en = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(value, unit);

  test("picks minutes, hours or days by magnitude", () => {
    expect(formatRelativeTime(NOW + 45 * 60_000, NOW, "en")).toBe(en(45, "minute"));
    expect(formatRelativeTime(NOW + 36 * HOUR, NOW, "en")).toBe(en(36, "hour"));
    expect(formatRelativeTime(NOW + 47 * HOUR, NOW, "en")).toBe(en(47, "hour"));
    expect(formatRelativeTime(NOW + 48 * HOUR, NOW, "en")).toBe(en(2, "day"));
    expect(formatRelativeTime(NOW + 3 * DAY, NOW, "en")).toBe(en(3, "day"));
  });

  test("looks backwards for the past and never says '0 minutes'", () => {
    expect(formatRelativeTime(NOW - 3 * HOUR, NOW, "en")).toBe(en(-3, "hour"));
    expect(formatRelativeTime(NOW + 5_000, NOW, "en")).toBe(en(1, "minute"));
  });

  test("puts a space between a number and the Chinese that follows it", () => {
    const text = formatRelativeTime(NOW + 2 * DAY, NOW, "zh-CN");
    expect(text).toMatch(/\d 天/);
    expect(text).not.toMatch(/\d天/);
  });
});

describe("formatClockTime", () => {
  const day = (offset: number, hour = 14) => new Date(2026, 10, 1 + offset, hour, 0).getTime();

  test("names today and tomorrow, then the weekday, then the date", () => {
    expect(formatClockTime(day(0), NOW, "en")).toMatch(/^today /i);
    expect(formatClockTime(day(1), NOW, "en")).toMatch(/^tomorrow /i);
    const weekday = new Intl.DateTimeFormat("en", { weekday: "short" }).format(day(3));
    expect(formatClockTime(day(3), NOW, "en").startsWith(weekday)).toBe(true);
    const date = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(day(9));
    expect(formatClockTime(day(9), NOW, "en").startsWith(date)).toBe(true);
  });

  test("counts calendar days, not 24-hour spans", () => {
    // 23:30 and 00:30 are an hour apart, but the second one is tomorrow.
    const late = new Date(2026, 10, 1, 23, 30).getTime();
    const early = new Date(2026, 10, 2, 0, 30).getTime();
    expect(formatClockTime(late, late - HOUR, "en")).toMatch(/^today /i);
    expect(formatClockTime(early, late, "en")).toMatch(/^tomorrow /i);
  });
});
