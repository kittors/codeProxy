import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  PORTAL_ACCOUNTS_STORAGE_KEY,
  PORTAL_AUTH_STORAGE_KEY,
  clearPortalAuth,
  getSavedPortalAccount,
  listSavedPortalAccounts,
  portalClient,
  removeSavedPortalAccount,
  writePortalAuth,
} from "../portal-client";

describe("portal multi-account vault", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  test("writePortalAuth upserts vault by accountKey", () => {
    writePortalAuth({
      apiBase: "http://127.0.0.1:8317",
      accessToken: "tok-a",
      refreshToken: "ref-a",
      remember: true,
      expiresAt: Date.now() + 60_000,
      user: { id: "u1", username: "alice", display_name: "Alice" },
    });
    expect(listSavedPortalAccounts()).toEqual([
      expect.objectContaining({
        accessToken: "tok-a",
        user: expect.objectContaining({ id: "u1", username: "alice" }),
      }),
    ]);
    expect(localStorage.getItem(PORTAL_AUTH_STORAGE_KEY)).toContain("tok-a");
  });

  test("switch parks current and activates target", () => {
    writePortalAuth({
      apiBase: "http://127.0.0.1:8317",
      accessToken: "tok-a",
      refreshToken: "ref-a",
      remember: true,
      expiresAt: Date.now() + 60_000,
      user: { id: "u1", username: "alice", display_name: "Alice" },
    });
    portalClient.loadFromStorage();
    writePortalAuth({
      apiBase: "http://127.0.0.1:8317",
      accessToken: "tok-b",
      refreshToken: "ref-b",
      remember: true,
      expiresAt: Date.now() + 60_000,
      user: { id: "u2", username: "bob", display_name: "Bob" },
    });
    portalClient.loadFromStorage();
    expect(listSavedPortalAccounts()).toHaveLength(2);

    const switched = portalClient.switchToSavedAccount("u1");
    expect(switched?.user.id).toBe("u1");
    expect(portalClient.getAccessToken()).toBe("tok-a");
    expect(listSavedPortalAccounts().map((r) => r.user.id).sort()).toEqual(["u1", "u2"]);
  });

  test("removeSavedPortalAccount drops one entry", () => {
    writePortalAuth({
      apiBase: "http://127.0.0.1:8317",
      accessToken: "tok-a",
      refreshToken: "ref-a",
      remember: true,
      expiresAt: Date.now() + 60_000,
      user: { id: "u1", username: "alice", display_name: "Alice" },
    });
    writePortalAuth({
      apiBase: "http://127.0.0.1:8317",
      accessToken: "tok-b",
      refreshToken: "ref-b",
      remember: true,
      expiresAt: Date.now() + 60_000,
      user: { id: "u2", username: "bob", display_name: "Bob" },
    });
    removeSavedPortalAccount("u1");
    expect(listSavedPortalAccounts().map((r) => r.user.id)).toEqual(["u2"]);
    expect(getSavedPortalAccount("u1")).toBeNull();
    expect(localStorage.getItem(PORTAL_ACCOUNTS_STORAGE_KEY)).toContain("u2");
  });

  test("parkSession clears active auth but keeps vault", () => {
    writePortalAuth({
      apiBase: "http://127.0.0.1:8317",
      accessToken: "tok-a",
      refreshToken: "ref-a",
      remember: true,
      expiresAt: Date.now() + 60_000,
      user: { id: "u1", username: "alice", display_name: "Alice" },
    });
    portalClient.loadFromStorage();
    portalClient.parkSession();
    expect(portalClient.getAccessToken()).toBe("");
    expect(listSavedPortalAccounts()).toHaveLength(1);
    clearPortalAuth();
  });
});
