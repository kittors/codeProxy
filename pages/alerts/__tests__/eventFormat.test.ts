import { describe, expect, test } from "vitest";
import { formatEventTime } from "../eventFormat";

describe("formatEventTime", () => {
  test("gives a short month-day and time for the list and a full time with seconds for the tooltip", () => {
    const { short, full } = formatEventTime("2026-11-01T07:50:09Z", "en");
    expect(short).toMatch(/\d{1,2}[/.-]\d{1,2}.*\d{2}:\d{2}$/);
    expect(short).not.toMatch(/:\d{2}:\d{2}/);
    expect(full).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test("writes the time in 24-hour form whatever the locale", () => {
    expect(formatEventTime("2026-11-01T15:04:00Z", "en").short).not.toMatch(/[AP]M/i);
    expect(formatEventTime("2026-11-01T15:04:00Z", "zh-CN").short).not.toMatch(/[上下]午/);
  });

  test("hands an unreadable time back as it came instead of showing 'Invalid Date'", () => {
    expect(formatEventTime("last tuesday", "en")).toEqual({
      short: "last tuesday",
      full: "last tuesday",
    });
    expect(formatEventTime("", "en")).toEqual({ short: "", full: "" });
  });
});
