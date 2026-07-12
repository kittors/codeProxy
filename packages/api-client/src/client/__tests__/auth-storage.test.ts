import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearPersistedAuthSnapshot,
  LEGACY_EFFECTIVE_TENANT_KEY,
  readPersistedAuthSnapshot,
  updatePersistedEffectiveTenantId,
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

    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    expect(raw).toContain("tenant-acme");
    expect(localStorage.getItem(LEGACY_EFFECTIVE_TENANT_KEY)).toBeNull();
  });

  test("falls back to the legacy effective-tenant key once", () => {
    localStorage.setItem(
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
