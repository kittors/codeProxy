import i18next from "i18next";
import { beforeAll, describe, expect, test } from "vitest";
import en from "../locales/en.json";
import ru from "../locales/ru.json";
import zhCN from "../locales/zh-CN.json";

// Loop protection speaks in three places that must agree with each other and with the
// backend's own error text: the settings (config page and the API key dialog), the request
// log (tag and filter) and the monitor. The backend tells a client to turn off
// "Stop repeating replies" / "Stop tool-call loops" in "Loop protection"; the panel's
// English names are exactly those, so a person who reads the error finds the switch.

type Resource = Record<string, unknown>;

function resolve(resource: Resource, key: string): unknown {
  let cur: unknown = resource;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object" || !(part in (cur as object))) return undefined;
    cur = (cur as Resource)[part];
  }
  return cur;
}

const LOOP_GUARD_KEYS = [
  "reply_label",
  "reply_desc",
  "tool_label",
  "tool_desc",
  "window_label",
  "window_hint",
  "max_distinct_label",
  "max_distinct_hint",
  "repeats_label",
  "repeats_hint",
  "mode_inherit",
  "mode_on",
  "mode_off",
  "state_on",
  "state_off",
  "effective_off",
  "effective_on_tenant",
  "effective_on_key",
  "error_window",
  "error_max_distinct",
  "error_repeats",
  "key_overrides",
  "not_persistent",
  "read_only",
  "saved",
  "save_failed",
  "conflict",
  "revert",
  "key_section_title",
  "key_section_hint",
  "key_load_failed",
  "key_retry",
].map((key) => `loop_guard.${key}`);

const OTHER_KEYS = [
  "request_logs.status_loop_stopped",
  "request_logs.loop_stopped_reply",
  "request_logs.loop_stopped_tool",
  "request_logs.loop_stopped_other",
  "request_logs.guard_filter_label",
  "request_logs.guard_filter_all",
  "request_logs.guard_filter_any",
  "request_logs.guard_filter_reply_loop",
  "request_logs.guard_filter_tool_loop",
  "monitor_center.loop_guard.title",
  "monitor_center.loop_guard.reply_loops",
  "monitor_center.loop_guard.tool_loops",
  "monitor_center.loop_guard.saved",
  "monitor_center.loop_guard.hint",
  "config_ui.sections.loop_guard.title",
  "config_ui.sections.loop_guard.desc",
];

const ALL_KEYS = [...LOOP_GUARD_KEYS, ...OTHER_KEYS];
const LOCALES: Array<[string, Resource]> = [
  ["zh-CN", zhCN as Resource],
  ["en", en as Resource],
  ["ru", ru as Resource],
];

const placeholdersOf = (value: string) =>
  [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((match) => match[1]).sort();

describe("loop protection copy", () => {
  test.each(ALL_KEYS)("%s exists in every locale as a non-empty string", (key) => {
    for (const [name, resource] of LOCALES) {
      const value = resolve(resource, key);
      expect(typeof value, `${name}: ${key}`).toBe("string");
      expect(String(value).trim().length, `${name}: ${key}`).toBeGreaterThan(0);
      expect(value, `${name}: ${key}`).not.toBe(key);
    }
  });

  test.each(ALL_KEYS)("%s has the same placeholders in every locale", (key) => {
    const expected = placeholdersOf(String(resolve(en as Resource, key)));
    for (const [name, resource] of LOCALES) {
      expect(placeholdersOf(String(resolve(resource, key))), `${name}: ${key}`).toEqual(expected);
    }
  });

  test("the Russian copy is Russian, not an English sentence with a Russian tail", () => {
    for (const key of ALL_KEYS) {
      const russian = String(resolve(ru as Resource, key));
      expect(russian, key).toMatch(/[А-Яа-яЁё]{3,}/);
      // Three Latin words in a row is a sentence; "API-ключ" and "{{count}}" are not.
      expect(russian.replace(/\{\{[^}]+\}\}/g, ""), key).not.toMatch(
        /\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/,
      );
    }
  });

  test("the tenant is the Russian 'арендатор' it is everywhere else in the panel", () => {
    for (const key of [
      "loop_guard.mode_inherit",
      "loop_guard.effective_on_tenant",
      "loop_guard.key_section_hint",
    ]) {
      expect(String(resolve(ru as Resource, key))).toMatch(/арендатор/i);
    }
  });

  test("counts are written as 'noun: number', so no plural form is needed or offered", () => {
    for (const [name, resource] of LOCALES) {
      const section = (resource as Resource).loop_guard as Resource;
      for (const key of Object.keys(section)) {
        expect(key, `${name}: loop_guard.${key}`).not.toMatch(/_(zero|one|two|few|many|other)$/);
      }
    }
  });
});

