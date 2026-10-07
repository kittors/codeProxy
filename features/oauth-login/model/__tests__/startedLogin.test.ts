import { describe, expect, test } from "vitest";
import {
  CLAUDE_CODE_PAGE,
  DEFAULT_LOGIN_TTL_MS,
  isServerOnLoopback,
  normalizeStartedLogin,
  readRedirectUri,
} from "../startedLogin";

const NOW = Date.parse("2026-10-05T08:00:00Z");
const authUrl = (redirect: string) =>
  `https://auth.example.com/authorize?client_id=c&redirect_uri=${encodeURIComponent(redirect)}&state=s1`;

describe("normalizeStartedLogin", () => {
  test("uses what a current server reports", () => {
    const login = normalizeStartedLogin(
      "codex",
      {
        url: authUrl("http://localhost:1455/auth/callback"),
        state: "s1",
        flow: "redirect",
        expires_at: "2026-10-05T08:10:00Z",
      },
      NOW,
    );
    expect(login).toMatchObject({
      flow: "redirect",
      state: "s1",
      expiresAt: Date.parse("2026-10-05T08:10:00Z"),
      redirectUri: "http://localhost:1455/auth/callback",
    });
  });

  test("infers the Claude code flow from where an older server redirects", () => {
    const login = normalizeStartedLogin(
      "anthropic",
      { url: authUrl(CLAUDE_CODE_PAGE), state: "s1" },
      NOW,
    );
    expect(login.flow).toBe("code");
    expect(login.expiresAt).toBe(NOW + DEFAULT_LOGIN_TTL_MS);
  });

  test("infers the device flow for Qwen and Kimi and reads the code from the URL", () => {
    const login = normalizeStartedLogin(
      "qwen",
      { url: "https://chat.qwen.ai/authorize?user_code=ABCD-EFGH&client=qwen-code", state: "s1" },
      NOW,
    );
    expect(login).toMatchObject({ flow: "device", userCode: "ABCD-EFGH", redirectUri: undefined });
  });

  test("keeps the device fields a current server sends", () => {
    const login = normalizeStartedLogin(
      "kimi",
      {
        url: "https://www.kimi.com/device?user_code=K1",
        state: "s1",
        flow: "device",
        user_code: "K1-2",
        verification_uri: "https://www.kimi.com/device",
        expires_in: 300,
      },
      NOW,
    );
    expect(login).toMatchObject({
      userCode: "K1-2",
      verificationUri: "https://www.kimi.com/device",
    });
    expect(login.expiresAt).toBe(NOW + 300_000);
  });

  test("ignores an expiry that only clock skew could explain", () => {
    const past = normalizeStartedLogin(
      "codex",
      { url: "https://x.test", state: "s", expires_at: "2026-10-05T07:00:00Z" },
      NOW,
    );
    const farAway = normalizeStartedLogin(
      "codex",
      { url: "https://x.test", state: "s", expires_at: "2026-10-06T08:00:00Z" },
      NOW,
    );
    expect(past.expiresAt).toBe(NOW + DEFAULT_LOGIN_TTL_MS);
    expect(farAway.expiresAt).toBe(NOW + DEFAULT_LOGIN_TTL_MS);
  });
});

describe("readRedirectUri", () => {
  test("knows iFlow's redirect parameter", () => {
    expect(
      readRedirectUri(
        "https://iflow.cn/oauth?redirect=http%3A%2F%2Flocalhost%3A11451%2Foauth2callback",
      ),
    ).toBe("http://localhost:11451/oauth2callback");
  });

  test("returns undefined for something that is not a URL", () => {
    expect(readRedirectUri("not a url")).toBeUndefined();
  });
});

describe("isServerOnLoopback", () => {
  test("looks at the API base, not the panel's own address", () => {
    expect(isServerOnLoopback("http://127.0.0.1:8317", "relay.example.com")).toBe(true);
    expect(isServerOnLoopback("https://relay.example.com", "localhost")).toBe(false);
  });

  test("falls back to the page address when the panel is served by the server", () => {
    expect(isServerOnLoopback("", "localhost")).toBe(true);
    expect(isServerOnLoopback(undefined, "relay.example.com")).toBe(false);
  });
});
