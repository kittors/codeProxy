import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearPersistedAuthSnapshot,
  getSavedAuthAccount,
  LEGACY_EFFECTIVE_TENANT_KEY,
  listSavedAuthAccounts,
  readPersistedAuthSnapshot,
  removeSavedAuthAccount,
  updatePersistedEffectiveTenantId,
  upsertSavedAuthAccount,
  writePersistedAuthSnapshot,
} from "../auth-storage";
import { AUTH_STORAGE_KEY } from "../constants";

describe("auth-storage effective tenant persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  test("writes and reads effectiveTenantId with the auth snapshot", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_test",
      rememberPassword: true,
      effectiveTenantId: "tenant-acme",
    });

    expect(readPersistedAuthSnapshot()).toEqual({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_test",
      rememberPassword: true,
      effectiveTenantId: "tenant-acme",
    });

    // Active snapshot is per-tab (sessionStorage) to isolate multi-account tabs.
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    expect(raw).toContain("tenant-acme");
    expect(localStorage.getItem(LEGACY_EFFECTIVE_TENANT_KEY)).toBeNull();
  });

  test("falls back to the legacy effective-tenant key once", () => {
    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: true,
        expiresAt: Date.now() + 60_000,
      }),
    );
    localStorage.setItem(LEGACY_EFFECTIVE_TENANT_KEY, "tenant-legacy");

    expect(readPersistedAuthSnapshot()?.effectiveTenantId).toBe("tenant-legacy");

    updatePersistedEffectiveTenantId("tenant-migrated");
    expect(readPersistedAuthSnapshot()?.effectiveTenantId).toBe("tenant-migrated");
    expect(localStorage.getItem(LEGACY_EFFECTIVE_TENANT_KEY)).toBeNull();
  });

  test("updatePersistedEffectiveTenantId patches only the tenant override", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_test",
      rememberPassword: false,
    });
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();

    updatePersistedEffectiveTenantId("tenant-b");
    expect(readPersistedAuthSnapshot()).toMatchObject({
      managementKey: "cps_test",
      rememberPassword: false,
      effectiveTenantId: "tenant-b",
    });

    updatePersistedEffectiveTenantId("");
    expect(readPersistedAuthSnapshot()).toEqual({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_test",
      rememberPassword: false,
    });
  });

  test("clearPersistedAuthSnapshot removes auth and legacy tenant keys", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_test",
      rememberPassword: true,
      effectiveTenantId: "tenant-acme",
    });
    localStorage.setItem(LEGACY_EFFECTIVE_TENANT_KEY, "stale");

    clearPersistedAuthSnapshot();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_EFFECTIVE_TENANT_KEY)).toBeNull();
  });
});

describe("auth-storage multi-account vault", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  test("write with accountId upserts vault entry", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_a",
      rememberPassword: true,
      accountId: "user-a",
      username: "alice",
      displayName: "Alice",
    });

    expect(listSavedAuthAccounts()).toEqual([
      expect.objectContaining({
        accountId: "user-a",
        accountKey: "http://127.0.0.1:8317\0user-a",
        username: "alice",
        displayName: "Alice",
        managementKey: "cps_a",
      }),
    ]);
  });

  test("upsert replaces same account and keeps others", () => {
    const now = Date.now();
    upsertSavedAuthAccount({
      accountId: "user-a",
      accountKey: "http://127.0.0.1:8317\0user-a",
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_a",
      rememberPassword: true,
      username: "alice",
      displayName: "Alice",
      lastUsedAt: now - 2,
    });
    upsertSavedAuthAccount({
      accountId: "user-b",
      accountKey: "http://127.0.0.1:8317\0user-b",
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_b",
      rememberPassword: true,
      username: "bob",
      displayName: "Bob",
      lastUsedAt: now - 1,
    });
    upsertSavedAuthAccount({
      accountId: "user-a",
      accountKey: "http://127.0.0.1:8317\0user-a",
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_a2",
      rememberPassword: true,
      username: "alice",
      displayName: "Alice",
      lastUsedAt: now,
    });

    const accounts = listSavedAuthAccounts();
    expect(accounts.map((row) => row.accountId)).toEqual(["user-a", "user-b"]);
    expect(getSavedAuthAccount("http://127.0.0.1:8317\0user-a")?.managementKey).toBe("cps_a2");
  });

  test("same user id on different apiBase does not collide", () => {
    const now = Date.now();
    upsertSavedAuthAccount({
      accountId: "user-a",
      accountKey: "https://a.example\0user-a",
      apiBase: "https://a.example",
      managementKey: "cps_a",
      rememberPassword: true,
      username: "alice",
      displayName: "Alice",
      lastUsedAt: now - 1,
    });
    upsertSavedAuthAccount({
      accountId: "user-a",
      accountKey: "https://b.example\0user-a",
      apiBase: "https://b.example",
      managementKey: "cps_b",
      rememberPassword: true,
      username: "alice",
      displayName: "Alice",
      lastUsedAt: now,
    });
    expect(listSavedAuthAccounts()).toHaveLength(2);
  });

  test("remember=false stays in session vault only", () => {
    upsertSavedAuthAccount({
      accountId: "user-s",
      accountKey: "http://127.0.0.1:8317\0user-s",
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_s",
      rememberPassword: false,
      username: "session",
      displayName: "Session",
      lastUsedAt: Date.now(),
    });
    expect(listSavedAuthAccounts()).toHaveLength(1);
    expect(localStorage.getItem("code-proxy-admin-auth-accounts")).toBeNull();
    expect(sessionStorage.getItem("code-proxy-admin-auth-accounts-session")).toBeTruthy();
  });

  test("removeSavedAuthAccount drops one vault entry", () => {
    const now = Date.now();
    upsertSavedAuthAccount({
      accountId: "user-a",
      accountKey: "http://127.0.0.1:8317\0user-a",
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_a",
      rememberPassword: true,
      username: "alice",
      displayName: "Alice",
      lastUsedAt: now - 1,
    });
    upsertSavedAuthAccount({
      accountId: "user-b",
      accountKey: "http://127.0.0.1:8317\0user-b",
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_b",
      rememberPassword: true,
      username: "bob",
      displayName: "Bob",
      lastUsedAt: now,
    });
    removeSavedAuthAccount("http://127.0.0.1:8317\0user-a");
    expect(listSavedAuthAccounts().map((row) => row.accountId)).toEqual(["user-b"]);
  });
});