describe("loop protection names", () => {
  test("the English names are the ones the backend's own error messages tell a person to turn off", () => {
    expect(en.loop_guard.reply_label).toBe("Stop repeating replies");
    expect(en.loop_guard.tool_label).toBe("Stop tool-call loops");
    for (const title of [
      en.config_ui.sections.loop_guard.title,
      en.loop_guard.key_section_title,
      en.monitor_center.loop_guard.title,
      en.request_logs.guard_filter_label,
    ]) {
      expect(title).toBe("Loop protection");
    }
  });

  test("the Chinese names and the tag", () => {
    expect(zhCN.config_ui.sections.loop_guard.title).toBe("循环保护");
    expect(zhCN.loop_guard.key_section_title).toBe("循环保护");
    expect(zhCN.request_logs.status_loop_stopped).toBe("循环已拦截");
  });

  test("the request log tag and the settings do not contradict each other", () => {
    // The tag says the loop was stopped; neither phrase may read as a failure of the gateway.
    expect(en.request_logs.status_loop_stopped).toBe("Stopped");
    expect(en.request_logs.status_loop_stopped).not.toBe(en.request_logs.status_failed);
    expect(zhCN.request_logs.status_loop_stopped).not.toBe(zhCN.request_logs.status_failed);
    expect(ru.request_logs.status_loop_stopped).not.toBe(ru.request_logs.status_failed);
  });
});

describe("loop protection copy with its numbers filled in", () => {
  const i18n = i18next.createInstance();

  beforeAll(async () => {
    await i18n.init({
      lng: "zh-CN",
      fallbackLng: ["en", "zh-CN"],
      interpolation: { escapeValue: false },
      resources: {
        "zh-CN": { translation: zhCN },
        en: { translation: en },
        ru: { translation: ru },
      },
    });
  });

  const tr = (lng: string, key: string, options: Record<string, unknown>) =>
    i18n.getFixedT(lng)(key, options) as string;

  test("the range hints show the backend's numbers", () => {
    const values = { value: 256, min: 64, max: 2048 };
    expect(tr("en", "loop_guard.window_hint", values)).toBe(
      "How many of the latest lines or sentences are compared. Default 256, from 64 to 2048.",
    );
    expect(tr("zh-CN", "loop_guard.window_hint", values)).toContain("默认 256，范围 64 到 2048");
    expect(tr("ru", "loop_guard.window_hint", values)).toContain("По умолчанию 256, от 64 до 2048");
  });

  test.each(["zh-CN", "en", "ru"])(
    "the number of keys with settings of their own reads right in %s",
    (lng) => {
      for (const count of [1, 2, 5, 11, 21]) {
        expect(tr(lng, "loop_guard.key_overrides", { count })).toContain(String(count));
      }
    },
  );

  test("a key's 'follow the tenant' names the tenant's current state in each language", () => {
    expect(
      tr("en", "loop_guard.mode_inherit", { state: tr("en", "loop_guard.state_on", {}) }),
    ).toBe("Follow the tenant (on)");
    expect(
      tr("zh-CN", "loop_guard.mode_inherit", { state: tr("zh-CN", "loop_guard.state_off", {}) }),
    ).toBe("跟随租户（关）");
    expect(
      tr("ru", "loop_guard.mode_inherit", { state: tr("ru", "loop_guard.state_on", {}) }),
    ).toBe("Как у арендатора (включено)");
  });
});
