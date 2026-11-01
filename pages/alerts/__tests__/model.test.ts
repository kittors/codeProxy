import { describe, expect, test } from "vitest";
import type { AlertChannel, AlertSettings } from "@code-proxy/api-client";
import {
  alertLanguageForUi,
  buildUpdate,
  channelHasDestination,
  channelIndexOfField,
  channelToWire,
  draftFromSettings,
  isDirty,
  newChannelDraft,
  parseInteger,
  secretFrom,
  secretIsSet,
  secretWire,
  validateDraft,
  type AlertDraft,
} from "../model";

const WEBHOOK: AlertChannel = {
  id: "ch-ops",
  kind: "webhook",
  name: "Ops",
  enabled: true,
  url: "https://hooks.example.com/****abcd",
  secret: "****",
};
const TELEGRAM: AlertChannel = {
  id: "ch-tg",
  kind: "telegram",
  name: "On call",
  enabled: false,
  bot_token: "1234****wxyz",
  chat_id: "-100123",
};

function settings(overrides: Partial<AlertSettings> = {}): AlertSettings {
  return {
    enabled: true,
    language: "zh-CN",
    cooldown_minutes: 360,
    channels: [WEBHOOK, TELEGRAM],
    rules: {
      quota_window: { enabled: true, threshold_percent: 90 },
      account_failure: { enabled: true, for_minutes: 10 },
      spending: { enabled: true, threshold_percent: 85 },
      use_it_or_lose_it: { enabled: false, min_remaining_percent: 40, hours_before_reset: 24 },
    },
    updated_at: "2026-11-01T08:00:00Z",
    persistent: true,
    limits: { max_channels: 8 },
    ...overrides,
  };
}

const draftOf = (overrides: Partial<AlertSettings> = {}, ui = "en") =>
  draftFromSettings(settings(overrides), ui);

describe("secret fields", () => {
  test("a stored secret is a mask that is sent back unchanged until it is edited or cleared", () => {
    const stored = secretFrom("https://hooks.example.com/****abcd");
    expect(secretWire(stored)).toBe("https://hooks.example.com/****abcd");
    expect(secretIsSet(stored)).toBe(true);

    expect(secretWire({ ...stored, input: "  https://hooks.example.com/new  " })).toBe(
      "https://hooks.example.com/new",
    );
    // Clearing wins over anything typed before it: the backend reads "" as "remove".
    expect(secretWire({ ...stored, input: "typed", clear: true })).toBe("");
    expect(secretIsSet({ ...stored, clear: true })).toBe(false);
  });

  test("a secret that was never set stays empty rather than becoming a mask", () => {
    const empty = secretFrom(undefined);
    expect(secretWire(empty)).toBe("");
    expect(secretIsSet(empty)).toBe(false);
    expect(secretWire({ ...empty, input: "   " })).toBe("");
  });
});

