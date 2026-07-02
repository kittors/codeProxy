import { describe, expect, test } from "vitest";
import {
  buildAntigravityItems,
  buildCodexItems,
  buildKimiItems,
  filterAntigravityQuotaItems,
  formatRelativeResetLabel,
  parseAntigravityPayload,
  parseKimiUsagePayload,
  resolveCodexResetCreditExpirations,
  resolveCodexResetCreditCount,
} from "@features/quota-preview/quota-helpers";

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
          key: "additional:codex_bengalfox:5h",
          label: "GPT-5.3-Codex-Spark: 5h",
          percent: 75,
          windowSeconds: 18000,
        }),
        expect.objectContaining({
          key: "additional:codex_bengalfox:week",
          label: "GPT-5.3-Codex-Spark: Weekly",
          percent: 96,
          resetAtMs: 1778140862000,
          windowSeconds: 604800,
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

  test("maps codex team monthly limits into a subscription quota item", () => {
    const items = buildCodexItems({
      plan_type: "team",
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 11,
          limit_window_seconds: 2628000,
          reset_after_seconds: 2618817,
        },
      },
    });

    expect(items).toEqual([
      expect.objectContaining({
        key: "code_subscription_2628000",
        label: "m_quota.code_subscription",
        percent: 89,
        windowSeconds: 2628000,
      }),
    ]);
  });

  test("reads available reset credits from Codex usage payload", () => {
    expect(
      resolveCodexResetCreditCount({
        rate_limit_reset_credits: { available_count: "3" },
      }),
    ).toBe(3);
  });

  test("reads reset credit expiration times sorted by expiry", () => {
    expect(
      resolveCodexResetCreditExpirations({
        credits: [
          { expires_at: "2026-07-04T10:00:00Z" },
          { expiresAt: "2026-07-03T10:00:00Z" },
          { expires_at: "" },
          { expires_at: "not-a-date" },
        ],
      }),
    ).toEqual(["2026-07-03T10:00:00Z", "2026-07-04T10:00:00Z", "not-a-date"]);
  });

  test("reads reset credit expiration times from wrapped detail payloads", () => {
    expect(
      resolveCodexResetCreditExpirations({
        rate_limit_reset_credits: {
          data: [{ expiresAt: "2026-07-02T10:00:00Z" }],
        },
      }),
    ).toEqual(["2026-07-02T10:00:00Z"]);
  });
});

