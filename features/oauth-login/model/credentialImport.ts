import type { CredentialImportKind } from "@code-proxy/api-client";
import type { AccountMethod, AccountProviderId } from "./catalog";

/**
 * Credential imports: turning a credential the operator already holds into an
 * account, the same one a browser login would have produced.
 *
 * The panel lets operators paste in bulk — a whole `auth.json`, a cookie
 * header, or one credential per line — so the extraction below pulls the actual
 * credential out of each shape and de-duplicates, rather than making them clean
 * the text up by hand first. Every value is still checked by the server; the
 * local classification only stops obviously-empty rows and flags a value that
 * looks pasted into the wrong field.
 */

export interface CredentialImportSpec {
  kind: CredentialImportKind;
  providerId: AccountProviderId;
  method: AccountMethod;
  /** Grok bills api.x.ai credit vs. the Grok Build plan; shows the toggle. */
  usingApiToggle: boolean;
  /** Leaf keys to collect when the paste is JSON (auth.json, exported config). */
  jsonKeys: readonly string[];
  /** Cookie / env names to read when a line is `name=value; …`. */
  pairKeys: readonly string[];
  /** i18n suffix under add_account.credential.<copyKey>. */
  copyKey: string;
}

const SPECS: readonly CredentialImportSpec[] = [
  {
    kind: "anthropic-session",
    providerId: "anthropic",
    method: "session",
    usingApiToggle: false,
    jsonKeys: ["sessionKey", "session_key"],
    pairKeys: ["sessionKey"],
    copyKey: "anthropic_session",
  },
  {
    kind: "codex-refresh-token",
    providerId: "codex",
    method: "refresh-token",
    usingApiToggle: false,
    jsonKeys: ["refresh_token", "refreshToken"],
    pairKeys: ["refresh_token", "OPENAI_API_REFRESH_TOKEN", "refreshToken"],
    copyKey: "codex_refresh",
  },
  {
    kind: "antigravity-refresh-token",
    providerId: "antigravity",
    method: "refresh-token",
    usingApiToggle: false,
    jsonKeys: ["refresh_token", "refreshToken"],
    pairKeys: ["refresh_token", "refreshToken"],
    copyKey: "antigravity_refresh",
  },
  {
    kind: "xai-sso",
    providerId: "xai",
    method: "sso-cookie",
    usingApiToggle: true,
    jsonKeys: ["sso", "sso-rw", "ssoToken"],
    pairKeys: ["sso", "sso-rw"],
    copyKey: "xai_sso",
  },
];

/** The import spec for a provider+method, or null if that pair has none. */
export function findCredentialImportSpec(
  providerId: AccountProviderId,
  method: AccountMethod,
): CredentialImportSpec | null {
  return SPECS.find((spec) => spec.providerId === providerId && spec.method === method) ?? null;
}

/** True for a method that is a credential import (vs. oauth / vertex / file). */
export const isCredentialImportMethod = (method: AccountMethod): boolean =>
  method === "session" || method === "refresh-token" || method === "sso-cookie";

export type CredentialQuality = "ok" | "suspect" | "empty";

/**
 * How a single extracted credential looks locally. "suspect" means it still
 * carries cookie/whitespace punctuation (extraction probably missed the field)
 * or is too short to be real — worth a warning, but the server has the last
 * word, so the panel still lets it through.
 */
export function classifyCredential(spec: CredentialImportSpec, value: string): CredentialQuality {
  const trimmed = value.trim();
  if (trimmed === "") return "empty";
  if (/[\s;]/.test(trimmed)) return "suspect";
  if (spec.kind === "anthropic-session") {
    return trimmed.startsWith("sk-ant-") ? "ok" : "suspect";
  }
  return trimmed.length >= 16 ? "ok" : "suspect";
}

const stripWrapping = (value: string): string => value.trim().replace(/^["']|["']$/g, "").trim();

/** Reads `k=v; k2=v2` pairs; later keys do not override earlier ones. */
function parsePairs(line: string): Map<string, string> {
  const pairs = new Map<string, string>();
  const body = line.replace(/^cookie:\s*/i, "");
  for (const part of body.split(/[;\n]/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    if (name && !pairs.has(name)) pairs.set(name, stripWrapping(raw));
  }
  return pairs;
}

const lowerKeySet = (keys: readonly string[]): Set<string> =>
  new Set(keys.map((key) => key.toLowerCase()));

/** Collects string values under any leaf key in `keys`, walking the whole tree. */
function collectFromJson(value: unknown, keys: Set<string>, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFromJson(item, keys, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === "string" && keys.has(key.toLowerCase())) {
      const cleaned = stripWrapping(child);
      if (cleaned) out.push(cleaned);
    } else if (child && typeof child === "object") {
      collectFromJson(child, keys, out);
    }
  }
}

function extractFromLine(spec: CredentialImportSpec, line: string): string {
  const cleaned = stripWrapping(line);
  if (cleaned === "") return "";
  if (/[=;]/.test(cleaned)) {
    const pairs = parsePairs(cleaned);
    for (const key of spec.pairKeys) {
      const found = pairs.get(key);
      if (found) return found;
    }
    // A bare `k=v` env line whose name was not one we know: fall through and
    // treat the value after the first '=' only when there is no ';' (not a
    // cookie string, which we could not map and must not guess at).
    if (!cleaned.includes(";") && spec.pairKeys.length > 0) {
      const eq = cleaned.indexOf("=");
      const name = cleaned.slice(0, eq).trim().toLowerCase();
      if (lowerKeySet(spec.pairKeys).has(name)) return stripWrapping(cleaned.slice(eq + 1));
    }
    // Could not map a cookie/env line to a known field — skip it rather than
    // import a wrong substring.
    if (cleaned.includes(";")) return "";
  }
  return cleaned;
}

/**
 * Pulls every credential out of a bulk paste and de-duplicates, preserving the
 * order they first appear. Handles a JSON blob (auth.json / exported config), a
 * cookie header, and one-credential-per-line text.
 */
export function extractCredentials(spec: CredentialImportSpec, raw: string): string[] {
  const input = raw.trim();
  if (input === "") return [];
  const found: string[] = [];

  const asJson = tryParseJson(input);
  if (asJson !== undefined) {
    collectFromJson(asJson, lowerKeySet(spec.jsonKeys), found);
  }
  if (found.length === 0) {
    for (const line of input.split(/\r?\n/)) {
      const value = extractFromLine(spec, line);
      if (value) found.push(value);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of found) {
    const cleaned = value.trim();
    if (cleaned === "" || seen.has(cleaned)) continue;
    seen.add(cleaned);
    unique.push(cleaned);
  }
  return unique;
}

function tryParseJson(input: string): unknown {
  if (!input.startsWith("{") && !input.startsWith("[")) return undefined;
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}
