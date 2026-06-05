import {
  getApisRecord,
  isRecord,
  USAGE_TIME_RANGE_MS,
  type RateStats,
  type TokenBreakdown,
  type UsageDetail,
  type UsageTimeRange,
} from "./shared";
import { normalizeUsageSourceId } from "./sanitize";

interface UsageSummary {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
}

const createUsageSummary = (): UsageSummary => ({
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  totalTokens: 0,
});

const toUsageSummaryFields = (summary: UsageSummary) => ({
  total_requests: summary.totalRequests,
  success_count: summary.successCount,
  failure_count: summary.failureCount,
  total_tokens: summary.totalTokens,
});

const isDetailWithinWindow = (
  detail: unknown,
  windowStart: number,
  nowMs: number,
): detail is Record<string, unknown> => {
  if (!isRecord(detail) || typeof detail.timestamp !== "string") return false;
  const timestamp = Date.parse(detail.timestamp);
  return !Number.isNaN(timestamp) && timestamp >= windowStart && timestamp <= nowMs;
};

const updateSummaryFromDetails = (summary: UsageSummary, details: unknown[]) => {
  details.forEach((detail) => {
    const detailRecord = isRecord(detail) ? detail : null;
    if (!detailRecord) return;

    summary.totalRequests += 1;
    if (detailRecord.failed === true) summary.failureCount += 1;
    else summary.successCount += 1;
    summary.totalTokens += extractTotalTokens(detailRecord);
  });
};

export function filterUsageByTimeRange<T>(
  usageData: T,
  range: UsageTimeRange,
  nowMs: number = Date.now(),
): T {
  if (range === "all") return usageData;

  const usageRecord = isRecord(usageData) ? usageData : null;
  const apis = getApisRecord(usageData);
  if (!usageRecord || !apis) return usageData;

  const rangeMs = USAGE_TIME_RANGE_MS[range];
  if (!Number.isFinite(rangeMs) || rangeMs <= 0) return usageData;

  const windowStart = nowMs - rangeMs;
  const filteredApis: Record<string, unknown> = {};
  const totalSummary = createUsageSummary();

  Object.entries(apis).forEach(([apiName, apiEntry]) => {
    if (!isRecord(apiEntry)) return;
    const models = isRecord(apiEntry.models) ? apiEntry.models : null;
    if (!models) return;

    const filteredModels: Record<string, unknown> = {};
    const apiSummary = createUsageSummary();

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) return;
      const detailsRaw = Array.isArray(modelEntry.details) ? modelEntry.details : [];
      const filteredDetails = detailsRaw.filter((detail) =>
        isDetailWithinWindow(detail, windowStart, nowMs),
      );
      if (!filteredDetails.length) return;

      const modelSummary = createUsageSummary();
      updateSummaryFromDetails(modelSummary, filteredDetails);

      filteredModels[modelName] = {
        ...modelEntry,
        ...toUsageSummaryFields(modelSummary),
        details: filteredDetails,
      };

      apiSummary.totalRequests += modelSummary.totalRequests;
      apiSummary.successCount += modelSummary.successCount;
      apiSummary.failureCount += modelSummary.failureCount;
      apiSummary.totalTokens += modelSummary.totalTokens;
    });

    if (Object.keys(filteredModels).length === 0) return;

    filteredApis[apiName] = {
      ...apiEntry,
      ...toUsageSummaryFields(apiSummary),
      models: filteredModels,
    };

    totalSummary.totalRequests += apiSummary.totalRequests;
    totalSummary.successCount += apiSummary.successCount;
    totalSummary.failureCount += apiSummary.failureCount;
    totalSummary.totalTokens += apiSummary.totalTokens;
  });

  return {
    ...usageRecord,
    ...toUsageSummaryFields(totalSummary),
    apis: filteredApis,
  } as T;
}

