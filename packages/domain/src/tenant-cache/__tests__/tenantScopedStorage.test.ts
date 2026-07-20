import { beforeEach, describe, expect, test } from "vitest";
import {
  DEFAULT_CACHE_TENANT_ID,
  getActiveCacheTenantId,
  normalizeCacheTenantId,
  readTenantBucket,
  readTenantBucketMapEntry,
  readTenantTtlSlot,
  setActiveCacheScopePrefix,
  setActiveCacheTenantId,
  setCacheScopeResolver,
  setCacheTenantResolver,
  updateTenantBucketMapEntry,
  writeTenantBucket,
  writeTenantTtlSlot,
} from "../index";

describe("tenant-scoped storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setCacheTenantResolver(null);
    setCacheScopeResolver(null);
    setActiveCacheScopePrefix("");
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
  });

  test("normalizeCacheTenantId collapses empty values", () => {
    expect(normalizeCacheTenantId(null)).toBe(DEFAULT_CACHE_TENANT_ID);
    expect(normalizeCacheTenantId("")).toBe(DEFAULT_CACHE_TENANT_ID);
    expect(normalizeCacheTenantId("  ")).toBe(DEFAULT_CACHE_TENANT_ID);
    expect(normalizeCacheTenantId(" tenant-a ")).toBe("tenant-a");
  });

  test("active tenant follows setActiveCacheTenantId and resolver", () => {
    setActiveCacheTenantId("tenant-a");
    expect(getActiveCacheTenantId()).toBe("tenant-a");

    setCacheTenantResolver(() => "tenant-b");
    expect(getActiveCacheTenantId()).toBe("tenant-b");

    setCacheTenantResolver(() => "  ");
    expect(getActiveCacheTenantId()).toBe("tenant-a");
  });

  test("account scope prefixes tenant cache keys", () => {
    setActiveCacheTenantId("tenant-a");
    setActiveCacheScopePrefix("https://api.example::user-1");
    expect(getActiveCacheTenantId()).toBe("https://api.example::user-1::tenant-a");
    setActiveCacheScopePrefix("");
    expect(getActiveCacheTenantId()).toBe("tenant-a");
  });

  test("write/read buckets are isolated per tenant", () => {
    const key = "test.cache.v1";
    const parseBucket = (value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as { items: string[] })
        : null;

    writeTenantBucket({
      key,
      tenantId: "tenant-a",
      bucket: { items: ["a"] },
      parseBucket,
    });
    writeTenantBucket({
      key,
      tenantId: "tenant-b",
      bucket: { items: ["b"] },
      parseBucket,
    });

    expect(readTenantBucket({ key, tenantId: "tenant-a", parseBucket })?.items).toEqual([
      "a",
    ]);
    expect(readTenantBucket({ key, tenantId: "tenant-b", parseBucket })?.items).toEqual([
      "b",
    ]);
    expect(readTenantBucket({ key, tenantId: "tenant-c", parseBucket })).toBeNull();
  });

  test("uses active tenant when tenantId is omitted", () => {
    const key = "test.active.v1";
    const parseBucket = (value: unknown) =>
      typeof value === "object" && value !== null ? (value as { n: number }) : null;

    setActiveCacheTenantId("tenant-x");
    writeTenantBucket({ key, bucket: { n: 1 }, parseBucket });
    setActiveCacheTenantId("tenant-y");
    writeTenantBucket({ key, bucket: { n: 2 }, parseBucket });

    expect(readTenantBucket({ key, tenantId: "tenant-x", parseBucket })).toEqual({ n: 1 });
    expect(readTenantBucket({ key, tenantId: "tenant-y", parseBucket })).toEqual({ n: 2 });
  });

  test("migrates legacy unscoped payload into default tenant only", () => {
    const key = "test.migrated.v2";
    const legacyKey = "test.migrated.v1";
    const parseBucket = (value: unknown) =>
      typeof value === "object" && value !== null ? (value as { v: string }) : null;

    window.localStorage.setItem(legacyKey, JSON.stringify({ v: "legacy" }));

    expect(
      readTenantBucket({
        key,
        tenantId: DEFAULT_CACHE_TENANT_ID,
        legacyKey,
        parseBucket,
      }),
    ).toEqual({ v: "legacy" });

    expect(
      readTenantBucket({
        key,
        tenantId: "other-tenant",
        legacyKey,
        parseBucket,
      }),
    ).toBeNull();

    writeTenantBucket({
      key,
      tenantId: DEFAULT_CACHE_TENANT_ID,
      bucket: { v: "promoted" },
      legacyKey,
      parseBucket,
    });
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
  });

  test("map entries stay inside the active tenant bucket", () => {
    const key = "test.map.v1";
    updateTenantBucketMapEntry({
      key,
      kind: "session",
      tenantId: "tenant-a",
      entryKey: "k1",
      entryValue: { ok: true },
      maxEntries: 8,
    });
    updateTenantBucketMapEntry({
      key,
      kind: "session",
      tenantId: "tenant-b",
      entryKey: "k1",
      entryValue: { ok: false },
      maxEntries: 8,
    });

    expect(
      readTenantBucketMapEntry({
        key,
        kind: "session",
        tenantId: "tenant-a",
        entryKey: "k1",
      }),
    ).toEqual({ ok: true });
    expect(
      readTenantBucketMapEntry({
        key,
        kind: "session",
        tenantId: "tenant-b",
        entryKey: "k1",
      }),
    ).toEqual({ ok: false });
  });

  test("ttl slots isolate tenants and expire", () => {
    const key = "test.ttl.v2";
    writeTenantTtlSlot({
      key,
      tenantId: "tenant-a",
      slot: "gemini",
      data: ["a"],
      ttlMs: 60_000,
    });
    writeTenantTtlSlot({
      key,
      tenantId: "tenant-b",
      slot: "gemini",
      data: ["b"],
      ttlMs: 60_000,
    });

    expect(
      readTenantTtlSlot<string[]>({
        key,
        tenantId: "tenant-a",
        slot: "gemini",
        ttlMs: 60_000,
      }),
    ).toEqual(["a"]);
    expect(
      readTenantTtlSlot<string[]>({
        key,
        tenantId: "tenant-b",
        slot: "gemini",
        ttlMs: 60_000,
      }),
    ).toEqual(["b"]);

    // Force expiry by rewriting with a past timestamp via storage.
    const raw = window.localStorage.getItem(key);
    const parsed = JSON.parse(raw ?? "{}") as {
      byTenant: Record<string, Record<string, { data: string[]; timestamp: number }>>;
    };
    parsed.byTenant["tenant-a"].gemini.timestamp = Date.now() - 120_000;
    window.localStorage.setItem(key, JSON.stringify(parsed));

    expect(
      readTenantTtlSlot<string[]>({
        key,
        tenantId: "tenant-a",
        slot: "gemini",
        ttlMs: 60_000,
      }),
    ).toBeNull();
  });
});
