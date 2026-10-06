import { describe, expect, test } from "vitest";
import {
  classifyCredential,
  extractCredentials,
  findCredentialImportSpec,
  isCredentialImportMethod,
} from "../credentialImport";

const session = findCredentialImportSpec("anthropic", "session")!;
const codexRefresh = findCredentialImportSpec("codex", "refresh-token")!;
const antigravityRefresh = findCredentialImportSpec("antigravity", "refresh-token")!;
const sso = findCredentialImportSpec("xai", "sso-cookie")!;

describe("findCredentialImportSpec", () => {
  test("maps each provider+method to its server kind", () => {
    expect(session.kind).toBe("anthropic-session");
    expect(codexRefresh.kind).toBe("codex-refresh-token");
    expect(antigravityRefresh.kind).toBe("antigravity-refresh-token");
    expect(sso.kind).toBe("xai-sso");
    expect(sso.usingApiToggle).toBe(true);
    expect(codexRefresh.usingApiToggle).toBe(false);
  });

  test("returns null for a provider without that import", () => {
    expect(findCredentialImportSpec("codex", "session")).toBeNull();
    expect(findCredentialImportSpec("gemini-cli", "refresh-token")).toBeNull();
  });

  test("knows which methods are credential imports", () => {
    expect(isCredentialImportMethod("session")).toBe(true);
    expect(isCredentialImportMethod("refresh-token")).toBe(true);
    expect(isCredentialImportMethod("sso-cookie")).toBe(true);
    expect(isCredentialImportMethod("oauth")).toBe(false);
    expect(isCredentialImportMethod("cookie")).toBe(false);
  });
});

describe("extractCredentials — Claude sessionKey", () => {
  test("pulls the key out of a cookie header and ignores the rest", () => {
    expect(
      extractCredentials(session, "sessionKey=sk-ant-sid01-abc; lastActiveOrg=o1; _ga=GA1"),
    ).toEqual(["sk-ant-sid01-abc"]);
  });

  test("reads sessionKey from an exported JSON blob", () => {
    expect(
      extractCredentials(session, '{"cookies":{"sessionKey":"sk-ant-sid01-xyz"},"other":1}'),
    ).toEqual(["sk-ant-sid01-xyz"]);
  });

  test("takes a bare key as-is", () => {
    expect(extractCredentials(session, "  sk-ant-sid01-bare  ")).toEqual(["sk-ant-sid01-bare"]);
  });
});

describe("extractCredentials — refresh tokens", () => {
  test("reads tokens.refresh_token from a Codex auth.json", () => {
    const authJson = JSON.stringify({
      OPENAI_API_KEY: "sk-proj-xxx",
      tokens: { id_token: "id", access_token: "at", refresh_token: "rt-codex-abcdef123456" },
      last_refresh: "2026-10-06T00:00:00Z",
    });
    expect(extractCredentials(codexRefresh, authJson)).toEqual(["rt-codex-abcdef123456"]);
  });

  test("reads an env assignment and a bare Google token", () => {
    expect(extractCredentials(codexRefresh, "OPENAI_API_REFRESH_TOKEN=rt-env-abcdef123456")).toEqual([
      "rt-env-abcdef123456",
    ]);
    expect(extractCredentials(antigravityRefresh, "1//0g-google-refresh-token-value")).toEqual([
      "1//0g-google-refresh-token-value",
    ]);
  });
});

describe("extractCredentials — Grok SSO", () => {
  test("prefers sso, falls back to sso-rw, drops analytics cookies", () => {
    expect(extractCredentials(sso, "_ga=GA1; sso=grok-sso-value; sso-rw=grok-rw-value")).toEqual([
      "grok-sso-value",
    ]);
    expect(extractCredentials(sso, "_ga=GA1; sso-rw=grok-rw-only")).toEqual(["grok-rw-only"]);
  });

  test("skips a cookie string that carries none of the SSO cookies", () => {
    expect(extractCredentials(sso, "_ga=GA1; cf_clearance=x")).toEqual([]);
  });
});

describe("extractCredentials — bulk + dedup", () => {
  test("one credential per line, de-duplicated in first-seen order", () => {
    const raw = ["sk-ant-sid01-a", "sessionKey=sk-ant-sid01-b", "sk-ant-sid01-a", ""].join("\n");
    expect(extractCredentials(session, raw)).toEqual(["sk-ant-sid01-a", "sk-ant-sid01-b"]);
  });

  test("a JSON array of accounts yields each refresh token once", () => {
    const raw = JSON.stringify([
      { refresh_token: "rt-1-abcdef123456" },
      { tokens: { refresh_token: "rt-2-abcdef123456" } },
      { refresh_token: "rt-1-abcdef123456" },
    ]);
    expect(extractCredentials(codexRefresh, raw)).toEqual([
      "rt-1-abcdef123456",
      "rt-2-abcdef123456",
    ]);
  });

  test("empty input yields nothing", () => {
    expect(extractCredentials(session, "   ")).toEqual([]);
  });
});

describe("classifyCredential", () => {
  test("flags a Claude value that is not a session key", () => {
    expect(classifyCredential(session, "sk-ant-sid01-ok")).toBe("ok");
    expect(classifyCredential(session, "not-a-session-key")).toBe("suspect");
    expect(classifyCredential(session, "")).toBe("empty");
  });

  test("flags a leftover cookie string as suspect", () => {
    expect(classifyCredential(sso, "sso=x; sso-rw=y")).toBe("suspect");
    expect(classifyCredential(sso, "grok-sso-long-enough-value")).toBe("ok");
    expect(classifyCredential(codexRefresh, "short")).toBe("suspect");
  });
});
