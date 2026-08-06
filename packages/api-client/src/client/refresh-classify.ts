import { REFRESH_RETRY_BACKOFF_MS } from "./constants";
import { extractApiErrorCode } from "./errors";
import { isRecord } from "./response";

export type RefreshOutcome =
  | {
      kind: "refreshed";
      accessToken: string;
      refreshToken: string;
      expiresAtMs?: number;
      refreshExpiresAtMs?: number;
    }
  | { kind: "invalid"; code: string }
  | { kind: "transient"; reason: string }
  | { kind: "no-credential" };

/**
 * Statuses that mean "the server looked at this grant and rejected it".
 *
 * 429 is deliberately absent: a rate-limited refresh says nothing about the
 * grant, and treating it as invalid locks the user out of the product for the
 * whole cooldown. 404/405/501 are also absent even though they are 4xx —
 * they mean the endpoint is missing (stale build, misrouted proxy), not that
 * the session died.
 */
const INVALID_GRANT_STATUSES = new Set([400, 401, 403]);

/**
 * Status-only verdict, for callers that have a status but no response body to
 * classify (the portal client). Shared with classifyRefreshResponse so both
 * session layers agree on what counts as "the server rejected this grant" —
 * notably that 429 does not.
 */
export const classifyRefreshStatus = (status: number): "invalid" | "transient" =>
  INVALID_GRANT_STATUSES.has(status) ? "invalid" : "transient";

/** Retry-After is attacker/ops controlled; never wait longer than the retry budget. */
const MAX_RETRY_AFTER_MS = 5_000;

const isHtmlResponse = (contentType: string, body: string): boolean =>
  /text\/html/i.test(contentType) || /^\s*<(?:!doctype|html)\b/i.test(body);

const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readOptionalString = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Classify a refresh response body.
 *
 * The rule is one-way: only an explicit rejection of the grant counts as
 * invalid; everything else — including a 200 that does not carry a token —
 * is transient, because the caller must keep the session alive whenever the
 * server did not actually say it is gone.
 */
export const classifyRefreshResponse = async (response: Response): Promise<RefreshOutcome> => {
  const status = response.status;

  if (status !== 200) {
    if (INVALID_GRANT_STATUSES.has(status)) {
      const payload = await readJsonSafely(response);
      return { kind: "invalid", code: extractApiErrorCode(payload) };
    }
    return { kind: "transient", reason: `http_${status}` };
  }

  let body = "";
  try {
    body = await response.text();
  } catch {
    return { kind: "transient", reason: "body_unreadable" };
  }

  // A captive portal / reverse proxy error page can arrive with status 200.
  if (isHtmlResponse(response.headers.get("Content-Type") ?? "", body)) {
    return { kind: "transient", reason: "html_response" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return { kind: "transient", reason: "unparseable_body" };
  }
  if (!isRecord(payload)) return { kind: "transient", reason: "unexpected_payload" };

  const accessToken = readOptionalString(payload.access_token).trim();
  if (!accessToken) return { kind: "transient", reason: "missing_access_token" };

  const expiresAtMs = toEpochMs(payload.expires_at);
  const refreshExpiresAtMs = toEpochMs(payload.refresh_expires_at);
  return {
    kind: "refreshed",
    accessToken,
    refreshToken: readOptionalString(payload.refresh_token).trim(),
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
    ...(refreshExpiresAtMs !== undefined ? { refreshExpiresAtMs } : {}),
  };
};

const readJsonSafely = async (response: Response): Promise<unknown> => {
  try {
    const text = await response.text();
    return text.trim() ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
};

const isAbortLike = (error: unknown): boolean =>
  isRecord(error) && (error as { name?: unknown }).name === "AbortError";

/**
 * Classify a thrown refresh failure.
 *
 * An abort caused by the caller's own signal is re-thrown rather than
 * classified: the caller cancelled on purpose (navigation, account switch) and
 * must not have that turned into a session verdict.
 */
export const classifyRefreshThrow = (
  error: unknown,
  externalSignal?: AbortSignal | null,
): RefreshOutcome => {
  if (isAbortLike(error)) {
    if (externalSignal?.aborted) throw error;
    return { kind: "transient", reason: "timeout" };
  }
  if (error instanceof TypeError) return { kind: "transient", reason: "network" };
  return { kind: "transient", reason: "unknown" };
};

/**
 * Retry delay with ±25% jitter. The attempt index is intentionally unused: the
 * budget only allows one retry, and exponential growth would push it outside
 * the backend grace window.
 */
export const refreshBackoffMs = (attempt: number, random: () => number = Math.random): number =>
  Math.round(REFRESH_RETRY_BACKOFF_MS * (0.75 + random() * 0.5));

/** Parse a Retry-After header expressed in seconds, clamped to [0, 5000] ms. */
export const retryAfterMs = (header: string | null): number | null => {
  const raw = header?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Math.round(seconds * 1000)));
};
