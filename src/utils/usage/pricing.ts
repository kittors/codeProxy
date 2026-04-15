import {
  getApisRecord,
  isRecord,
  MODEL_PRICE_STORAGE_KEY,
  TOKENS_PER_PRICE_UNIT,
  type ApiStats,
  type ModelPrice,
  type UsageDetail,
} from "./shared";
import { collectUsageDetails } from "./details";
import { maskUsageSensitiveValue } from "./sanitize";

export function calculateCost(detail: UsageDetail, modelPrices: Record<string, ModelPrice>): number {
  const modelName = detail.__modelName || "";
  const price = modelPrices[modelName];
  if (!price) return 0;

  const tokens = detail.tokens;
  const rawInputTokens = Number(tokens.input_tokens);
  const rawCompletionTokens = Number(tokens.output_tokens);
  const rawCachedTokensPrimary = Number(tokens.cached_tokens);
  const rawCachedTokensAlternate = Number(tokens.cache_tokens);

  const inputTokens = Number.isFinite(rawInputTokens) ? Math.max(rawInputTokens, 0) : 0;
  const completionTokens = Number.isFinite(rawCompletionTokens)
    ? Math.max(rawCompletionTokens, 0)
    : 0;
  const cachedTokens = Math.max(
    Number.isFinite(rawCachedTokensPrimary) ? Math.max(rawCachedTokensPrimary, 0) : 0,
    Number.isFinite(rawCachedTokensAlternate) ? Math.max(rawCachedTokensAlternate, 0) : 0,
  );
  const promptTokens = Math.max(inputTokens - cachedTokens, 0);

  const promptCost = (promptTokens / TOKENS_PER_PRICE_UNIT) * (Number(price.prompt) || 0);
  const cachedCost = (cachedTokens / TOKENS_PER_PRICE_UNIT) * (Number(price.cache) || 0);
  const completionCost =
    (completionTokens / TOKENS_PER_PRICE_UNIT) * (Number(price.completion) || 0);
  const total = promptCost + cachedCost + completionCost;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

export function calculateTotalCost(
  usageData: unknown,
  modelPrices: Record<string, ModelPrice>,
): number {
  const details = collectUsageDetails(usageData);
  if (!details.length || !Object.keys(modelPrices).length) return 0;
  return details.reduce((sum, detail) => sum + calculateCost(detail, modelPrices), 0);
}

export function loadModelPrices(): Record<string, ModelPrice> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(MODEL_PRICE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const normalized: Record<string, ModelPrice> = {};
    Object.entries(parsed).forEach(([model, price]: [string, unknown]) => {
      if (!model) return;
      const priceRecord = isRecord(price) ? price : null;
      const promptRaw = Number(priceRecord?.prompt);
      const completionRaw = Number(priceRecord?.completion);
      const cacheRaw = Number(priceRecord?.cache);

      if (
        !Number.isFinite(promptRaw) &&
        !Number.isFinite(completionRaw) &&
        !Number.isFinite(cacheRaw)
      ) {
        return;
      }

      const prompt = Number.isFinite(promptRaw) && promptRaw >= 0 ? promptRaw : 0;
      const completion = Number.isFinite(completionRaw) && completionRaw >= 0 ? completionRaw : 0;
      const cache =
        Number.isFinite(cacheRaw) && cacheRaw >= 0
          ? cacheRaw
          : Number.isFinite(promptRaw) && promptRaw >= 0
            ? promptRaw
            : prompt;

      normalized[model] = { prompt, completion, cache };
    });
    return normalized;
  } catch {
    return {};
  }
}

export function saveModelPrices(prices: Record<string, ModelPrice>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MODEL_PRICE_STORAGE_KEY, JSON.stringify(prices));
  } catch {
    console.warn("Failed to save model pricing");
  }
}

