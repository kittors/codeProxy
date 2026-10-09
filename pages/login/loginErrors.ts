import type { TFunction } from "i18next";
import {
  extractApiErrorCode,
  extractApiErrorDetails,
  isApiClientError,
} from "@code-proxy/api-client";
import { isPasswordPolicyCode } from "@code-proxy/domain";
import { normalizeLoginUsername, type LoginFailure } from "@features/login-lock";
import { passwordPolicyMessage } from "@features/password-policy";

export type LoginErrorInput = {
  t: TFunction;
  code?: string;
  status?: number;
  isTimeout?: boolean;
  /** Raw API/network message used only as last-resort fallback. */
  fallbackMessage?: string;
  /**
   * Structured `error.details` from the API envelope. Carries
   * `retry_after_seconds` for locks, which is what turns "try again later" into
   * an answerable wait, and `remaining_attempts` for wrong passwords, which is
   * what warns before the lock instead of after it.
   */
  details?: Record<string, unknown>;
};

/** Codes the server uses for a sign-in that a lock is holding shut. */
const LOCK_CODES = new Set(["login_rate_limited", "login_cooldown"]);

/** A positive whole number from an untrusted details field, or 0. */
function positiveCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

/**
 * Copy for a throttled or cooled-down sign-in.
 *
 * The server reports how long the lock still has to run, so say it. Without the
 * duration a five-minute account cooldown is indistinguishable from a
 * one-minute or a one-hour one, and users retry into the next rung of the
 * lockout ladder rather than waiting it out.
 */
function rateLimitedMessage(t: TFunction, details: Record<string, unknown>): string {
  const seconds = positiveCount(details.retry_after_seconds);
  if (seconds <= 0) {
    return t("login.error_rate_limited");
  }
  // `count` drives the plural form ("1 minute" / "2 minutes"); the named value
  // stays for locales whose copy is plural-free.
  if (seconds < 60) {
    return t("login.error_rate_limited_seconds", { count: seconds, seconds });
  }
  const minutes = Math.ceil(seconds / 60);
  return t("login.error_rate_limited_minutes", { count: minutes, minutes });
}

/**
 * Map login API failures to localized toast copy.
 * Prefer error codes from the identity service; fall back to HTTP status.
 */
export function resolveLoginErrorMessage({
  t,
  code = "",
  status = 0,
  isTimeout = false,
  fallbackMessage = "",
  details = {},
}: LoginErrorInput): string {
  const normalized = code.trim().toLowerCase();

  // The same resolver serves the portal's change-password dialog, where the
  // server can reject on a password rule. Those codes must translate here too,
  // or they fall through to the generic 400 handling below and surface as raw
  // English.
  if (isPasswordPolicyCode(normalized)) {
    return passwordPolicyMessage(normalized, t);
  }

  switch (normalized) {
    case "invalid_credentials": {
      const remaining = positiveCount(details.remaining_attempts);
      return remaining > 0
        ? t("login.error_invalid_credentials_remaining", { count: remaining })
        : t("login.error_invalid_credentials");
    }
    case "account_disabled":
    case "account_locked":
      return t("login.account_unavailable");
    case "tenant_expired":
      return t("login.tenant_expired");
    case "tenant_suspended":
      return t("login.tenant_suspended");
    case "login_rate_limited":
    case "login_cooldown":
      return rateLimitedMessage(t, details);
    case "identity_unavailable":
    case "internal_error":
      return t("login.error_server");
    case "validation_failed":
      return t("login.error_required");
    default:
      break;
  }

  if (isTimeout) {
    return t("login.error_timeout");
  }

  if (status === 401 || status === 403) {
    return t("login.error_invalid_credentials");
  }
  if (status === 429) {
    return rateLimitedMessage(t, details);
  }
  if (status === 404) {
    return t("login.error_not_found");
  }
  if (status >= 500) {
    return t("login.error_server");
  }
  if (status === 0) {
    // Network / CORS / offline — no HTTP status available.
    return t("login.error_network");
  }

  const trimmed = fallbackMessage.trim();
  if (trimmed) return trimmed;
  return t("login.error_invalid");
}

/**
 * Turn a failed sign-in into what both sign-in forms need: the copy, and — when
 * the server reported them — how long the lock lasts and how many attempts are
 * left before it.
 *
 * `username` is the account that was tried. Locks and attempt counts belong to
 * that account, so a form can drop them as soon as the user types another one.
 */
export function describeLoginFailure(
  t: TFunction,
  error: unknown,
  { username, now = Date.now() }: { username?: string; now?: number } = {},
): LoginFailure {
  const apiError = isApiClientError(error) ? error : null;
  const code = apiError ? extractApiErrorCode(apiError.payload) : "";
  const status = apiError?.status ?? 0;
  const details = apiError ? extractApiErrorDetails(apiError.payload) : {};
  const failure: LoginFailure = {
    message: resolveLoginErrorMessage({
      t,
      code,
      status,
      isTimeout: apiError?.isTimeout ?? false,
      fallbackMessage: error instanceof Error ? error.message : "",
      details,
    }),
  };
  if (username !== undefined) {
    failure.username = normalizeLoginUsername(username);
  }

  const normalized = code.trim().toLowerCase();
  const lockSeconds = positiveCount(details.retry_after_seconds);
  if (lockSeconds > 0 && (LOCK_CODES.has(normalized) || (!normalized && status === 429))) {
    failure.lockedUntil = now + lockSeconds * 1000;
  }
  const remaining = positiveCount(details.remaining_attempts);
  if (remaining > 0 && normalized === "invalid_credentials") {
    failure.remainingAttempts = remaining;
  }
  return failure;
}
