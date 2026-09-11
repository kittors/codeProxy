import type { TFunction } from "i18next";
import { isPasswordPolicyCode } from "@code-proxy/domain";
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
   * `retry_after_seconds` for cooldowns, which is what turns "try again later"
   * into an answerable wait.
   */
  details?: Record<string, unknown>;
};

/**
 * Copy for a throttled or cooled-down sign-in.
 *
 * The server reports how long the lock still has to run, so say it. Without the
 * duration a five-minute account cooldown is indistinguishable from a
 * one-minute or a one-hour one, and users retry into the next rung of the
 * lockout ladder rather than waiting it out.
 */
function rateLimitedMessage(t: TFunction, details: Record<string, unknown>): string {
  const raw = details.retry_after_seconds;
  const seconds = typeof raw === "number" ? Math.ceil(raw) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return t("login.error_rate_limited");
  }
  if (seconds < 60) {
    return t("login.error_rate_limited_seconds", { seconds });
  }
  return t("login.error_rate_limited_minutes", { minutes: Math.ceil(seconds / 60) });
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
    case "invalid_credentials":
      return t("login.error_invalid_credentials");
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
