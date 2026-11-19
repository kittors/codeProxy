import { describe, expect, test } from "vitest";
import {
  formatClock,
  formatCompactNumber,
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatPercent,
  formatUsd,
  isSameLocalDay,
  tokensPerSecond,
} from "../gridFormat";

describe("formatCompactNumber", () => {
  test.each([
    [0, "0"],
    [457, "457"],
    [9_876, "9,876"],
    [10_500, "10.5K"],
    [105_677, "106K"],
    [999_960, "1M"],
    [2_440_000, "2.44M"],
    [1_000_000_000, "1B"],
    [-12_340, "-12.3K"],
  ])("%s → %s", (value, expected) => {
    expect(formatCompactNumber(value, "en-US")).toBe(expected);
  });

  test("不是有限数字时写破折号", () => {
    expect(formatCompactNumber(Number.NaN)).toBe("—");
    expect(formatCompactNumber(null)).toBe("—");
  });
});

describe("formatDurationMs", () => {
  test.each([
    [0.4, "<1ms"],
    [820, "820ms"],
    [8_460, "8.46s"],
    [14_320, "14.3s"],
    // 59.96 秒按一位小数会进位成 60.0s，这里直接写成 1m，不出现「60s」
    [59_960, "1m"],
    [61_200, "1m 1s"],
    // 旧格式化曾写出「1m 60s」：先取整到秒再拆分钟
    [119_700, "2m"],
    [3_600_000, "1h 00m"],
    [5_430_000, "1h 31m"],
  ])("%sms → %s", (ms, expected) => {
    expect(formatDurationMs(ms)).toBe(expected);
  });

  test("负数和缺值写破折号", () => {
    expect(formatDurationMs(-1)).toBe("—");
    expect(formatDurationMs(undefined)).toBe("—");
  });
});

describe("money, percent and integers", () => {
  test.each([
    [0, "$0"],
    [0.00004, "<$0.0001"],
    [0.011, "$0.0110"],
    [75.3805, "$75.38"],
    [1234.5, "$1,234.50"],
  ])("formatUsd(%s) → %s", (value, expected) => {
    expect(formatUsd(value)).toBe(expected);
  });

  test("比例写成百分比，非零的极小比例不显示成 0%", () => {
    expect(formatPercent(0.7366)).toBe("73.7%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.0002)).toBe("<0.1%");
    expect(formatPercent(0)).toBe("0%");
  });

  test("整数带千分位", () => {
    expect(formatInteger(1354.4, "en-US")).toBe("1,354");
  });

  test("生成速度：没有输出或生成时间为零时返回 null", () => {
    expect(tokensPerSecond(500, 5_000)).toBe(100);
    expect(tokensPerSecond(0, 5_000)).toBeNull();
    expect(tokensPerSecond(500, 0)).toBeNull();
  });
});

describe("time", () => {
  test("时钟与完整时间按本地时区补零", () => {
    const ms = new Date(2026, 10, 7, 9, 5, 3).getTime();
    expect(formatClock(ms)).toBe("09:05:03");
    expect(formatDateTime(ms)).toBe("2026-11-07 09:05:03");
  });

  test("同一个本地日", () => {
    const morning = new Date(2026, 10, 17, 0, 0, 1).getTime();
    const night = new Date(2026, 10, 17, 23, 59, 59).getTime();
    const nextDay = new Date(2026, 10, 18, 0, 0, 0).getTime();
    expect(isSameLocalDay(morning, night)).toBe(true);
    expect(isSameLocalDay(night, nextDay)).toBe(false);
  });
});
