import { describe, expect, test } from "vitest";
import type { LoopGuardKeyView, LoopGuardTenantView } from "@code-proxy/api-client";
import {
  draftFromKey,
  draftFromTenant,
  hasLoopGuardErrors,
  loopGuardDraftsEqual,
  loopGuardWriteOf,
  maxDistinctFor,
  validateLoopGuardDraft,
  type LoopGuardDraft,
} from "../loopGuardDraft";

// What the backend reports about itself; the panel never copies these numbers.
const INFO = {
  defaults: { reply_window: 256, reply_max_distinct: 24, tool_repeats: 8 },
  bounds: {
    min_reply_window: 64,
    max_reply_window: 2048,
    min_reply_distinct: 2,
    reply_distinct_window_share: 4,
    min_tool_repeats: 3,
    max_tool_repeats: 32,
  },
};

const draft = (overrides: Partial<LoopGuardDraft> = {}): LoopGuardDraft => ({
  replyMode: "on",
  replyWindow: "",
  replyMaxDistinct: "",
  toolMode: "on",
  toolRepeats: "",
  ...overrides,
});

const tenantView = (overrides: Partial<LoopGuardTenantView> = {}): LoopGuardTenantView => ({
  reply: { enabled: false, window: 0, max_distinct: 0 },
  tool: { enabled: false, repeats: 0 },
  key_overrides: 0,
  persistent: true,
  updated_at: "",
  ...INFO,
  ...overrides,
});

const keyView = (overrides: Partial<LoopGuardKeyView> = {}): LoopGuardKeyView => ({
  key_id: "key-1",
  reply: { enabled: null, window: 0, max_distinct: 0 },
  tool: { enabled: null, repeats: 0 },
  tenant: {
    reply: { enabled: false, window: 0, max_distinct: 0 },
    tool: { enabled: false, repeats: 0 },
  },
  effective: {
    reply: { enabled: false, source: "", window: 0, max_distinct: 0 },
    tool: { enabled: false, source: "", repeats: 0 },
  },
  persistent: true,
  updated_at: "",
  ...INFO,
  ...overrides,
});

describe("draft from the saved settings", () => {
  test("a tenant's two states are on and off, and a zero threshold is an empty box", () => {
    expect(draftFromTenant(tenantView())).toEqual(draft({ replyMode: "off", toolMode: "off" }));
    expect(
      draftFromTenant(
        tenantView({
          reply: { enabled: true, window: 128, max_distinct: 16 },
          tool: { enabled: true, repeats: 5 },
        }),
      ),
    ).toEqual(draft({ replyWindow: "128", replyMaxDistinct: "16", toolRepeats: "5" }));
  });

  test("a key can also follow the tenant, which is what null means", () => {
    expect(draftFromKey(keyView())).toEqual(draft({ replyMode: "inherit", toolMode: "inherit" }));
    expect(
      draftFromKey(
        keyView({
          reply: { enabled: false, window: 0, max_distinct: 0 },
          tool: { enabled: true, repeats: 12 },
        }),
      ),
    ).toEqual(draft({ replyMode: "off", toolRepeats: "12" }));
  });

  test("a threshold on a check the key follows is kept, so it is not lost on the next save", () => {
    expect(
      draftFromKey(keyView({ reply: { enabled: null, window: 512, max_distinct: 0 } })),
    ).toEqual(draft({ replyMode: "inherit", toolMode: "inherit", replyWindow: "512" }));
  });
});

describe("validation against the backend's bounds", () => {
  const errorsOf = (overrides: Partial<LoopGuardDraft>) =>
    validateLoopGuardDraft(draft(overrides), INFO);

  test("empty boxes mean the default and are always fine", () => {
    expect(errorsOf({})).toEqual({});
    expect(hasLoopGuardErrors(errorsOf({}))).toBe(false);
  });

  test.each([
    ["63", true],
    ["64", false],
    ["2048", false],
    ["2049", true],
    ["0", true],
    ["12.5", true],
    ["1e3", true],
    ["-64", true],
    ["abc", true],
    [" 128 ", false],
  ])("window %j is rejected: %s", (text, rejected) => {
    const errors = errorsOf({ replyWindow: text });
    expect(errors.replyWindow !== undefined).toBe(rejected);
    if (rejected) {
      expect(errors.replyWindow).toEqual({
        key: "loop_guard.error_window",
        values: { min: 64, max: 2048 },
      });
    }
  });

  test("the most different lines allowed follow the window, a quarter of it", () => {
    const at = (distinct: string) =>
      errorsOf({ replyWindow: "128", replyMaxDistinct: distinct }).replyMaxDistinct;
    expect(at("32")).toBeUndefined();
    expect(at("33")).toEqual({
      key: "loop_guard.error_max_distinct",
      values: { min: 2, max: 32, window: 128 },
    });
    expect(at("2")).toBeUndefined();
    expect(at("1")).toBeDefined();
  });

  test("without a window the default one sets the limit, as it does on the backend", () => {
    expect(errorsOf({ replyMaxDistinct: "64" }).replyMaxDistinct).toBeUndefined();
    expect(errorsOf({ replyMaxDistinct: "65" }).replyMaxDistinct?.values).toEqual({
      min: 2,
      max: 64,
      window: 256,
    });
  });

  test("a bad window is reported once and does not drag the other box into an error", () => {
    // 40 is fine for the default window, so only the window is wrong.
    expect(Object.keys(errorsOf({ replyWindow: "10", replyMaxDistinct: "40" }))).toEqual([
      "replyWindow",
    ]);
    // Too many even for the default window: both are wrong.
    expect(Object.keys(errorsOf({ replyWindow: "10", replyMaxDistinct: "100" })).sort()).toEqual([
      "replyMaxDistinct",
      "replyWindow",
    ]);
  });

  test.each([
    ["2", true],
    ["3", false],
    ["32", false],
    ["33", true],
  ])("tool repeats %j is rejected: %s", (text, rejected) => {
    expect(errorsOf({ toolRepeats: text }).toolRepeats !== undefined).toBe(rejected);
  });

  test("a check that is off has no thresholds to get wrong", () => {
    expect(
      errorsOf({
        replyMode: "off",
        replyWindow: "1",
        replyMaxDistinct: "1",
        toolMode: "off",
        toolRepeats: "1",
      }),
    ).toEqual({});
  });

  test("a key that follows the tenant still has its own boxes checked", () => {
    expect(errorsOf({ replyMode: "inherit", replyWindow: "10" }).replyWindow).toBeDefined();
  });
});

