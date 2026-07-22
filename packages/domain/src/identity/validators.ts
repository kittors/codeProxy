/** Identity field validators aligned with CliRelay internal/identity. */

export type IdentityValidationResult =
  | { ok: true }
  | { ok: false; code: IdentityValidationCode };

export type IdentityValidationCode =
  | "username_required"
  | "username_invalid_charset"
  | "username_too_long"
  | "display_name_required"
  | "display_name_too_long"
  | "password_too_short"
  | "password_missing_upper"
  | "password_missing_lower"
  | "password_missing_special";

export const IDENTITY_USERNAME_MAX_BYTES = 128;
export const IDENTITY_DISPLAY_NAME_MAX_BYTES = 128;
export const IDENTITY_PASSWORD_MIN_LENGTH = 12;

const textEncoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

/** Aligns with Go NormalizeUsername: trim + lower. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Aligns with Go validIdentifier(value, 128, allowAt=true):
 * a-z A-Z 0-9 . _ - and optional @.
 */
export function isValidUsernameCharset(value: string): boolean {
  if (!value) return false;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const isAlpha =
      (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
    const isDigit = code >= 48 && code <= 57;
    if (isAlpha || isDigit || ch === "." || ch === "_" || ch === "-" || ch === "@") {
      continue;
    }
    return false;
  }
  return true;
}

export function validateUsername(raw: string): IdentityValidationResult {
  const normalized = normalizeUsername(raw);
  if (!normalized) return { ok: false, code: "username_required" };
  if (utf8ByteLength(normalized) > IDENTITY_USERNAME_MAX_BYTES) {
    return { ok: false, code: "username_too_long" };
  }
  if (!isValidUsernameCharset(normalized)) {
    return { ok: false, code: "username_invalid_charset" };
  }
  return { ok: true };
}

export function validateDisplayName(raw: string): IdentityValidationResult {
  const value = raw.trim();
  if (!value) return { ok: false, code: "display_name_required" };
  if (utf8ByteLength(value) > IDENTITY_DISPLAY_NAME_MAX_BYTES) {
    return { ok: false, code: "display_name_too_long" };
  }
  return { ok: true };
}

/**
 * Aligns with CliRelay HashPassword after 077:
 * len >= 12, at least one upper, one lower, one non-alphanumeric.
 * Special = any byte that is not [A-Za-z0-9] (same as Go switch default).
 */
export function validatePassword(password: string): IdentityValidationResult {
  if (password.length < IDENTITY_PASSWORD_MIN_LENGTH) {
    return { ok: false, code: "password_too_short" };
  }
  let hasUpper = false;
  let hasLower = false;
  let hasSpecial = false;
  for (const ch of password) {
    if (ch >= "A" && ch <= "Z") hasUpper = true;
    else if (ch >= "a" && ch <= "z") hasLower = true;
    else if (ch >= "0" && ch <= "9") {
      /* digit ok */
    } else hasSpecial = true;
  }
  if (!hasUpper) return { ok: false, code: "password_missing_upper" };
  if (!hasLower) return { ok: false, code: "password_missing_lower" };
  if (!hasSpecial) return { ok: false, code: "password_missing_special" };
  return { ok: true };
}
