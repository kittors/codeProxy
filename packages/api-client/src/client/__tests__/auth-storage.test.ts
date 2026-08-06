import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyRefreshedTokens,
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
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_EFFECTIVE_TENANT_KEY)).toBeNull();
  });

  test("remember=false stays in sessionStorage only", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_test",
      rememberPassword: false,
    });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
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

// F4: a refresh write-back must never be swallowed by the read-time expiry check.
describe("applyRefreshedTokens", () => {
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

  test("rewrites token and expiry fields and bumps rotationSeq", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_a1",
      refreshToken: "cpr_adm_r1",
      rememberPassword: true,
      expiresAtMs: Date.now() + 60_000,
      refreshExpiresAtMs: Date.now() + 3_600_000,
      rotationSeq: 1,
    });

    const nextExpiresAtMs = Date.now() + 120_000;
    const nextRefreshExpiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const nextRotation = applyRefreshedTokens({
      managementKey: "cps_a2",
      refreshToken: "cpr_adm_r2",
      expiresAtMs: nextExpiresAtMs,
      refreshExpiresAtMs: nextRefreshExpiresAtMs,
    });

    expect(nextRotation).toBe(2);
    expect(readPersistedAuthSnapshot()).toMatchObject({
      managementKey: "cps_a2",
      refreshToken: "cpr_adm_r2",
      expiresAtMs: nextExpiresAtMs,
      refreshExpiresAtMs: nextRefreshExpiresAtMs,
      rotationSeq: 2,
    });
  });

  // The whole point of applyRefreshedTokens existing separately from
  // writePersistedAuthSnapshot: readPersistedAuthSnapshot would have deleted this
  // record on sight, taking the freshly rotated long-lived token down with it.
  test("patches an already-expired record instead of dropping it", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_stale",
      refreshToken: "cpr_adm_stale",
      rememberPassword: true,
      refreshExpiresAtMs: Date.now() - 1_000,
      rotationSeq: 1,
    });

    const nextRotation = applyRefreshedTokens({
      managementKey: "cps_fresh",
      refreshToken: "cpr_adm_fresh",
      refreshExpiresAtMs: Date.now() + 60_000,
    });

    expect(nextRotation).toBe(2);
    expect(readPersistedAuthSnapshot()).toMatchObject({
      managementKey: "cps_fresh",
      refreshToken: "cpr_adm_fresh",
      rotationSeq: 2,
    });
  });

  test("is a no-op and writes nothing when there is no session to patch", () => {
    const result = applyRefreshedTokens({ managementKey: "cps_new", refreshToken: "cpr_adm_new" });

    expect(result).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  test("keeps a rememberPassword:false record in sessionStorage after patching", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_old",
      rememberPassword: false,
      rotationSeq: 1,
    });

    applyRefreshedTokens({ managementKey: "cps_new" });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  // Regression guard for the opposite failure mode: a record that is genuinely
  // dead (never patched by a refresh) must still be dropped on read.
  test("readPersistedAuthSnapshot still drops and clears a genuinely dead record", () => {
    writePersistedAuthSnapshot({
      apiBase: "http://127.0.0.1:8317",
      managementKey: "cps_dead",
      rememberPassword: true,
      refreshExpiresAtMs: Date.now() - 1_000,
    });

    expect(readPersistedAuthSnapshot()).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
