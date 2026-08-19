import { describe, expect, test } from "vitest";
import {
  buildAntigravityItems,
  buildAntigravitySummaryItems,
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

    // Families are classified by the shape of the model id, so gpt-oss — which
    // belongs to none of them — is reported under its own name instead of being
    // dropped for missing from a list.
    expect(items.map((item) => item.key)).toEqual([
      "antigravity:gemini_pro",
      "antigravity:gemini_flash",
      "antigravity:gemini_image",
      "antigravity:claude",
      "antigravity:model_gpt_oss_120b_medium",
    ]);
    expect(labels).toEqual([
      "Gemini Pro",
      "Gemini Flash",
      "Gemini Image",
      "Claude",
      "GPT-OSS 120B (Medium)",
    ]);
    // Internal entries are still filtered, by prefix rather than by id.
    expect(labels).not.toContain("chat_20706");
    expect(labels).not.toContain("chat_23310");
    expect(labels).not.toContain("tab_flash_lite_preview");
    expect(labels).not.toContain("tab_jump_flash_lite_preview");

    // Worst remaining within a family: gemini-3.1-pro-low at 50 beats
    // gemini-3.1-pro-high at 75 and gemini-2.5-pro at 100.
    expect(items[0]).toEqual(
      expect.objectContaining({
        percent: 50,
        resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
        windowSeconds: 5 * 60 * 60,
      }),
    );
    expect(items[1]).toEqual(expect.objectContaining({ percent: 70 }));
    expect(items[2]).toEqual(expect.objectContaining({ percent: 60 }));
    expect(items[3]).toEqual(expect.objectContaining({ percent: 90 }));
    expect(items[4]).toEqual(expect.objectContaining({ percent: 80 }));
    expect(items[0].meta).toBeUndefined();
  });

  test("groups a model family the upstream ships later without a code change", () => {
    const payload = parseAntigravityPayload(
      JSON.stringify({
        models: {
          "gemini-4-pro-ultra": { displayName: "Gemini 4 Pro", quotaInfo: { remainingFraction: 0.3 } },
          "gemini-4-flash-nano": { quotaInfo: { remainingFraction: 0.4 } },
          "claude-opus-9": { quotaInfo: { remainingFraction: 0.55 } },
        },
      }),
    );
    const items = buildAntigravityItems(payload!);
    expect(items.map((item) => item.key)).toEqual([
      "antigravity:gemini_pro",
      "antigravity:gemini_flash",
      "antigravity:claude",
    ]);
    expect(items.map((item) => item.percent)).toEqual([30, 40, 55]);
  });

  // Rows cached under the previous grouping still have to render while they age
  // out, so the old keys and labels are recognised on read and mapped onto the
  // current families.
  test("re-reads cached rows written under the previous Antigravity grouping", () => {
    expect(
      filterAntigravityQuotaItems([
        { label: "antigravity_quota.gemini3_pro", percent: 82 },
        { label: "antigravity_quota.gemini3_flash", percent: 77 },
        { label: "antigravity_quota.gemini_image", percent: 65 },
        { label: "antigravity_quota.claude", percent: 73 },
      ]),
    ).toEqual([
      { key: "antigravity:gemini_pro", label: "Gemini Pro", percent: 82, windowSeconds: 5 * 60 * 60 },
      {
        key: "antigravity:gemini_flash",
        label: "Gemini Flash",
        percent: 77,
        windowSeconds: 5 * 60 * 60,
      },
      {
        key: "antigravity:gemini_image",
        label: "Gemini Image",
        percent: 65,
        windowSeconds: 5 * 60 * 60,
      },
      { key: "antigravity:claude", label: "Claude", percent: 73, windowSeconds: 5 * 60 * 60 },
    ]);
  });

  test("passes grouped summary rows through untouched", () => {
    const summaryItems = [
      {
        key: "antigravity:gemini_5h",
        label: "Gemini Models · 5h",
        percent: 72,
        windowSeconds: 5 * 60 * 60,
      },
      {
        key: "antigravity:gemini_weekly",
        label: "Gemini Models · weekly",
        percent: 51,
        windowSeconds: 7 * 24 * 60 * 60,
      },
    ];
    expect(filterAntigravityQuotaItems(summaryItems)).toEqual(summaryItems);
  });
});

describe("buildAntigravitySummaryItems", () => {
  test("reads the upstream's own buckets and window widths", () => {
    const items = buildAntigravitySummaryItems({
      groups: [
        {
          displayName: "Gemini Models",
          buckets: [
            {
              bucketId: "gemini-5h",
              window: "5h",
              remainingFraction: 0.72,
              resetTime: "2026-08-19T07:00:00Z",
            },
            { bucketId: "gemini-weekly", window: "weekly", remainingFraction: 0.51 },
          ],
        },
        {
          displayName: "Claude and GPT models",
          buckets: [{ bucketId: "3p-5h", window: "5h", remainingFraction: 1 }],
        },
      ],
    });

    expect(items).toEqual([
      {
        key: "antigravity:gemini_5h",
        label: "Gemini Models · 5h",
        percent: 72,
        resetAtMs: Date.parse("2026-08-19T07:00:00Z"),
        windowSeconds: 5 * 60 * 60,
      },
      {
        key: "antigravity:gemini_weekly",
        label: "Gemini Models · weekly",
        percent: 51,
        windowSeconds: 7 * 24 * 60 * 60,
      },
      {
        key: "antigravity:3p_5h",
        label: "Claude and GPT models · 5h",
        percent: 100,
        windowSeconds: 5 * 60 * 60,
      },
    ]);
  });

  test("returns nothing when the payload carries no groups", () => {
    expect(buildAntigravitySummaryItems({ models: { "gemini-3-pro": {} } })).toEqual([]);
    expect(buildAntigravitySummaryItems(null)).toEqual([]);
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
