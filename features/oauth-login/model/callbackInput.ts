/**
 * Reading what an operator pastes back after authorizing in the browser.
 *
 * People paste whatever they managed to copy: the whole address bar of the
 * localhost page that "can't be reached", only its query string, Claude's
 * `code#state` from the code page, or a bare code. All of them are recognised
 * here so the panel can say what is wrong *before* submitting — the backend can
 * only answer "invalid" after the fact, which is how operators ended up asking
 * where the callback URL comes from.
 */

export type CallbackIssue =
  /** Nothing pasted yet. */
  | "empty"
  /** A web address without a code: the sign-in page itself, copied too early. */
  | "not_callback"
  /** A callback address, but the code is missing (truncated copy). */
  | "missing_code"
  /** The provider redirected back with an error, e.g. the operator clicked "Cancel". */
  | "provider_error"
  /** The callback belongs to an earlier login attempt. */
  | "state_mismatch"
  /** Free text with spaces: not a code. */
  | "not_a_code";

export interface ParsedCallback {
  source: "url" | "query" | "code";
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  /** For pasted addresses: host (with port) and path, to compare with the expected redirect. */
  host?: string;
  path?: string;
}

export interface CallbackExpectation {
  /** State of the login in progress; a pasted callback must carry the same one. */
  state?: string;
  /** Where this login redirects after authorizing, when known. */
  redirectUri?: string;
}

export interface CallbackCheck {
  parsed: ParsedCallback | null;
  /** Blocking problem; when set there is nothing to submit. */
  issue?: CallbackIssue;
  /**
   * Non-blocking: a pasted address that is not where this login redirects
   * (another port or path). The code may still be good, so it only warns.
   */
  unexpectedLocation: boolean;
  hasCode: boolean;
  /** null when the input carries no state and the login's own state will be used. */
  stateMatches: boolean | null;
  /** What to send to /oauth-callback when there is no blocking issue. */
  submission?: { code: string; state?: string };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const looksLikeUrl = (text: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ||
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|\?|$)/i.test(text);

const looksLikeQuery = (text: string) => text.startsWith("?") || /(^|&)(code|state|error)=/.test(text);

const trimPasted = (raw: string) =>
  raw
    .trim()
    // Quotes, angle brackets and trailing punctuation picked up from chat apps and docs.
    .replace(/^["'`<(]+/, "")
    .replace(/["'`>),.;]+$/, "")
    .trim();

const readParams = (params: URLSearchParams) => ({
  code: params.get("code")?.trim() || undefined,
  state: params.get("state")?.trim() || undefined,
  error: params.get("error")?.trim() || undefined,
  errorDescription: params.get("error_description")?.trim() || undefined,
});

/**
 * Claude's code page shows `code#state`. Some providers also put the state in
 * the fragment of a bare code, so split once on the first `#`.
 */
const splitCodeAndState = (text: string) => {
  const hashIndex = text.indexOf("#");
  if (hashIndex <= 0) return { code: text, state: undefined };
  const state = text.slice(hashIndex + 1).trim();
  return { code: text.slice(0, hashIndex).trim(), state: state || undefined };
};

export function parseCallbackInput(raw: string): ParsedCallback | null {
  let text = trimPasted(raw);
  if (!text) return null;

  if (looksLikeUrl(text) || (looksLikeQuery(text) && !/\s/.test(text))) {
    // Terminals and some chat apps wrap long URLs; whitespace never belongs in one.
    text = text.replace(/\s+/g, "");
  }

  if (looksLikeUrl(text)) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
    try {
      const url = new URL(withScheme);
      const fromQuery = readParams(url.searchParams);
      // Implicit-style callbacks carry the parameters in the fragment instead.
      const fragment = url.hash.replace(/^#/, "");
      const fromFragment = fragment.includes("=")
        ? readParams(new URLSearchParams(fragment))
        : { code: undefined, state: undefined, error: undefined, errorDescription: undefined };
      return {
        source: "url",
        code: fromQuery.code ?? fromFragment.code,
        state: fromQuery.state ?? fromFragment.state,
        error: fromQuery.error ?? fromFragment.error,
        errorDescription: fromQuery.errorDescription ?? fromFragment.errorDescription,
        host: url.host.toLowerCase(),
        path: url.pathname,
      };
    } catch {
      return { source: "url" };
    }
  }

  if (looksLikeQuery(text)) {
    return { source: "query", ...readParams(new URLSearchParams(text.replace(/^\?/, ""))) };
  }

  const { code, state } = splitCodeAndState(text);
  return { source: "code", code, state };
}

const hostOf = (host: string) => {
  const portIndex = host.lastIndexOf(":");
  const bracketEnd = host.lastIndexOf("]");
  const name = portIndex > bracketEnd ? host.slice(0, portIndex) : host;
  const port = portIndex > bracketEnd ? host.slice(portIndex + 1) : "";
  return { name, port };
};

/**
 * Same place as the expected redirect? localhost and 127.0.0.1 are the same
 * machine to the browser, so loopback names are interchangeable; port and path
 * must match.
 */
export function isSameCallbackLocation(parsed: ParsedCallback, redirectUri: string): boolean {
  if (!parsed.host) return true;
  let expected: URL;
  try {
    expected = new URL(redirectUri);
  } catch {
    return true;
  }
  const pasted = hostOf(parsed.host);
  const wanted = hostOf(expected.host.toLowerCase());
  const sameHost =
    pasted.name === wanted.name ||
    (LOOPBACK_HOSTS.has(pasted.name) && LOOPBACK_HOSTS.has(wanted.name));
  const samePath =
    (parsed.path ?? "/").replace(/\/+$/, "") === expected.pathname.replace(/\/+$/, "");
  return sameHost && pasted.port === wanted.port && samePath;
}

export function checkCallbackInput(raw: string, expected: CallbackExpectation = {}): CallbackCheck {
  const parsed = parseCallbackInput(raw);
  const base = { parsed, unexpectedLocation: false, hasCode: false, stateMatches: null };
  if (!parsed) return { ...base, issue: "empty" };

  const hasCode = Boolean(parsed.code);
  const expectedState = expected.state?.trim() || undefined;
  const stateMatches = parsed.state && expectedState ? parsed.state === expectedState : null;
  const unexpectedLocation =
    parsed.source === "url" && expected.redirectUri
      ? !isSameCallbackLocation(parsed, expected.redirectUri)
      : false;
  const facts = { parsed, hasCode, stateMatches, unexpectedLocation };

  if (parsed.error) return { ...facts, issue: "provider_error" };
  if (!hasCode) {
    if (parsed.source === "url" && parsed.host && !LOOPBACK_HOSTS.has(hostOf(parsed.host).name)) {
      return { ...facts, issue: "not_callback" };
    }
    return { ...facts, issue: "missing_code" };
  }
  if (parsed.source === "code" && /\s/.test(parsed.code ?? "")) {
    return { ...facts, issue: "not_a_code" };
  }
  if (stateMatches === false) return { ...facts, issue: "state_mismatch" };

  return {
    ...facts,
    submission: { code: parsed.code as string, state: parsed.state ?? expectedState },
  };
}