describe("draftFromSettings", () => {
  test("fills what the backend left out with the documented defaults, never NaN", () => {
    const draft = draftFromSettings(
      { persistent: true, limits: { max_channels: 8 } } as unknown as AlertSettings,
      "en",
    );
    expect(draft.enabled).toBe(false);
    expect(draft.cooldown).toBe("360");
    expect(draft.channels).toEqual([]);
    expect(draft.rules).toEqual({
      quota_window: { enabled: true, threshold: "90" },
      account_failure: { enabled: true, forMinutes: "10" },
      spending: { enabled: true, threshold: "90" },
      use_it_or_lose_it: { enabled: false, minRemaining: "40", hoursBeforeReset: "24" },
    });
  });

  test("keeps the saved message language, but follows the panel language before the first save", () => {
    expect(draftOf({ language: "zh-CN" }, "en").language).toBe("zh-CN");
    expect(draftOf({ language: "en" }, "zh-CN").language).toBe("en");
    // Never saved: the backend's "en" is only a default, so the panel language is the starting point.
    expect(draftOf({ language: "en", updated_at: undefined }, "zh-CN").language).toBe("zh-CN");
    expect(draftOf({ language: "en", updated_at: undefined }, "ru").language).toBe("en");
    expect(alertLanguageForUi("zh-TW")).toBe("zh-CN");
    expect(alertLanguageForUi("ru")).toBe("en");
  });

  test("an unknown channel kind is shown as a webhook instead of breaking the list", () => {
    const draft = draftOf({
      channels: [{ ...WEBHOOK, kind: "carrier-pigeon" as AlertChannel["kind"] }],
    });
    expect(draft.channels[0].kind).toBe("webhook");
  });

  test("gives every channel its own key, saved or not", () => {
    const keys = [...draftOf().channels.map((c) => c.key), newChannelDraft().key];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("channelToWire", () => {
  test("writes the masks back as they were read, so the backend keeps the stored values", () => {
    const [webhook, telegram] = draftOf().channels;
    expect(channelToWire(webhook)).toEqual({
      id: "ch-ops",
      kind: "webhook",
      name: "Ops",
      enabled: true,
      url: "https://hooks.example.com/****abcd",
      secret: "****",
    });
    expect(channelToWire(telegram)).toEqual({
      id: "ch-tg",
      kind: "telegram",
      name: "On call",
      enabled: false,
      bot_token: "1234****wxyz",
      chat_id: "-100123",
    });
  });

  test("a new channel has no id and only the fields of its kind", () => {
    const draft = { ...newChannelDraft("telegram"), name: " Pager ", chatId: " 42 " };
    draft.botToken = { ...draft.botToken, input: "123:abc" };
    const wire = channelToWire(draft);
    expect(wire).toEqual({
      kind: "telegram",
      name: "Pager",
      enabled: true,
      bot_token: "123:abc",
      chat_id: "42",
    });
    expect("id" in wire).toBe(false);
    expect("url" in wire).toBe(false);
  });

  test("a channel can be tried once it has somewhere to send to", () => {
    const hook = newChannelDraft("webhook");
    expect(channelHasDestination(hook)).toBe(false);
    hook.url = { ...hook.url, input: "https://hooks.example.com/x" };
    expect(channelHasDestination(hook)).toBe(true);
    hook.url = { ...hook.url, clear: true };
    expect(channelHasDestination(hook)).toBe(false);

    const bot = newChannelDraft("telegram");
    bot.botToken = { ...bot.botToken, input: "123:abc" };
    expect(channelHasDestination(bot)).toBe(false); // no chat yet
    bot.chatId = "42";
    expect(channelHasDestination(bot)).toBe(true);
  });
});

describe("validateDraft", () => {
  /** The paths of the fields that fail after applying patch to a fresh draft. */
  const invalid = (patch: (draft: AlertDraft) => void): string[] => {
    const draft = draftOf();
    patch(draft);
    return Object.keys(validateDraft(draft));
  };

  test("accepts the documented bounds and nothing outside them", () => {
    expect(validateDraft(draftOf())).toEqual({});
    expect(invalid((d) => void (d.cooldown = "10"))).toEqual([]);
    expect(invalid((d) => void (d.cooldown = "10080"))).toEqual([]);
    expect(invalid((d) => void (d.cooldown = "9"))).toEqual(["cooldown_minutes"]);
    expect(invalid((d) => void (d.cooldown = "10081"))).toEqual(["cooldown_minutes"]);
    expect(invalid((d) => void (d.rules.quota_window.threshold = "0"))).toEqual([
      "rules.quota_window.threshold_percent",
    ]);
    expect(invalid((d) => void (d.rules.quota_window.threshold = "100"))).toEqual([]);
    expect(invalid((d) => void (d.rules.spending.threshold = "101"))).toEqual([
      "rules.spending.threshold_percent",
    ]);
    // 0 minutes means "report at once", so it is valid here and nowhere else.
    expect(invalid((d) => void (d.rules.account_failure.forMinutes = "0"))).toEqual([]);
    expect(invalid((d) => void (d.rules.account_failure.forMinutes = "1441"))).toEqual([
      "rules.account_failure.for_minutes",
    ]);
    expect(invalid((d) => void (d.rules.use_it_or_lose_it.minRemaining = "0"))).toEqual([
      "rules.use_it_or_lose_it.min_remaining_percent",
    ]);
    expect(invalid((d) => void (d.rules.use_it_or_lose_it.hoursBeforeReset = "169"))).toEqual([
      "rules.use_it_or_lose_it.hours_before_reset",
    ]);
    expect(invalid((d) => void (d.rules.use_it_or_lose_it.hoursBeforeReset = "168"))).toEqual([]);
  });

  test("reports the range of the field that failed", () => {
    const draft = draftOf();
    draft.cooldown = "5";
    expect(validateDraft(draft)).toEqual({ cooldown_minutes: { min: 10, max: 10080 } });
  });

  test("an empty field, a fraction or a number with a unit is not an integer", () => {
    for (const bad of ["", "  ", "1.5", "12abc", "-3", "1e2", "0x10"]) {
      expect(parseInteger(bad, 0, 1000)).toBeNull();
    }
    expect(parseInteger(" 42 ", 0, 1000)).toBe(42);
  });
});

describe("isDirty", () => {
  test("a draft is clean until a value really changes", () => {
    const base = draftOf();
    expect(isDirty(base, draftOf())).toBe(false);

    const spaced = draftOf();
    spaced.cooldown = " 360 ";
    expect(isDirty(base, spaced)).toBe(false);

    const toggled = draftOf();
    toggled.enabled = false;
    expect(isDirty(base, toggled)).toBe(true);

    const typed = draftOf();
    typed.channels[0].url = { ...typed.channels[0].url, input: "https://hooks.example.com/new" };
    expect(isDirty(base, typed)).toBe(true);

    const cleared = draftOf();
    cleared.channels[1].botToken = { ...cleared.channels[1].botToken, clear: true };
    expect(isDirty(base, cleared)).toBe(true);
  });
});

describe("buildUpdate", () => {
  test("sends nothing when nothing changed", () => {
    expect(buildUpdate(draftOf(), draftOf())).toEqual({});
  });

  test("sends only the top-level fields that changed", () => {
    const draft = draftOf();
    draft.enabled = false;
    draft.cooldown = "720";
    expect(buildUpdate(draftOf(), draft)).toEqual({ enabled: false, cooldown_minutes: 720 });
  });

  test("changing one rule sends that rule whole and leaves the others out", () => {
    const draft = draftOf();
    draft.rules.spending = { enabled: true, threshold: "75" };
    expect(buildUpdate(draftOf(), draft)).toEqual({
      rules: { spending: { enabled: true, threshold_percent: 75 } },
    });

    const lose = draftOf();
    lose.rules.use_it_or_lose_it = { enabled: true, minRemaining: "50", hoursBeforeReset: "12" };
    expect(buildUpdate(draftOf(), lose)).toEqual({
      rules: {
        use_it_or_lose_it: { enabled: true, min_remaining_percent: 50, hours_before_reset: 12 },
      },
    });
  });

  test("a changed channel list is sent whole, with untouched secrets as their masks", () => {
    const draft = draftOf();
    draft.channels[0].url = { ...draft.channels[0].url, input: "https://hooks.example.com/new" };
    draft.channels[1].botToken = { ...draft.channels[1].botToken, clear: true };
    draft.channels.push({ ...newChannelDraft("feishu"), name: "Team" });

    const { channels, ...rest } = buildUpdate(draftOf(), draft);
    expect(rest).toEqual({});
    expect(channels).toHaveLength(3);
    expect(channels?.[0]).toMatchObject({
      id: "ch-ops",
      url: "https://hooks.example.com/new",
      secret: "****", // not edited: the mask goes back, so the backend keeps the stored one
    });
    expect(channels?.[1]).toMatchObject({ id: "ch-tg", bot_token: "", chat_id: "-100123" });
    expect(channels?.[2]).toMatchObject({ kind: "feishu", name: "Team", url: "" });
    expect(channels?.[2] && "id" in channels[2]).toBe(false);
  });

  test("the first save writes the language even if it was not touched", () => {
    const base = draftOf({ language: "en", updated_at: undefined }, "zh-CN");
    expect(buildUpdate(base, base)).toEqual({});
    expect(buildUpdate(base, base, { firstSave: true })).toEqual({ language: "zh-CN" });
  });
});

describe("channelIndexOfField", () => {
  test("finds the channel a backend field path points into", () => {
    expect(channelIndexOfField("channels[2].url")).toBe(2);
    expect(channelIndexOfField("channels[0]")).toBe(0);
    expect(channelIndexOfField("channels")).toBeNull();
    expect(channelIndexOfField("rules.spending.threshold_percent")).toBeNull();
  });
});
