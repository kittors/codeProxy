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
  test("omits code review quota items when the API does not return review limits", () => {
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

    expect(items.map((item) => item.label)).toEqual(["m_quota.code_5h", "m_quota.code_weekly"]);
  });

  test("maps Codex Spark additional rate limits into displayable quota items", () => {
    const items = buildCodexItems({
      additional_rate_limits: [
        {
          limit_name: "GPT-5.3-Codex-Spark",
          rate_limit: {
            allowed: true,
            limit_reached: false,
            primary_window: {
              used_percent: 25,
              limit_window_seconds: 18000,
              reset_after_seconds: 60,
            },
            secondary_window: {
              used_percent: 4,
              limit_window_seconds: 604800,
              reset_at: 1778140862,
            },
          },
        },
      ],
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "GPT-5.3-Codex-Spark: 5h",
          percent: 75,
        }),
        expect.objectContaining({
          label: "GPT-5.3-Codex-Spark: Weekly",
          percent: 96,
          resetAtMs: 1778140862000,
        }),
      ]),
    );
  });

  test("maps returned code review 5-hour and weekly limits", () => {
    const items = buildCodexItems({
      code_review_rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 60,
          limit_window_seconds: 18000,
          reset_after_seconds: 60,
        },
        secondary_window: {
          used_percent: 10,
          limit_window_seconds: 604800,
          reset_after_seconds: 120,
        },
      },
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "m_quota.review_5h", percent: 40 }),
        expect.objectContaining({ label: "m_quota.review_weekly", percent: 90 }),
      ]),
    );
  });
});

describe("buildKimiItems", () => {
  test("maps kimi code usage payload into 5h and weekly quota items", () => {
    const payload = parseKimiUsagePayload(`{
      "usage": {
        "limit": "100",
        "used": "100",
        "resetTime": "2026-04-22T01:24:38.060611Z"
      },
      "limits": [
        {
          "window": {
            "duration": 300,
            "timeUnit": "TIME_UNIT_MINUTE"
          },
          "detail": {
            "limit": "100",
            "remaining": "100",
            "resetTime": "2026-04-20T11:24:38.060611Z"
          }
        }
      ]
    }`);

    expect(payload).not.toBeNull();

    const items = buildKimiItems(payload!);

    expect(items).toEqual([
      {
        label: "m_quota.code_5h",
        percent: 100,
        resetAtMs: Date.parse("2026-04-20T11:24:38.060611Z"),
      },
      {
        label: "m_quota.code_weekly",
        percent: 0,
        resetAtMs: Date.parse("2026-04-22T01:24:38.060611Z"),
      },
    ]);
  });
});
