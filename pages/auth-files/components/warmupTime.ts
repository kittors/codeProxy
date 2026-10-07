const pad = (value: number) => String(value).padStart(2, "0");

/**
 * 服务器返回的 ISO 时间 → `<input type="datetime-local">` 的值（本地时间、到分钟）。
 *
 * 不能用 `toISOString().slice(0, 16)`：那是 UTC 时间，填进本地时间输入框后，
 * 保存时 `new Date(value)` 又按本地时间解析，东八区每保存一次就往前挪 8 小时。
 */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 输入框里的本地时间 → ISO（UTC）；空值或无法解析时返回空串。 */
export function fromLocalInputValue(value: string): string {
  if (!value.trim()) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
