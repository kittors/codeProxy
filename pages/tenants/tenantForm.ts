/** Shared pure helpers for tenant create / renew forms. */

/** Matches CliRelay identity service name limit (Go len(name) <= 128, UTF-8 bytes). */
export const TENANT_NAME_MAX_LENGTH = 128;

export const isTenantNameTooLong = (name: string): boolean =>
  new TextEncoder().encode(name.trim()).length > TENANT_NAME_MAX_LENGTH;

export const toLocalDateTimeInput = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

/**
 * Parse a local datetime-picker value (`YYYY-MM-DDTHH:mm` or equivalent) into ISO.
 * Returns null when empty or not a real date — never throws `RangeError: Invalid time value`.
 */
export const toIsoDateTime = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