export function collectUsageDetails(usageData: unknown): UsageDetail[] {
  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const details: UsageDetail[] = [];
  Object.values(apis).forEach((apiEntry) => {
    if (!isRecord(apiEntry)) return;
    const models = isRecord(apiEntry.models) ? apiEntry.models : null;
    if (!models) return;

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) return;
      const modelDetails = Array.isArray(modelEntry.details) ? modelEntry.details : [];

      modelDetails.forEach((detailRaw) => {
        if (!isRecord(detailRaw) || typeof detailRaw.timestamp !== "string") return;
        const detail = detailRaw as unknown as UsageDetail;
        details.push({
          ...detail,
          source: normalizeUsageSourceId(detail.source),
          __modelName: modelName,
        });
      });
    });
  });
  return details;
}

export function extractTotalTokens(detail: unknown): number {
  const record = isRecord(detail) ? detail : null;
  const tokensRaw = record?.tokens;
  const tokens = isRecord(tokensRaw) ? tokensRaw : {};
  if (typeof tokens.total_tokens === "number") return tokens.total_tokens;

  const inputTokens = typeof tokens.input_tokens === "number" ? tokens.input_tokens : 0;
  const outputTokens = typeof tokens.output_tokens === "number" ? tokens.output_tokens : 0;
  const reasoningTokens = typeof tokens.reasoning_tokens === "number" ? tokens.reasoning_tokens : 0;
  const cachedTokens = Math.max(
    typeof tokens.cached_tokens === "number" ? Math.max(tokens.cached_tokens, 0) : 0,
    typeof tokens.cache_tokens === "number" ? Math.max(tokens.cache_tokens, 0) : 0,
  );

  return inputTokens + outputTokens + reasoningTokens + cachedTokens;
}

export function calculateTokenBreakdown(usageData: unknown): TokenBreakdown {
  const details = collectUsageDetails(usageData);
  if (!details.length) return { cachedTokens: 0, reasoningTokens: 0 };

  let cachedTokens = 0;
  let reasoningTokens = 0;

  details.forEach((detail) => {
    const tokens = detail.tokens;
    cachedTokens += Math.max(
      typeof tokens.cached_tokens === "number" ? Math.max(tokens.cached_tokens, 0) : 0,
      typeof tokens.cache_tokens === "number" ? Math.max(tokens.cache_tokens, 0) : 0,
    );
    if (typeof tokens.reasoning_tokens === "number") reasoningTokens += tokens.reasoning_tokens;
  });

  return { cachedTokens, reasoningTokens };
}

export function calculateRecentPerMinuteRates(
  windowMinutes: number = 30,
  usageData: unknown,
): RateStats {
  const details = collectUsageDetails(usageData);
  const effectiveWindow = Number.isFinite(windowMinutes) && windowMinutes > 0 ? windowMinutes : 30;

  if (!details.length) {
    return { rpm: 0, tpm: 0, windowMinutes: effectiveWindow, requestCount: 0, tokenCount: 0 };
  }

  const now = Date.now();
  const windowStart = now - effectiveWindow * 60 * 1000;
  let requestCount = 0;
  let tokenCount = 0;

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp) || timestamp < windowStart) return;
    requestCount += 1;
    tokenCount += extractTotalTokens(detail);
  });

  const denominator = effectiveWindow > 0 ? effectiveWindow : 1;
  return {
    rpm: requestCount / denominator,
    tpm: tokenCount / denominator,
    windowMinutes: effectiveWindow,
    requestCount,
    tokenCount,
  };
}

export function getModelNamesFromUsage(usageData: unknown): string[] {
  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const names = new Set<string>();
  Object.values(apis).forEach((apiEntry) => {
    if (!isRecord(apiEntry)) return;
    const models = isRecord(apiEntry.models) ? apiEntry.models : null;
    if (!models) return;
    Object.keys(models).forEach((modelName) => {
      if (modelName) names.add(modelName);
    });
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
