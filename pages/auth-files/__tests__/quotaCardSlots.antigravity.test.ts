import { describe, expect, test } from "vitest";
import type { TFunction } from "i18next";
import { resolveQuotaCardSlots } from "../hooks/quotaCardSlots";
import type { QuotaItem } from "@features/quota-preview/quota-types";

const WEEK = 7 * 24 * 60 * 60;
const FIVE_HOUR = 5 * 60 * 60;

// Return the key so assertions can see which phrase was requested.
const t = ((key: string) => key) as unknown as TFunction;

const summaryItems: QuotaItem[] = [
  {
    key: "antigravity:gemini_5h",
    label: "Gemini Models",
    percent: 72,
    windowSeconds: FIVE_HOUR,
    meta: "Models within this group: Gemini Flash, Gemini Pro",
  },
  {
    key: "antigravity:gemini_weekly",
    label: "Gemini Models",
    percent: 51,
    windowSeconds: WEEK,
    meta: "Models within this group: Gemini Flash, Gemini Pro",
  },
  {
    key: "antigravity:3p_5h",
    label: "Claude and GPT models",
    percent: 100,
    windowSeconds: FIVE_HOUR,
  },
  {
    key: "antigravity:3p_weekly",
    label: "Claude and GPT models",
    percent: 90,
    windowSeconds: WEEK,
  },
];

describe("antigravity quota card slots", () => {
  // The upstream client shows every group with both of its windows, weekly
  // first. Hiding either one leaves the account holder guessing which limit is
  // about to run out.
  test("renders both windows per group, weekly first, grouped together", () => {
    const slots = resolveQuotaCardSlots("antigravity", summaryItems, t);
    expect(slots.map((slot) => slot.id)).toEqual([
      "antigravity:gemini_weekly",
      "antigravity:gemini_5h",
      "antigravity:3p_weekly",
      "antigravity:3p_5h",
    ]);
  });

  // "Models" carries no information next to a window and a percentage, and the
  // window has to be localised rather than echoing the upstream's own wording.
  test("shortens the group name and localises the window", () => {
    const slots = resolveQuotaCardSlots("antigravity", summaryItems, t);
    expect(slots.map((slot) => slot.label)).toEqual([
      "Gemini · antigravity_quota.window_weekly",
      "Gemini · antigravity_quota.window_5h",
      "Claude and GPT · antigravity_quota.window_weekly",
      "Claude and GPT · antigravity_quota.window_5h",
    ]);
  });

  // A group with one window has nothing to disambiguate against, so the suffix
  // would be pure noise. The fallback model view is entirely 5h.
  test("omits the window suffix when a group has only one window", () => {
    const slots = resolveQuotaCardSlots(
      "antigravity",
      [
        { key: "antigravity:gemini_pro", label: "Gemini Pro", percent: 40, windowSeconds: FIVE_HOUR },
        { key: "antigravity:claude", label: "Claude", percent: 60, windowSeconds: FIVE_HOUR },
      ],
      t,
    );
    expect(slots.map((slot) => slot.label)).toEqual(["Gemini Pro", "Claude"]);
  });

  // The upstream's description is a full sentence. Printed inline it would push
  // the numbers off the card, so it belongs behind the hint icon — and it must
  // not leak into the row's detail line either.
  test("moves the group description into the hint and off the item", () => {
    const slots = resolveQuotaCardSlots("antigravity", summaryItems, t);
    const gemini = slots[0];
    expect(gemini.hint).toContain("Models within this group: Gemini Flash, Gemini Pro");
    expect(gemini.hint).toContain("antigravity_quota.group_hint");
    expect(gemini.item?.meta).toBeUndefined();
  });

  // A group the upstream describes with nothing still gets the shared
  // explanation of how the two limits interact.
  test("still explains the limits when the upstream sends no description", () => {
    const slots = resolveQuotaCardSlots("antigravity", summaryItems, t);
    const thirdParty = slots[2];
    expect(thirdParty.hint).toBe("antigravity_quota.group_hint");
  });
});


// The fallback view (fetchAvailableModels) groups models by the quota they
// actually share, which the backend sends as a member list. The row has no
// family name to fall back on — and inventing one is exactly what this
// grouping exists to avoid — so it says how many models draw on the bucket.
describe("antigravity shared buckets (fallback view)", () => {
  const sharedItems: QuotaItem[] = [
    {
      key: "antigravity:group_gemini_2_5_flash",
      label: "antigravity_quota.shared_group",
      percent: 100,
      meta: "gemini-2.5-flash,gemini-2.5-pro",
    },
    {
      key: "antigravity:group_claude_sonnet_4_6",
      label: "antigravity_quota.shared_group",
      percent: 100,
      meta: "claude-sonnet-4-6,gemini-3.1-pro-high,gpt-oss-120b-medium",
    },
  ];

  test("names each row by how many models share the bucket", () => {
    const slots = resolveQuotaCardSlots("antigravity", sharedItems, t);
    expect(slots.map((slot) => slot.label)).toEqual([
      "antigravity_quota.shared_group",
      "antigravity_quota.shared_group",
    ]);
    // Distinct buckets must stay distinct rows even though they render alike.
    expect(slots.map((slot) => slot.id)).toEqual([
      "antigravity:group_gemini_2_5_flash",
      "antigravity:group_claude_sonnet_4_6",
    ]);
  });

  // The member list answers "what does this bar cover" and belongs behind the
  // icon; a bare comma-separated string in the row would be unreadable.
  test("lists the sharing models in the hint, one per line", () => {
    const slots = resolveQuotaCardSlots("antigravity", sharedItems, t);
    expect(slots[1].hint).toContain("claude-sonnet-4-6");
    expect(slots[1].hint).toContain("gpt-oss-120b-medium");
    expect(slots[1].hint).toContain("antigravity_quota.shared_group_members");
    expect(slots[1].hint).toContain("antigravity_quota.group_hint");
    // The raw list must not survive on the item, where it would reach the
    // detail line reserved for the reset countdown.
    expect(slots[1].item?.meta).toBeUndefined();
  });
});
