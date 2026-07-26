import { describe, expect, test } from "vitest";
import {
  formatLocalDateKey,
  formatLocalHourKey,
  parseBucketKeyMs,
  resolveNearestBucketKey,
} from "../trendBuckets";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

describe("trend bucket keys", () => {
  test("formats local date and hour keys", () => {
    const local = new Date(2026, 3, 30, 16, 45);
    expect(formatLocalDateKey(local.toISOString())).toBe("2026-04-30");
    expect(formatLocalHourKey(local.toISOString())).toBe("2026-04-30 16:00");
  });

  test("returns empty keys for unparseable timestamps", () => {
    expect(formatLocalDateKey("not-a-date")).toBe("");
    expect(formatLocalHourKey("not-a-date")).toBe("");
  });

  test("parses server bucket keys as local time", () => {
    expect(parseBucketKeyMs("2026-04-30 16:00")).toBe(new Date(2026, 3, 30, 16, 0).getTime());
    expect(parseBucketKeyMs("2026-04-30")).toBe(new Date(2026, 3, 30, 0, 0).getTime());
    expect(Number.isNaN(parseBucketKeyMs("garbage"))).toBe(true);
  });

  test("maps a quota point to the closest bucket within tolerance", () => {
    const keys = ["2026-04-30 15:00", "2026-04-30 16:00", "2026-04-30 17:00"];
    const msByKey = new Map(keys.map((key) => [key, parseBucketKeyMs(key)]));
    // 20 minutes past the 16:00 bucket — closest bucket wins even without an exact key.
    const timestamp = new Date(2026, 3, 30, 16, 20).toISOString();

    expect(resolveNearestBucketKey(timestamp, keys, msByKey, HOUR_MS)).toBe("2026-04-30 16:00");
  });

  test("rejects points that fall outside the tolerance window", () => {
    const keys = ["2026-04-30 16:00"];
    const msByKey = new Map(keys.map((key) => [key, parseBucketKeyMs(key)]));
    const timestamp = new Date(2026, 3, 30, 23, 0).toISOString();

    expect(resolveNearestBucketKey(timestamp, keys, msByKey, HOUR_MS)).toBeNull();
    expect(resolveNearestBucketKey(timestamp, keys, msByKey, DAY_MS)).toBe("2026-04-30 16:00");
  });

  test("ignores invalid inputs", () => {
    const keys = ["2026-04-30 16:00", "broken"];
    const msByKey = new Map(keys.map((key) => [key, parseBucketKeyMs(key)]));

    expect(resolveNearestBucketKey("not-a-date", keys, msByKey, HOUR_MS)).toBeNull();
    expect(
      resolveNearestBucketKey(new Date(2026, 3, 30, 16, 5).toISOString(), keys, msByKey, HOUR_MS),
    ).toBe("2026-04-30 16:00");
  });
});
