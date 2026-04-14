import { maskApiKey } from "../format";

const USAGE_SOURCE_PREFIX_KEY = "k:";
const USAGE_SOURCE_PREFIX_MASKED = "m:";
const USAGE_SOURCE_PREFIX_TEXT = "t:";

const KEY_LIKE_TOKEN_REGEX =
  /(sk-[A-Za-z0-9-_]{6,}|sk-ant-[A-Za-z0-9-_]{6,}|AIza[0-9A-Za-z-_]{8,}|AI[a-zA-Z0-9_-]{6,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/;
const MASKED_TOKEN_HINT_REGEX = /^[^\s]{1,24}(\*{2,}|\.{3}|…)[^\s]{1,24}$/;

const keyFingerprintCache = new Map<string, string>();

const fnv1a64Hex = (value: string): string => {
  const cached = keyFingerprintCache.get(value);
  if (cached) return cached;

  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }

  const hex = hash.toString(16).padStart(16, "0");
  keyFingerprintCache.set(value, hex);
  return hex;
};

const looksLikeRawSecret = (text: string): boolean => {
  if (!text || /\s/.test(text)) return false;

  const lower = text.toLowerCase();
  if (lower.endsWith(".json")) return false;
  if (lower.startsWith("http://") || lower.startsWith("https://")) return false;
  if (/[\\/]/.test(text)) return false;

  if (KEY_LIKE_TOKEN_REGEX.test(text)) return true;
  if (text.length >= 32 && text.length <= 512) return true;

  if (text.length >= 16 && text.length < 32 && /^[A-Za-z0-9._=-]+$/.test(text)) {
    return /[A-Za-z]/.test(text) && /\d/.test(text);
  }

  return false;
};

const extractRawSecretFromText = (text: string): string | null => {
  if (!text) return null;
  if (looksLikeRawSecret(text)) return text;

  const keyLikeMatch = text.match(KEY_LIKE_TOKEN_REGEX);
  if (keyLikeMatch?.[0]) return keyLikeMatch[0];

  const queryMatch = text.match(
    /(?:[?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/i,
  );
  const queryValue = queryMatch?.[2];
  if (queryValue && looksLikeRawSecret(queryValue)) {
    return queryValue;
  }

  const headerMatch = text.match(
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*[:=]\s*([A-Za-z0-9._=-]+)/i,
  );
  const headerValue = headerMatch?.[2];
  if (headerValue && looksLikeRawSecret(headerValue)) {
    return headerValue;
  }

  const bearerMatch = text.match(/\bBearer\s+([A-Za-z0-9._=-]{6,})/i);
  const bearerValue = bearerMatch?.[1];
  if (bearerValue && looksLikeRawSecret(bearerValue)) {
    return bearerValue;
  }

  return null;
};

export function normalizeUsageSourceId(
  value: unknown,
  masker: (val: string) => string = maskApiKey,
): string {
  const raw =
    typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const extracted = extractRawSecretFromText(trimmed);
  if (extracted) {
    return `${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(extracted)}`;
  }

  if (MASKED_TOKEN_HINT_REGEX.test(trimmed)) {
    return `${USAGE_SOURCE_PREFIX_MASKED}${masker(trimmed)}`;
  }

  return `${USAGE_SOURCE_PREFIX_TEXT}${trimmed}`;
}

export function buildCandidateUsageSourceIds(input: {
  apiKey?: string;
  prefix?: string;
}): string[] {
  const result: string[] = [];

  const prefix = input.prefix?.trim();
  if (prefix) {
    result.push(`${USAGE_SOURCE_PREFIX_TEXT}${prefix}`);
  }

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    result.push(`${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(apiKey)}`);
    result.push(`${USAGE_SOURCE_PREFIX_MASKED}${maskApiKey(apiKey)}`);
  }

  return Array.from(new Set(result));
}

export function maskUsageSensitiveValue(
  value: unknown,
  masker: (val: string) => string = maskApiKey,
): string {
  if (value === null || value === undefined) return "";

  const raw = typeof value === "string" ? value : String(value);
  if (!raw) return "";

  let masked = raw;

  const queryRegex = /([?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/gi;
  masked = masked.replace(
    queryRegex,
    (_full, prefix, keyName, valuePart) => `${prefix}${keyName}=${masker(valuePart)}`,
  );

  const headerRegex =
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*([:=])\s*([A-Za-z0-9._-]+)/gi;
  masked = masked.replace(
    headerRegex,
    (_full, keyName, separator, valuePart) => `${keyName}${separator}${masker(valuePart)}`,
  );

  const keyLikeRegex =
    /(sk-[A-Za-z0-9]{6,}|AI[a-zA-Z0-9_-]{6,}|AIza[0-9A-Za-z-_]{8,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/g;
  masked = masked.replace(keyLikeRegex, (match) => masker(match));

  if (masked === raw) {
    const trimmed = raw.trim();
    if (trimmed && !/\s/.test(trimmed)) {
      const looksLikeKey =
        /^sk-/i.test(trimmed) ||
        /^AI/i.test(trimmed) ||
        /^AIza/i.test(trimmed) ||
        /^hf_/i.test(trimmed) ||
        /^pk_/i.test(trimmed) ||
        /^rk_/i.test(trimmed) ||
        (!/[\\/]/.test(trimmed) && (/\d/.test(trimmed) || trimmed.length >= 10)) ||
        trimmed.length >= 24;
      if (looksLikeKey) {
        return masker(trimmed);
      }
    }
  }

  return masked;
}