describe("buildAntigravityItems", () => {
  test("summarizes fetchAvailableModels quota into sub2api-style Antigravity groups", () => {
    const payload = parseAntigravityPayload(
      JSON.stringify({
        models: {
          tab_jump_flash_lite_preview: {
            maxTokens: 16384,
            maxOutputTokens: 4096,
            quotaInfo: { remainingFraction: 1 },
            model: "MODEL_PLACEHOLDER_M28",
            apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
          },
          tab_flash_lite_preview: {
            maxTokens: 16384,
            maxOutputTokens: 4096,
            quotaInfo: { remainingFraction: 1 },
            model: "MODEL_PLACEHOLDER_M19",
            apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
          },
          "gemini-3.1-pro-high": {
            displayName: "Gemini 3.1 Pro (High)",
            supportsImages: true,
            supportsThinking: true,
            supportsVideo: true,
            maxTokens: 1048576,
            maxOutputTokens: 65535,
            quotaInfo: {
              remainingFraction: 0.75,
              resetTime: "2026-05-09T15:50:29Z",
            },
            model: "MODEL_PLACEHOLDER_M37",
            apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
            modelProvider: "MODEL_PROVIDER_GOOGLE",
          },
          "gemini-3.1-pro-low": {
            displayName: "Gemini 3.1 Pro (Low)",
            maxTokens: 1048576,
            maxOutputTokens: 65535,
            quotaInfo: { remainingFraction: 0.5 },
            model: "MODEL_PLACEHOLDER_M36",
          },
          "gemini-3-flash-agent": {
            displayName: "Gemini 3 Flash",
            quotaInfo: { remainingFraction: 1 },
            model: "MODEL_PLACEHOLDER_M84",
          },
          "claude-sonnet-4-6": {
            displayName: "Claude Sonnet 4.6 (Thinking)",
            quotaInfo: { remainingFraction: 0.9 },
            apiProvider: "API_PROVIDER_ANTHROPIC_VERTEX",
          },
          "gpt-oss-120b-medium": {
            displayName: "GPT-OSS 120B (Medium)",
            quotaInfo: { remainingFraction: 0.8 },
            apiProvider: "API_PROVIDER_OPENAI_VERTEX",
          },
          "gemini-3-flash": {
            displayName: "Gemini 3 Flash",
            quotaInfo: { remainingFraction: 0.7 },
          },
          chat_20706: {
            quotaInfo: { remainingFraction: 1 },
            isInternal: true,
          },
          chat_23310: {
            quotaInfo: { remainingFraction: 1 },
            isInternal: true,
          },
          "gemini-2.5-flash-thinking": {
            displayName: "Gemini 3.1 Flash Lite",
            quotaInfo: { remainingFraction: 1 },
          },
          "gemini-2.5-pro": {
            displayName: "Gemini 2.5 Pro",
            quotaInfo: { remainingFraction: 1 },
          },
          "gemini-3.1-flash-image": {
            displayName: "Gemini 3.1 Flash Image",
            quotaInfo: { remainingFraction: 0.6 },
          },
          "gemini-3.1-flash-lite": {
            displayName: "Gemini 3.1 Flash Lite",
            quotaInfo: { remainingFraction: 0.95 },
          },
        },
        defaultAgentModelId: "gemini-3.1-pro-high",
        agentModelSorts: [
          {
            displayName: "Recommended",
            groups: [
              {
                modelIds: [
                  "gemini-3.1-pro-high",
                  "gemini-3.1-pro-low",
                  "gemini-3-flash-agent",
                  "claude-sonnet-4-6",
                  "gpt-oss-120b-medium",
                ],
              },
            ],
          },
        ],
        commandModelIds: ["gemini-3-flash"],
        tabModelIds: ["chat_20706", "chat_23310"],
        imageGenerationModelIds: ["gemini-3.1-flash-image"],
        mqueryModelIds: ["gemini-3.1-flash-lite"],
        webSearchModelIds: ["gemini-3.1-flash-lite"],
        commitMessageModelIds: ["gemini-3.1-flash-lite"],
      }),
    );

    expect(payload).not.toBeNull();

    const items = buildAntigravityItems(payload!);
    const labels = items.map((item) => item.label);

    expect(items.map((item) => item.key)).toEqual([
      "provider:gemini3-pro",
      "provider:gemini3-flash",
      "provider:gemini-image",
      "provider:claude",
    ]);
    expect(labels).toEqual([
      "antigravity_quota.gemini3_pro",
      "antigravity_quota.gemini3_flash",
      "antigravity_quota.gemini_image",
      "antigravity_quota.claude",
    ]);
    expect(labels).not.toContain("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]");
    expect(labels).not.toContain("GPT-OSS 120B (Medium) [gpt-oss-120b-medium]");
    expect(labels).not.toContain("chat_20706");
    expect(labels).not.toContain("chat_23310");
    expect(labels).not.toContain("tab_flash_lite_preview");
    expect(labels).not.toContain("tab_jump_flash_lite_preview");
    expect(labels).not.toContain("Gemini 3.1 Flash Lite [gemini-2.5-flash-thinking]");
    expect(labels).not.toContain("Gemini 2.5 Pro [gemini-2.5-pro]");
    expect(items[0]).toEqual(
      expect.objectContaining({
        percent: 50,
        resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        percent: 70,
      }),
    );
    expect(items[2]).toEqual(
      expect.objectContaining({
        percent: 60,
      }),
    );
    expect(items[3]).toEqual(
      expect.objectContaining({
        percent: 90,
      }),
    );
    expect(items[0].meta).toBeUndefined();
  });

  test("keeps cached sub2api-style Antigravity summaries when cache only has labels", () => {
    expect(
      filterAntigravityQuotaItems([
        { label: "antigravity_quota.gemini3_pro", percent: 82 },
        { label: "antigravity_quota.gemini3_flash", percent: 77 },
        { label: "antigravity_quota.gemini_image", percent: 65 },
        { label: "antigravity_quota.claude", percent: 73 },
      ]),
    ).toEqual([
      {
        key: "provider:gemini3-pro",
        label: "antigravity_quota.gemini3_pro",
        percent: 82,
        resetAtMs: undefined,
      },
      {
        key: "provider:gemini3-flash",
        label: "antigravity_quota.gemini3_flash",
        percent: 77,
        resetAtMs: undefined,
      },
      {
        key: "provider:gemini-image",
        label: "antigravity_quota.gemini_image",
        percent: 65,
        resetAtMs: undefined,
      },
      {
        key: "provider:claude",
        label: "antigravity_quota.claude",
        percent: 73,
        resetAtMs: undefined,
      },
    ]);
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
        key: "code_5h",
        label: "m_quota.code_5h",
        percent: 100,
        resetAtMs: Date.parse("2026-04-20T11:24:38.060611Z"),
        windowSeconds: 18000,
      },
      {
        key: "code_week",
        label: "m_quota.code_weekly",
        percent: 0,
        resetAtMs: Date.parse("2026-04-22T01:24:38.060611Z"),
        windowSeconds: 604800,
      },
    ]);
  });
});
