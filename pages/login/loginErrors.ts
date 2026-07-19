import type { TFunction } from "i18next";

export type LoginErrorInput = {
  t: TFunction;
  code?: string;
  status?: number;
  isTimeout?: boolean;
  /** Raw API/network message used only as last-resort fallback. */
  fallbackMessage?: string;
};

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
}: LoginErrorInput): string {
  const normalized = code.trim().toLowerCase();

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
      return t("login.error_rate_limited");
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
    return t("login.error_rate_limited");
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
