import { describe, expect, test } from "vitest";
import en from "../locales/en.json";
import ru from "../locales/ru.json";
import zhCN from "../locales/zh-CN.json";

// Upstream access freezes speak in four places that must agree: the Portal Accounts page (admin),
// the user portal, the failed-request dialog in the request log, and the routing simulator. A
// freeze is not the account's own "frozen" status (end_users.status_frozen): that one stops the
// whole account, this one stops one upstream for it.

type Resource = Record<string, unknown>;

function resolve(resource: Resource, key: string): unknown {
  let cur: unknown = resource;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object" || !(part in (cur as object))) return undefined;
    cur = (cur as Resource)[part];
  }
  return cur;
}

const LOCALES: Array<[string, Resource]> = [
  ["zh-CN", zhCN as Resource],
  ["en", en as Resource],
  ["ru", ru as Resource],
];

const ACCESS_FREEZE_KEYS = Object.keys(zhCN.access_freeze).map((key) => `access_freeze.${key}`);

const OTHER_KEYS = [
  "error_detail.category.access_frozen",
  "error_detail.category.upstream_content_refusal",
  "error_detail.hint.access_frozen",
  "error_detail.hint.upstream_content_refusal",
  "log_content.route_trace.cause.upstream_content_refusal",
  "channel_groups_page.simulator.excluded.frozen",
];

const ALL_KEYS = [...ACCESS_FREEZE_KEYS, ...OTHER_KEYS];

const placeholdersOf = (value: string) =>
  [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((match) => match[1]).sort();

describe("access freeze copy", () => {
  test("the three languages carry the same keys", () => {
    const keysOf = (resource: Resource) => Object.keys(resource.access_freeze as Resource).sort();
    expect(keysOf(en as Resource)).toEqual(keysOf(zhCN as Resource));
    expect(keysOf(ru as Resource)).toEqual(keysOf(zhCN as Resource));
  });

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
      // Three Latin words in a row is a sentence; "ID" and "{{count}}" are not.
      expect(russian.replace(/\{\{[^}]+\}\}/g, ""), key).not.toMatch(
        /\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/,
      );
    }
  });

  test("counts are written as 'noun: number', so no plural form is needed or offered", () => {
    for (const [name, resource] of LOCALES) {
      for (const key of Object.keys(resource.access_freeze as Resource)) {
        expect(key, `${name}: access_freeze.${key}`).not.toMatch(/_(zero|one|two|few|many|other)$/);
      }
    }
    expect(en.access_freeze.strikes).toBe("Refusals: {{count}}");
    expect(zhCN.access_freeze.strikes).toBe("累计拒绝: {{count}}");
    expect(ru.access_freeze.strikes).toBe("Отказов: {{count}}");
  });
});

describe("access freeze names", () => {
  test("the request log's hints send the reader to the page the panel really calls Portal Accounts", () => {
    for (const [name, resource] of LOCALES) {
      const page = String(resolve(resource, "end_users.title"));
      for (const key of [
        "error_detail.hint.access_frozen",
        "error_detail.hint.upstream_content_refusal",
      ]) {
        expect(String(resolve(resource, key)), `${name}: ${key}`).toContain(page);
      }
    }
    expect(en.end_users.title).toBe("Portal Accounts");
    expect(zhCN.end_users.title).toBe("门户账号");
  });

  test("the refusal's hint says the gateway does not retry on another account, and who loses access", () => {
    expect(zhCN.error_detail.hint.upstream_content_refusal).toContain("不会换号重试");
    expect(zhCN.error_detail.hint.upstream_content_refusal).toContain("没有门户账号的 Key");
    expect(en.error_detail.hint.upstream_content_refusal).toContain("does not retry");
    expect(en.error_detail.hint.upstream_content_refusal).toContain("no portal account owns it");
  });

  test("an upstream the operator named is never named to the user: it reads as 'other upstream'", () => {
    expect(zhCN.access_freeze.other_provider).toBe("其他上游");
    expect(en.access_freeze.other_provider).toBe("Other upstream");
  });

  test("a provider's freeze tag is not mistaken for the account's own frozen status", () => {
    // end_users.status_frozen is a whole-account state shown as a status badge; the tag is per upstream.
    expect(en.access_freeze.chip).toContain("{{provider}}");
    expect(en.access_freeze.chip).not.toBe(en.end_users.status_frozen);
    expect(zhCN.access_freeze.chip).toBe("{{provider}} 已冻结");
  });
});
