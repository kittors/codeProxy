export type KeyStatBucket = { success: number; failure: number };

export type StatusBlockState = "idle" | "success" | "failure" | "mixed";

export type StatusBarData = {
  blocks: StatusBlockState[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
};

const USAGE_SOURCE_PREFIX_KEY = "k:";
const USAGE_SOURCE_PREFIX_MASKED = "m:";
const USAGE_SOURCE_PREFIX_TEXT = "t:";

const KNOWN_PREFIXES = [
  USAGE_SOURCE_PREFIX_KEY,
  USAGE_SOURCE_PREFIX_MASKED,
  USAGE_SOURCE_PREFIX_TEXT,
] as const;

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

export function normalizeUsageSourceId(value: unknown, masker: (val: string) => string): string {
  const raw =
    typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (KNOWN_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return trimmed;
  }

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
  masker: (val: string) => string;
}): string[] {
  const result: string[] = [];
  const prefix = input.prefix?.trim();
  if (prefix) {
    result.push(`${USAGE_SOURCE_PREFIX_TEXT}${prefix}`);
  }

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    result.push(`${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(apiKey)}`);
    result.push(`${USAGE_SOURCE_PREFIX_MASKED}${input.masker(apiKey)}`);
  }

  return Array.from(new Set(result));
}

export function calculateStatusBarData(
  usageDetails: Array<{ timestamp: string; failed: boolean }>,
): StatusBarData {
  const BLOCK_COUNT = 20;
  const BLOCK_DURATION_MS = 10 * 60 * 1000;
  const WINDOW_MS = 200 * 60 * 1000;

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: BLOCK_COUNT },
    () => ({ success: 0, failure: 0 }),
  );

  let totalSuccess = 0;
  let totalFailure = 0;

  usageDetails.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp) || timestamp < windowStart || timestamp > now) return;

    const ageMs = now - timestamp;
    const blockIndex = BLOCK_COUNT - 1 - Math.floor(ageMs / BLOCK_DURATION_MS);

    if (blockIndex < 0 || blockIndex >= BLOCK_COUNT) return;

    if (detail.failed) {
      blockStats[blockIndex].failure += 1;
      totalFailure += 1;
    } else {
      blockStats[blockIndex].success += 1;
      totalSuccess += 1;
    }
  });

  const blocks: StatusBlockState[] = blockStats.map((stat) => {
    if (stat.success === 0 && stat.failure === 0) return "idle";
    if (stat.failure === 0) return "success";
    if (stat.success === 0) return "failure";
    return "mixed";
  });

  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks,
    successRate,
    totalSuccess,
    totalFailure,
  };
}

export function mergeKeyStatBuckets(a: KeyStatBucket, b: KeyStatBucket): KeyStatBucket {
  return { success: a.success + b.success, failure: a.failure + b.failure };
}
