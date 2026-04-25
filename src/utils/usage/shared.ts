export interface KeyStatBucket {
  success: number;
  failure: number;
}

export interface KeyStats {
  bySource: Record<string, KeyStatBucket>;
  byAuthIndex: Record<string, KeyStatBucket>;
}

export interface TokenBreakdown {
  cachedTokens: number;
  reasoningTokens: number;
}

export interface RateStats {
  rpm: number;
  tpm: number;
  windowMinutes: number;
  requestCount: number;
  tokenCount: number;
}

export type ModelBillingMode = "token" | "call";

export interface ModelPrice {
  mode?: ModelBillingMode;
  prompt: number;
  completion: number;
  cache: number;
  perCall?: number;
}

export interface UsageDetail {
  timestamp: string;
  source: string;
  auth_index: number;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    cache_tokens?: number;
    total_tokens: number;
  };
  failed: boolean;
  __modelName?: string;
}

export interface ApiStats {
  endpoint: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  totalCost: number;
  models: Record<
    string,
    { requests: number; successCount: number; failureCount: number; tokens: number }
  >;
}

export type UsageTimeRange = "7h" | "24h" | "7d" | "all";

export const TOKENS_PER_PRICE_UNIT = 1_000_000;
export const MODEL_PRICE_STORAGE_KEY = "cli-proxy-model-prices-v2";
export const USAGE_TIME_RANGE_MS: Record<Exclude<UsageTimeRange, "all">, number> = {
  "7h": 7 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const getApisRecord = (usageData: unknown): Record<string, unknown> | null => {
  const usageRecord = isRecord(usageData) ? usageData : null;
  const apisRaw = usageRecord ? usageRecord.apis : null;
  return isRecord(apisRaw) ? apisRaw : null;
};

export const normalizeAuthIndex = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};
