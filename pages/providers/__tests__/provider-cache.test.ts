import { beforeEach, describe, expect, test } from "vitest";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import { readRawRecord, withRawRecord } from "@code-proxy/api-client";
import {
  DEFAULT_CACHE_TENANT_ID,
  getActiveCacheTenantId,
  setActiveCacheTenantId,
  setCacheTenantResolver,
  writeTenantTtlSlot,
} from "@code-proxy/domain";
import { getCachedData, PROVIDERS_PAGE_CACHE_KEY, setCachedData } from "../provider-cache";

/*
 * 页面先用缓存里的列表画出卡片，请求返回前用户就可能点保存。缓存是 JSON，装不下挂在列表项上的后端原始记录，
 * 所以缓存要把它另存一份再还原；否则从缓存起步的列表一保存，面板没建模的字段就被清掉。
 */
describe("provider list cache", () => {
  const backend = { "api-key": "sk-codex", name: "Codex Main", priority: 5, "alpha-search": true };
  const loaded = () => withRawRecord(backend, { apiKey: "sk-codex", name: "Codex Main" });

  beforeEach(() => {
    localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
  });

  test("a list item gets its backend record back after a round trip through storage", () => {
    setCachedData<ProviderSimpleConfig[]>("codex", [loaded()]);

    const [item] = getCachedData<ProviderSimpleConfig[]>("codex") ?? [];

    expect(readRawRecord(item)).toEqual(backend);
    // 还原出来的对象和读出来的一样：只有建模字段可见，记录不在可枚举的字段里。
    expect(item).toEqual({ apiKey: "sk-codex", name: "Codex Main" });
    expect(Object.keys(item ?? {})).toEqual(["apiKey", "name"]);
  });

  test("the record is stored beside the item, not in the item's own fields", () => {
    setCachedData<ProviderSimpleConfig[]>("codex", [loaded()]);

    const stored = localStorage.getItem(PROVIDERS_PAGE_CACHE_KEY) ?? "";

    expect(stored).toContain("alpha-search");
    expect(stored).toContain("__backendRecord");
  });

  test("items without a backend record (a new channel) come back as they went in", () => {
    setCachedData<ProviderSimpleConfig[]>("codex", [{ apiKey: "sk-new", name: "New" }]);

    const [item] = getCachedData<ProviderSimpleConfig[]>("codex") ?? [];

    expect(item).toEqual({ apiKey: "sk-new", name: "New" });
    expect(readRawRecord(item)).toBeUndefined();
  });

  test("only lists are re-attached: other slots are stored and read back untouched", () => {
    const stats = { "sk-codex": { success: 3, failure: 1 } };
    setCachedData("usage-stats", stats);

    expect(getCachedData("usage-stats")).toEqual(stats);
  });

  test("another tenant does not see the record", () => {
    setActiveCacheTenantId("tenant-a");
    setCachedData<ProviderSimpleConfig[]>("codex", [loaded()]);
    setActiveCacheTenantId("tenant-b");

    expect(getCachedData("codex")).toBeNull();
  });

  // v2 快照里的条目没有后端记录。页面在第一次请求返回前就用缓存起步，读到它们再保存会清掉没建模的字段，
  // 所以缓存版本升到 v3，旧快照一律不读。
  test("a snapshot written before the records were kept is never read", () => {
    writeTenantTtlSlot({
      key: "providers-page:cache.v2",
      tenantId: getActiveCacheTenantId(),
      slot: "codex",
      data: [{ apiKey: "sk-codex", name: "Codex Main" }],
      ttlMs: 60_000,
      legacyPrefix: "providers-page:cache:",
    });

    expect(PROVIDERS_PAGE_CACHE_KEY).not.toBe("providers-page:cache.v2");
    expect(getCachedData("codex")).toBeNull();
  });
});
