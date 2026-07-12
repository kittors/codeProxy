/** Shared pure helpers for tenant create / renew forms. */

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
