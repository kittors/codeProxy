export const MAX_FILENAME_PART_LENGTH = 72;
export const ACTION_MENU_CONTENT_CLASS =
  "z-[220] min-w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/35";
export const ACTION_MENU_ITEM_CLASS =
  "flex w-full cursor-default select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition-colors focus:bg-slate-100 data-[highlighted]:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 dark:text-white/75 dark:focus:bg-white/10 dark:data-[highlighted]:bg-white/10";

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