describe("the PUT body", () => {
  test("a tenant on with some thresholds filled: both sections go, empty boxes are left out", () => {
    expect(loopGuardWriteOf(draft({ replyWindow: "128", toolRepeats: " 5 " }), "tenant")).toEqual({
      reply: { enabled: true, window: 128 },
      tool: { enabled: true, repeats: 5 },
    });
  });

  test("every threshold that was filled is written, the distinct limit included", () => {
    expect(
      loopGuardWriteOf(
        draft({ replyWindow: "128", replyMaxDistinct: "16", toolRepeats: "5" }),
        "tenant",
      ),
    ).toEqual({
      reply: { enabled: true, window: 128, max_distinct: 16 },
      tool: { enabled: true, repeats: 5 },
    });
  });

  test("a check that is off is stored as off alone, so no invisible old threshold stays behind", () => {
    expect(
      loopGuardWriteOf(
        draft({
          replyMode: "off",
          replyWindow: "128",
          replyMaxDistinct: "16",
          toolMode: "off",
          toolRepeats: "5",
        }),
        "tenant",
      ),
    ).toEqual({ reply: { enabled: false }, tool: { enabled: false } });
  });

  test("a tenant has no 'follow': it is stored as off", () => {
    expect(
      loopGuardWriteOf(draft({ replyMode: "inherit", toolMode: "inherit" }), "tenant"),
    ).toEqual({
      reply: { enabled: false },
      tool: { enabled: false },
    });
  });

  test("a key following the tenant sends null, and keeps the thresholds it set", () => {
    expect(
      loopGuardWriteOf(
        draft({ replyMode: "inherit", replyWindow: "512", toolMode: "inherit" }),
        "key",
      ),
    ).toEqual({
      reply: { enabled: null, window: 512 },
      tool: { enabled: null },
    });
  });

  test("a key that exempts itself sends false", () => {
    expect(loopGuardWriteOf(draft({ replyMode: "off", toolMode: "on" }), "key")).toEqual({
      reply: { enabled: false },
      tool: { enabled: true },
    });
  });

  test("a threshold that is not a positive whole number is not sent", () => {
    expect(loopGuardWriteOf(draft({ replyWindow: "0", replyMaxDistinct: "x" }), "tenant")).toEqual({
      reply: { enabled: true },
      tool: { enabled: true },
    });
  });
});

describe("comparing drafts and the limits", () => {
  test("whitespace around a threshold is not an edit", () => {
    expect(
      loopGuardDraftsEqual(draft({ replyWindow: "128" }), draft({ replyWindow: " 128 " })),
    ).toBe(true);
    expect(loopGuardDraftsEqual(draft({ replyWindow: "128" }), draft({ replyWindow: "129" }))).toBe(
      false,
    );
    expect(loopGuardDraftsEqual(draft(), draft({ toolMode: "off" }))).toBe(false);
  });

  test("every box is compared on its trimmed text", () => {
    for (const field of ["replyWindow", "replyMaxDistinct", "toolRepeats"] as const) {
      expect(loopGuardDraftsEqual(draft({ [field]: "5" }), draft({ [field]: " 5 " })), field).toBe(
        true,
      );
      expect(loopGuardDraftsEqual(draft({ [field]: "5" }), draft({ [field]: "6" })), field).toBe(
        false,
      );
    }
  });

  test("the limit of most different lines is a share of the window, clamped to the window bounds", () => {
    expect(maxDistinctFor(256, INFO)).toBe(64);
    expect(maxDistinctFor(10, INFO)).toBe(16);
    expect(maxDistinctFor(100000, INFO)).toBe(512);
    expect(maxDistinctFor(130, INFO)).toBe(32);
    // A backend that reports no share leaves only the window itself as the limit...
    const noShare = { bounds: { ...INFO.bounds, reply_distinct_window_share: 0 } };
    expect(maxDistinctFor(256, noShare)).toBe(256);
    // ...still held to the backend's window bounds first.
    expect(maxDistinctFor(100000, noShare)).toBe(2048);
    expect(maxDistinctFor(10, noShare)).toBe(64);
  });
});
