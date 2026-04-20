import { describe, expect, test } from "vitest";
import {
  buildCodexItems,
  buildKimiItems,
  formatRelativeResetLabel,
  parseKimiUsagePayload,
} from "@/modules/quota/quota-helpers";

describe("formatRelativeResetLabel", () => {
  const nowMs = Date.UTC(2026, 3, 1, 12, 0, 0);

  test("formats minute-level remaining time", () => {
    expect(formatRelativeResetLabel(nowMs + 25 * 60 * 1000, nowMs)).toBe(
      "m_quota.minutes_later::25",
    );
  });

  test("formats exact hour remaining time", () => {
    expect(formatRelativeResetLabel(nowMs + 2 * 60 * 60 * 1000, nowMs)).toBe(
      "m_quota.hours_later::2",
    );
  });

  test("formats hour and minute remaining time", () => {
    expect(formatRelativeResetLabel(nowMs + 135 * 60 * 1000, nowMs)).toBe(
      "m_quota.hours_minutes_later::2::15",
    );
  });

  test("marks expired windows as refresh due", () => {
    expect(formatRelativeResetLabel(nowMs - 1, nowMs)).toBe("m_quota.refresh_due");
  });
});

describe("buildCodexItems", () => {
  test("treats null code_review_rate_limit as 100% remaining", () => {
    const items = buildCodexItems({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 18,
          limit_window_seconds: 18000,
          reset_after_seconds: 4181,
        },
        secondary_window: {
          used_percent: 3,
          limit_window_seconds: 604800,
          reset_after_seconds: 590981,
        },
      },
      code_review_rate_limit: null,
    });

    const reviewWeekly = items.find((item) => item.label === "m_quota.review_weekly");
    expect(reviewWeekly?.percent).toBe(100);
  });
});

describe("buildKimiItems", () => {
  test("maps kimi coding usage into 5h and weekly quota items", () => {
    const payload = parseKimiUsagePayload(`{
      "usages": [
        {
          "scope": "FEATURE_CODING",
          "detail": {
            "limit": "100",
            "used": "3",
            "remaining": "97",
            "resetTime": "2026-04-27T02:54:38.657133Z"
          },
          "limits": [
            {
              "window": {
                "duration": 300,
                "timeUnit": "TIME_UNIT_MINUTE"
              },
              "detail": {
                "limit": "100",
                "used": "15",
                "remaining": "85",
                "resetTime": "2026-04-20T07:54:38.657133Z"
              }
            }
          ]
        }
      ]
    }`);

    expect(payload).not.toBeNull();

    const items = buildKimiItems(payload!);

    expect(items).toEqual([
      {
        label: "m_quota.code_5h",
        percent: 85,
        resetAtMs: Date.parse("2026-04-20T07:54:38.657133Z"),
      },
      {
        label: "m_quota.code_weekly",
        percent: 97,
        resetAtMs: Date.parse("2026-04-27T02:54:38.657133Z"),
      },
    ]);
  });
});
