import { describe, expect, test } from "vitest";
import { checkCallbackInput, isSameCallbackLocation, parseCallbackInput } from "../callbackInput";

const STATE = "st-123";
const codexRedirect = "http://localhost:1455/auth/callback";

describe("parseCallbackInput", () => {
  test("reads code and state from the address of the page that failed to load", () => {
    expect(
      parseCallbackInput(`${codexRedirect}?code=ac_9f&scope=openid&state=${STATE}`),
    ).toMatchObject({
      source: "url",
      code: "ac_9f",
      state: STATE,
      host: "localhost:1455",
      path: "/auth/callback",
    });
  });

  test("accepts an address copied without the scheme", () => {
    expect(
      parseCallbackInput(`localhost:8085/oauth2callback?state=${STATE}&code=4%2F0Ae`),
    ).toMatchObject({
      source: "url",
      code: "4/0Ae",
      state: STATE,
    });
  });

  test("accepts only the query string", () => {
    expect(parseCallbackInput(`?code=abc&state=${STATE}`)).toMatchObject({
      source: "query",
      code: "abc",
      state: STATE,
    });
    expect(parseCallbackInput(`code=abc&state=${STATE}`)).toMatchObject({
      source: "query",
      code: "abc",
    });
  });

  test("splits Claude's code#state", () => {
    expect(parseCallbackInput(`claude-code-xyz#${STATE}`)).toEqual({
      source: "code",
      code: "claude-code-xyz",
      state: STATE,
    });
  });

  test("takes a bare code as is", () => {
    expect(parseCallbackInput("  grok-one-time-code ")).toEqual({
      source: "code",
      code: "grok-one-time-code",
      state: undefined,
    });
  });

  test("strips quotes and stray wrapping picked up from chat apps", () => {
    expect(parseCallbackInput(`"${codexRedirect}?code=a&state=${STATE}".`)).toMatchObject({
      code: "a",
      state: STATE,
    });
    expect(parseCallbackInput(`${codexRedirect}?code=a&\n  state=${STATE}`)).toMatchObject({
      code: "a",
      state: STATE,
    });
  });

  test("reads parameters carried in the fragment", () => {
    expect(
      parseCallbackInput(`http://127.0.0.1:56121/callback#code=x&state=${STATE}`),
    ).toMatchObject({
      code: "x",
      state: STATE,
    });
  });

  test("returns null for blank input", () => {
    expect(parseCallbackInput("   ")).toBeNull();
  });
});

describe("checkCallbackInput", () => {
  const expected = { state: STATE, redirectUri: codexRedirect };

  test("a full callback address is ready to submit", () => {
    const check = checkCallbackInput(`${codexRedirect}?code=ac_9f&state=${STATE}`, expected);
    expect(check.issue).toBeUndefined();
    expect(check).toMatchObject({ hasCode: true, stateMatches: true, unexpectedLocation: false });
    expect(check.submission).toEqual({ code: "ac_9f", state: STATE });
  });

  test("a bare code falls back to the login's own state", () => {
    const check = checkCallbackInput("grok-code", expected);
    expect(check.stateMatches).toBeNull();
    expect(check.submission).toEqual({ code: "grok-code", state: STATE });
  });

  test("the sign-in page itself is not a callback", () => {
    expect(
      checkCallbackInput(
        "https://auth.openai.com/oauth/authorize?client_id=x&state=st-123",
        expected,
      ).issue,
    ).toBe("not_callback");
  });

  test("a truncated localhost address is missing its code", () => {
    expect(checkCallbackInput(`${codexRedirect}?state=${STATE}`, expected).issue).toBe(
      "missing_code",
    );
  });

  test("a callback from an earlier attempt is rejected before submitting", () => {
    const check = checkCallbackInput(`${codexRedirect}?code=a&state=old-state`, expected);
    expect(check.issue).toBe("state_mismatch");
    expect(check.submission).toBeUndefined();
  });

  test("a provider error is reported, not submitted", () => {
    const check = checkCallbackInput(
      `${codexRedirect}?error=access_denied&state=${STATE}`,
      expected,
    );
    expect(check.issue).toBe("provider_error");
    expect(check.parsed?.error).toBe("access_denied");
  });

  test("a sentence is not a code", () => {
    expect(checkCallbackInput("I could not find the code", expected).issue).toBe("not_a_code");
  });

  test("another port or path only warns", () => {
    const check = checkCallbackInput(
      `http://localhost:9999/elsewhere?code=a&state=${STATE}`,
      expected,
    );
    expect(check.issue).toBeUndefined();
    expect(check.unexpectedLocation).toBe(true);
  });

  test("empty input has nothing to submit", () => {
    expect(checkCallbackInput("", expected).issue).toBe("empty");
  });
});

describe("isSameCallbackLocation", () => {
  test("treats localhost and 127.0.0.1 as the same machine", () => {
    const parsed = parseCallbackInput("http://localhost:56121/callback?code=a")!;
    expect(isSameCallbackLocation(parsed, "http://127.0.0.1:56121/callback")).toBe(true);
  });

  test("ports and paths must match", () => {
    const parsed = parseCallbackInput("http://localhost:1456/auth/callback?code=a")!;
    expect(isSameCallbackLocation(parsed, codexRedirect)).toBe(false);
  });
});
