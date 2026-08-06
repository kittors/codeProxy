import { createAuthRefreshUnavailableError, type AuthGate, type AuthRequirement } from "./auth-state";
import { ApiError, extractApiErrorCode } from "./errors";
import type { TokenRefresher } from "./token-refresher";

export interface SendWithAuthInput {
  gate: AuthGate;
  refresher: TokenRefresher;
  url: string;
  /** Everything except headers and signal, which this module owns. */
  init: RequestInit;
  /** Rebuilt per attempt so a retry carries the rotated Authorization header. */
  buildHeaders: () => Headers;
  auth: AuthRequirement;
  signal: AbortSignal;
}

export interface SendWithAuthResult {
  response: Response;
  /** Auth generation at dispatch time; callers must not act on a stale one. */
  generation: number;
}

/** Sessions that only the tenant-override recovery path may see, not a logout. */
const SESSION_ENDING_CODES = new Set([
  "account_disabled",
  "account_locked",
  "session_expired",
  "session_revoked",
]);

const createSessionChangedError = (url: string): ApiError =>
  new ApiError({
    message: "Request cancelled because the management session changed.",
    status: 0,
    url,
  });

/**
 * Decide whether a failed response means the session itself is over.
 *
 * 403 is deliberately narrow: tenant_expired / tenant_suspended /
 * tenant_scope_forbidden are override-scope problems that AuthProvider recovers
 * from by dropping the override, so treating them as a logout would evict a
 * perfectly valid session.
 */
export const isSessionEndingFailure = (
  status: number,
  message: string,
  payload: unknown,
): boolean => {
  if (status === 401) return true;
  if (status !== 403) return false;
  return (
    SESSION_ENDING_CODES.has(extractApiErrorCode(payload)) ||
    /IP banned due to too many failed attempts/i.test(message)
  );
};

/**
 * Single egress point for authenticated management traffic.
 *
 * `request`, `streamSSE` and `downloadToFile` all route through here so the 401
 * → refresh → retry path exists exactly once, and so the generation guard
 * covers the streaming entry points too (they previously had none, which let a
 * late 401 from a replaced session sign the current one out).
 */
export async function sendWithAuth(input: SendWithAuthInput): Promise<SendWithAuthResult> {
  const { gate, refresher, url, init, buildHeaders, auth, signal } = input;
  gate.assertCanSend(auth);
  const generation = gate.getGeneration();
  let retried = false;

  for (;;) {
    const response = await fetch(url, { ...init, headers: buildHeaders(), signal });
    if (gate.getGeneration() !== generation) throw createSessionChangedError(url);
    if (response.status !== 401 || retried || !gate.hasRefreshToken()) {
      return { response, generation };
    }

    // Drain before re-sending: an unread body pins the connection for the whole
    // refresh round-trip. Reading it instead would consume the stream that
    // buildApiError needs on the paths that do not retry.
    await response.body?.cancel().catch(() => undefined);

    const outcome = await refresher.refresh();
    if (gate.getGeneration() !== generation) throw createSessionChangedError(url);
    if (outcome.kind === "refreshed") {
      retried = true;
      continue;
    }
    // Nothing was learned about the grant (rate limit, 5xx, offline, timeout):
    // surface a non-auth error so the session survives the outage.
    if (outcome.kind === "transient") throw createAuthRefreshUnavailableError();
    return { response, generation };
  }
}
