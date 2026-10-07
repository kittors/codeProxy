/** Shared pure helpers for tenant create / renew forms. */
import { rules, type Rule } from "@code-proxy/ui";

/** Matches CliRelay identity service name limit (Go len(name) <= 128, UTF-8 bytes). */
export const TENANT_NAME_MAX_LENGTH = 128;
/** CliRelay rejects tenant descriptions over 1000 bytes (Go len on the trimmed value). */
export const TENANT_DESCRIPTION_MAX_BYTES = 1000;

/** Bounds enforced by CliRelay UpdateTenantDetails (seconds). */
export const ACCESS_TOKEN_TTL_RANGE = { min: 60, max: 30 * 24 * 3600 } as const;
export const REFRESH_TOKEN_TTL_RANGE = { min: 300, max: 365 * 24 * 3600 } as const;
/** Server defaults when a tenant has never set its own TTLs. */
export const DEFAULT_ACCESS_TOKEN_TTL = 43200;
export const DEFAULT_REFRESH_TOKEN_TTL = 2592000;

const utf8Length = (value: string) => new TextEncoder().encode(value.trim()).length;

export const isTenantNameTooLong = (name: string): boolean =>
  utf8Length(name) > TENANT_NAME_MAX_LENGTH;

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

/** 日期时间要能解析；是否必须晚于现在由调用方决定（新建要求，续期允许提前结束）。 */
export const dateTimeRule: Rule<string> = rules.custom<string>(
  (value) => !value.trim() || toIsoDateTime(value) !== null || "datetime",
);
export const futureDateTimeRule: Rule<string> = rules.custom<string>((value) => {
  const iso = toIsoDateTime(value);
  return !iso || new Date(iso).getTime() > Date.now() || "datetime_future";
});

const DURATION_UNITS = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
] as const;

/**
 * 把秒数换算成人能读的时长（最多两个单位，例如「1 天 6 小时」），用于 TTL 输入框下的实时提示。
 * `exact` 为 false 表示后面还有被省略的零头，调用方可以加「约」。
 */
export function describeDuration(
  totalSeconds: number,
  locale: string,
): { text: string; exact: boolean } {
  const format = (unit: string, amount: number) =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(amount);
  let remaining = Math.max(0, Math.floor(totalSeconds));
  const parts: string[] = [];
  for (const [unit, size] of DURATION_UNITS) {
    if (parts.length === 2) break;
    const amount = Math.floor(remaining / size);
    if (amount === 0) continue;
    parts.push(format(unit, amount));
    remaining -= amount * size;
  }
  if (parts.length === 0) return { text: format("second", 0), exact: true };
  return { text: parts.join(" "), exact: remaining === 0 };
}

/** 续期快捷选项：从「当前到期时间和现在中较晚的一个」往后加 N 个月。 */
export function extendExpiry(currentIso: string | null, months: number, now = new Date()): string {
  const current = currentIso ? new Date(currentIso) : null;
  const base =
    current && !Number.isNaN(current.getTime()) && current.getTime() > now.getTime()
      ? current
      : now;
  const next = new Date(base.getTime());
  // 月末不溢出：1 月 31 日加一个月是 2 月的最后一天，而不是 3 月初。
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return toLocalDateTimeInput(next.toISOString());
}
