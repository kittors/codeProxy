import { describe, expect, test } from "vitest";
import {
  filterAntigravityQuotaItems,
  resolveCodexResetCreditCandidates,
} from "@features/quota-preview/quota-helpers";

describe("resolveCodexResetCreditCandidates", () => {
  test("reads credits from wrapped detail payloads, earliest expiry first", () => {
    expect(
      resolveCodexResetCreditCandidates({
        rate_limit_reset_credits: {
          data: [
            { id: "credit-later", expires_at: "2026-07-04T10:00:00Z" },
            { id: "credit-earlier", expiresAt: "2026-07-02T10:00:00Z" },
          ],
        },
      }),
    ).toEqual([
      { id: "credit-earlier", expiresAt: "2026-07-02T10:00:00Z" },
      { id: "credit-later", expiresAt: "2026-07-04T10:00:00Z" },
    ]);
  });
});

describe("filterAntigravityQuotaItems", () => {
  test("groups per-model rows by family, keeps unknown models by name and drops internal entries", () => {
    const items = filterAntigravityQuotaItems([
      {
        key: "model:gemini-3.1-pro-high",
        label: "Gemini 3.1 Pro (High)",
        percent: 75,
        resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
      },
      { key: "model:gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)", percent: 50 },
      { key: "model:gemini-2.5-pro", label: "Gemini 2.5 Pro", percent: 100 },
      { key: "model:gemini-3-flash", label: "Gemini 3 Flash", percent: 70 },
      { key: "model:gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", percent: 60 },
      { key: "model:claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", percent: 90 },
      { key: "model:gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", percent: 80 },
      { key: "model:chat_20706", label: "chat_20706", percent: 100 },
      { key: "model:tab_flash_lite_preview", label: "tab_flash_lite_preview", percent: 100 },
    ]);

    // Families are classified by the shape of the model id, so gpt-oss — which
    // belongs to none of them — is reported under its own name instead of being
    // dropped for missing from a list. Internal entries are filtered by prefix.
    expect(items.map((item) => item.key)).toEqual([
      "antigravity:gemini_pro",
      "antigravity:gemini_flash",
      "antigravity:gemini_image",
      "antigravity:claude",
      "antigravity:model_gpt_oss_120b_medium",
    ]);
    expect(items.map((item) => item.label)).toEqual([
      "Gemini Pro",
      "Gemini Flash",
      "Gemini Image",
      "Claude",
      "GPT-OSS 120B (Medium)",
    ]);
    // Worst remaining within a family: gemini-3.1-pro-low at 50 beats
    // gemini-3.1-pro-high at 75 and gemini-2.5-pro at 100.
    expect(items[0]).toEqual({
      key: "antigravity:gemini_pro",
      label: "Gemini Pro",
      percent: 50,
      resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
      windowSeconds: 5 * 60 * 60,
    });
    expect(items.map((item) => item.percent)).toEqual([50, 70, 60, 90, 80]);
  });

  test("groups a model family the upstream ships later without a code change", () => {
    const items = filterAntigravityQuotaItems([
      { label: "Gemini 4 Pro [gemini-4-pro-ultra]", percent: 30 },
      { label: "gemini-4-flash-nano", percent: 40 },
      { label: "claude-opus-9", percent: 55 },
    ]);
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
