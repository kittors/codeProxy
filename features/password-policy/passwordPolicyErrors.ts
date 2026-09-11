import { extractApiErrorCode, isApiClientError } from "@code-proxy/api-client";
import {
  isPasswordPolicyCode,
  validatePassword,
  type IdentityValidationCode,
} from "@code-proxy/domain";

/**
 * The narrowest shape these helpers need from i18next. Declaring it structurally
 * lets presentational components that receive `t` as a plain prop use them too,
 * without threading the full TFunction type through their signatures.
 */
export type PasswordPolicyTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * Localized copy for one password rule.
 *
 * Falls back to the combined requirement sentence rather than echoing the key,
 * so a code the panel has not translated yet still reads as guidance instead of
 * as `identity_admin.password_missing_upper`.
 */
export function passwordPolicyMessage(code: IdentityValidationCode, t: PasswordPolicyTranslate): string {
  const key = `identity_admin.${code}`;
  const message = t(key);
  return message === key ? t("identity_admin.password_requirement") : message;
}

/**
 * Field-level error for a password the user typed, or "" when it passes.
 *
 * Every password field in the panel goes through this, because a form that
 * checks only the length hands the remaining rules to the server — and the
 * server can only answer in English.
 */
export function validatePasswordField(password: string, t: PasswordPolicyTranslate): string {
  const result = validatePassword(password);
  return result.ok ? "" : passwordPolicyMessage(result.code, t);
}

/**
 * Localized copy for a password rejection that came back from the server, or
 * null when the failure was something else.
 *
 * Client-side validation is a convenience, never the authority: the two can
 * drift, and older panels talk to newer servers. Recognising the server's
 * per-rule code here is what keeps the last line of defence from surfacing as
 * a raw English toast.
 */
export function resolvePasswordApiError(error: unknown, t: PasswordPolicyTranslate): string | null {
  if (!isApiClientError(error)) return null;
  const code = extractApiErrorCode(error.payload).trim().toLowerCase();
  if (!isPasswordPolicyCode(code)) return null;
  return passwordPolicyMessage(code, t);
}
