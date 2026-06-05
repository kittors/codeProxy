export function maskApiKey(key: string): string {
  const trimmed = String(key || "").trim();
  if (!trimmed) return "";
  const MASKED_LENGTH = 10;
  const visibleChars = trimmed.length < 4 ? 1 : 2;
  const start = trimmed.slice(0, visibleChars);
  const end = trimmed.slice(-visibleChars);
  const maskedLength = Math.max(MASKED_LENGTH - visibleChars * 2, 1);
  return `${start}${"*".repeat(maskedLength)}${end}`;
}