export function getApiStats(
  usageData: unknown,
  modelPrices: Record<string, ModelPrice>,
): ApiStats[] {
  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const result: ApiStats[] = [];

  Object.entries(apis).forEach(([endpoint, apiData]) => {
    if (!isRecord(apiData)) return;
    const models: Record<
      string,
      { requests: number; successCount: number; failureCount: number; tokens: number }
    > = {};
    let derivedSuccessCount = 0;
    let derivedFailureCount = 0;
    let totalCost = 0;

    const modelsData = isRecord(apiData.models) ? apiData.models : {};
    Object.entries(modelsData).forEach(([modelName, modelData]) => {
      if (!isRecord(modelData)) return;
      const details = Array.isArray(modelData.details) ? modelData.details : [];
      const hasExplicitCounts =
        typeof modelData.success_count === "number" || typeof modelData.failure_count === "number";

      let successCount = 0;
      let failureCount = 0;
      if (hasExplicitCounts) {
        successCount += Number(modelData.success_count) || 0;
        failureCount += Number(modelData.failure_count) || 0;
      }

      const price = modelPrices[modelName];
      if (details.length > 0 && (!hasExplicitCounts || price)) {
        details.forEach((detail) => {
          const detailRecord = isRecord(detail) ? detail : null;
          if (!hasExplicitCounts) {
            if (detailRecord?.failed === true) failureCount += 1;
            else successCount += 1;
          }

          if (price && detailRecord) {
            totalCost += calculateCost(
              { ...(detailRecord as unknown as UsageDetail), __modelName: modelName },
              modelPrices,
            );
          }
        });
      }

      models[modelName] = {
        requests: Number(modelData.total_requests) || 0,
        successCount,
        failureCount,
        tokens: Number(modelData.total_tokens) || 0,
      };
      derivedSuccessCount += successCount;
      derivedFailureCount += failureCount;
    });

    const hasApiExplicitCounts =
      typeof apiData.success_count === "number" || typeof apiData.failure_count === "number";
    const successCount = hasApiExplicitCounts
      ? Number(apiData.success_count) || 0
      : derivedSuccessCount;
    const failureCount = hasApiExplicitCounts
      ? Number(apiData.failure_count) || 0
      : derivedFailureCount;

    result.push({
      endpoint: maskUsageSensitiveValue(endpoint) || endpoint,
      totalRequests: Number(apiData.total_requests) || 0,
      successCount,
      failureCount,
      totalTokens: Number(apiData.total_tokens) || 0,
      totalCost,
      models,
    });
  });

  return result;
}

export function getModelStats(
  usageData: unknown,
  modelPrices: Record<string, ModelPrice>,
): Array<{
  model: string;
  requests: number;
  successCount: number;
  failureCount: number;
  tokens: number;
  cost: number;
}> {
  const apis = getApisRecord(usageData);
  if (!apis) return [];

  const modelMap = new Map<
    string,
    { requests: number; successCount: number; failureCount: number; tokens: number; cost: number }
  >();

  Object.values(apis).forEach((apiData) => {
    if (!isRecord(apiData)) return;
    const models = isRecord(apiData.models) ? apiData.models : null;
    if (!models) return;

    Object.entries(models).forEach(([modelName, modelData]) => {
      if (!isRecord(modelData)) return;
      const existing = modelMap.get(modelName) || {
        requests: 0,
        successCount: 0,
        failureCount: 0,
        tokens: 0,
        cost: 0,
      };

      existing.requests += Number(modelData.total_requests) || 0;
      existing.tokens += Number(modelData.total_tokens) || 0;

      const details = Array.isArray(modelData.details) ? modelData.details : [];
      const hasExplicitCounts =
        typeof modelData.success_count === "number" || typeof modelData.failure_count === "number";

      if (hasExplicitCounts) {
        existing.successCount += Number(modelData.success_count) || 0;
        existing.failureCount += Number(modelData.failure_count) || 0;
      }

      const price = modelPrices[modelName];
      if (details.length > 0 && (!hasExplicitCounts || price)) {
        details.forEach((detail) => {
          const detailRecord = isRecord(detail) ? detail : null;
          if (!hasExplicitCounts) {
            if (detailRecord?.failed === true) existing.failureCount += 1;
            else existing.successCount += 1;
          }

          if (price && detailRecord) {
            existing.cost += calculateCost(
              { ...(detailRecord as unknown as UsageDetail), __modelName: modelName },
              modelPrices,
            );
          }
        });
      }

      modelMap.set(modelName, existing);
    });
  });

  return Array.from(modelMap.entries())
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.requests - a.requests);
}
