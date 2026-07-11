export const MAX_FILENAME_PART_LENGTH = 72;
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const sanitizeFilenamePart = (value: unknown): string => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text.slice(0, MAX_FILENAME_PART_LENGTH).replace(/^-+|-+$/g, "");
};

export const sanitizeCodexFilenamePart = (value: unknown): string =>
  Array.from(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  )
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || char === "/" || char === "\\" ? "-" : char;
    })
    .join("")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FILENAME_PART_LENGTH)
    .replace(/^-+|-+$/g, "");

export const readStringField = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

export const readNestedStringField = (
  records: readonly (Record<string, unknown> | undefined)[],
  keys: string[],
): string => {
  for (const record of records) {
    if (!record) continue;
    const value = readStringField(record, keys);
    if (value) return value;
  }
  return "";
};

export const normalizeDedupKeyPart = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const codexFilenamePlanSuffixes = new Set([
  "plus",
  "pro",
  "free",
  "team",
  "premium",
  "business",
  "enterprise",
]);

export const parseCodexFilenameIdentity = (
  fileName: string,
): { accountId?: string; email?: string } => {
  const normalized = String(fileName ?? "")
    .trim()
    .toLowerCase();
  const base = normalized.replace(/\.json$/u, "");
  if (!base.startsWith("codex-")) return {};
  const rest = base.slice("codex-".length);
  if (!rest) return {};
  const parts = rest.split("-").filter(Boolean);
  if (parts.length === 0) return {};

  const emailIndex = parts.findIndex((part) => part.includes("@"));
  if (emailIndex >= 0) {
    return { email: parts.slice(emailIndex).join("-") };
  }

  const lastPart = parts[parts.length - 1] ?? "";
  if (codexFilenamePlanSuffixes.has(lastPart) && parts.length > 1) {
    return { accountId: parts.slice(0, -1).join("-") };
  }

  return { accountId: rest };
};
