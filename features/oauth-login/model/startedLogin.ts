import type { OAuthLoginFlow, OAuthProvider, OAuthStartResponse } from "@code-proxy/api-client";

/** Anthropic's own code page. A Claude login that redirects here shows a code to paste. */
export const CLAUDE_CODE_PAGE = "https://platform.claude.com/oauth/code/callback";

/** Login session lifetime on servers that do not report `expires_at` (oauthsession.DefaultTTL). */
export const DEFAULT_LOGIN_TTL_MS = 10 * 60 * 1000;

/** A reported expiry further out than this is clock skew, not a real deadline. */
const MAX_PLAUSIBLE_TTL_MS = 30 * 60 * 1000;

const DEVICE_PROVIDERS = new Set<OAuthProvider>(["qwen", "kimi"]);
const FLOWS = new Set<OAuthLoginFlow>(["redirect", "code", "device"]);

export interface StartedLogin {
  provider: OAuthProvider;
  url: string;
  state: string;
  flow: OAuthLoginFlow;
  /** Epoch ms after which the server no longer accepts this login's callback. */
  expiresAt: number;
  /** Where the browser lands after authorizing (redirect / code flows). */
  redirectUri?: string;
  userCode?: string;
  verificationUri?: string;
}

/** The redirect target named in an authorization URL; iFlow calls the parameter `redirect`. */
export function readRedirectUri(authUrl: string): string | undefined {
  try {
    const params = new URL(authUrl).searchParams;
    return (
      params.get("redirect_uri") ??
      params.get("redirect_url") ??
      params.get("redirect") ??
      undefined
    );
  } catch {
    return undefined;
  }
}

const readUrlParam = (url: string, name: string) => {
  try {
    return new URL(url).searchParams.get(name)?.trim() || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Turns a start response into what the dialog needs, filling in what servers
 * older than CliRelay#1127 do not send: the flow is inferred from the provider
 * and from where the issued URL redirects (Claude falls back to its code page
 * when no forwarder could start), and the expiry defaults to the session TTL.
 */
export function normalizeStartedLogin(
  provider: OAuthProvider,
  response: OAuthStartResponse,
  now = Date.now(),
): StartedLogin {
  const url = response.url?.trim() ?? "";
  const redirectUri = readRedirectUri(url);
  const flow: OAuthLoginFlow =
    response.flow && FLOWS.has(response.flow)
      ? response.flow
      : DEVICE_PROVIDERS.has(provider)
        ? "device"
        : redirectUri === CLAUDE_CODE_PAGE
          ? "code"
          : "redirect";

  let expiresAt = now + DEFAULT_LOGIN_TTL_MS;
  const reported = response.expires_at ? Date.parse(response.expires_at) : Number.NaN;
  if (Number.isFinite(reported) && reported > now && reported - now <= MAX_PLAUSIBLE_TTL_MS) {
    expiresAt = reported;
  } else if (response.expires_in && response.expires_in > 0) {
    expiresAt = Math.min(expiresAt, now + response.expires_in * 1000);
  }

  const userCode =
    response.user_code?.trim() || (flow === "device" ? readUrlParam(url, "user_code") : undefined);
  const verificationUri = response.verification_uri?.trim() || undefined;

  return {
    provider,
    url,
    state: response.state?.trim() ?? "",
    flow,
    expiresAt,
    redirectUri: flow === "device" ? undefined : redirectUri,
    userCode: flow === "device" ? userCode : undefined,
    verificationUri: flow === "device" ? verificationUri : undefined,
  };
}

const isLoopbackHostname = (hostname: string) => {
  const host = hostname.trim().toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
};

/**
 * Whether this browser shares a machine with the server. The provider redirects
 * to localhost, where the server runs a callback forwarder; that only reaches
 * the server when the browser is on the same machine, and then the login
 * finishes by itself. From anywhere else the page cannot open and its address
 * is pasted back. What matters is where the API runs, not where the panel was
 * loaded from (a local dev panel can point at a remote server).
 */
export function isServerOnLoopback(apiBase: string | undefined, locationHostname: string): boolean {
  const base = apiBase?.trim();
  if (!base) return isLoopbackHostname(locationHostname);
  try {
    return isLoopbackHostname(new URL(base).hostname);
  } catch {
    return false;
  }
}
