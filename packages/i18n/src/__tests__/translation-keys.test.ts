import { describe, expect, test } from "vitest";
import en from "../locales/en.json";
import ru from "../locales/ru.json";
import zhCN from "../locales/zh-CN.json";

function resolve(resource: Record<string, unknown>, key: string): unknown {
  let cur: unknown = resource;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object" || !(part in (cur as object))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// Keys used as DataTable column labels (uppercase CSS would expose missing keys loudly).
const REQUIRED_KEYS = [
  "providers.model_alias",
  "providers.real_model_id",
  "providers.model_enabled",
  "common.model_alias_placeholder",
  "shell.stale_route_title",
  "shell.stale_route_description",
  "shell.stale_route_shortcut",
  "shell.stale_route_reload",
] as const;

const PORTAL_USAGE_KEYS = [
  "end_users.view_usage",
  "api_keys_page.usage_summary_tokens",
  "api_keys_page.usage_summary_requests",
  "api_keys_page.usage_summary_success_rate",
  "api_keys_page.usage_summary_current_page",
  "api_keys_page.usage_summary_filtered",
  "api_keys_page.col_input",
  "api_keys_page.col_output",
  "api_keys_page.col_total_token",
] as const;

// The busy-wait field is shown in every language. ru.json may leave a key out (English shows
// instead), and ru-translation-coverage only catches values copied byte for byte, so this pins that
// the field's copy exists in all three languages and that the Russian one is Russian.
const BUSY_WAIT_KEYS = [
  "channel_groups_page.busy_wait_label",
  "channel_groups_page.busy_wait_hint",
  "channel_groups_page.busy_wait_placeholder",
  "channel_groups_page.busy_wait_invalid",
] as const;

describe("translation keys", () => {
  test.each(REQUIRED_KEYS)("%s exists in zh-CN and en as a non-empty string", (key) => {
    const zh = resolve(zhCN as Record<string, unknown>, key);
    const enVal = resolve(en as Record<string, unknown>, key);
    expect(typeof zh).toBe("string");
    expect(String(zh).trim().length).toBeGreaterThan(0);
    expect(typeof enVal).toBe("string");
    expect(String(enVal).trim().length).toBeGreaterThan(0);
    // Must not fall through to the raw key itself.
    expect(zh).not.toBe(key);
    expect(enVal).not.toBe(key);
  });

  test.each(PORTAL_USAGE_KEYS)("%s exists in every locale as a non-empty string", (key) => {
    for (const resource of [zhCN, en, ru]) {
      const value = resolve(resource as Record<string, unknown>, key);
      expect(typeof value).toBe("string");
      expect(String(value).trim().length).toBeGreaterThan(0);
      expect(value).not.toBe(key);
    }
  });

  test.each(BUSY_WAIT_KEYS)("%s exists in every locale, and the Russian one is Russian", (key) => {
    for (const resource of [zhCN, en, ru]) {
      const value = resolve(resource as Record<string, unknown>, key);
      expect(typeof value).toBe("string");
      expect(String(value).trim().length).toBeGreaterThan(0);
      expect(value).not.toBe(key);
    }
    const russian = String(resolve(ru as Record<string, unknown>, key));
    expect(russian).toMatch(/[А-Яа-яЁё]{3,}/);
    // Not an English sentence with a Russian tail: three Latin words in a row is a sentence.
    expect(russian).not.toMatch(/\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/);
  });
});
