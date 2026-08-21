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
        {
          key: "antigravity:gemini_pro",
          label: "Gemini Pro",
          percent: 40,
          windowSeconds: FIVE_HOUR,
        },
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
describe("antigravity fallback view", () => {
  // The fallback view sends one row per family, already measured from a single
  // representative model. The card shows the family name as-is; meta names the
  // model behind the number and belongs behind the icon.
  const familyItems: QuotaItem[] = [
    {
      key: "antigravity:gemini_pro",
      label: "Gemini Pro",
      percent: 80,
      windowSeconds: FIVE_HOUR,
      meta: "gemini-3.1-pro-high",
    },
    {
      key: "antigravity:claude",
      label: "Claude",
      percent: 90,
      windowSeconds: FIVE_HOUR,
      meta: "claude-sonnet-4-6",
    },
  ];

  test("keeps the family name and adds no window suffix", () => {
    const slots = resolveQuotaCardSlots("antigravity", familyItems, t);
    expect(slots.map((slot) => slot.label)).toEqual(["Gemini Pro", "Claude"]);
  });

  test("explains which model the row was measured from, off the item", () => {
    const slots = resolveQuotaCardSlots("antigravity", familyItems, t);
    expect(slots[0].hint).toContain("antigravity_quota.measured_from");
    expect(slots[0].hint).toContain("antigravity_quota.group_hint");
    // meta must not survive on the item, where it would reach the countdown.
    expect(slots[0].item?.meta).toBeUndefined();
  });
});
