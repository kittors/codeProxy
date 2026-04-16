import { maskApiKey } from "../format";
import { calculateCost } from "./pricing";
import { collectUsageDetails } from "./details";
import { formatDayLabel, formatHourLabel } from "./formatters";
import {
  getApisRecord,
  isRecord,
  normalizeAuthIndex,
  type KeyStatBucket,
  type KeyStats,
  type ModelPrice,
  type UsageDetail,
} from "./shared";
import { normalizeUsageSourceId } from "./sanitize";

export type StatusBlockState = "success" | "failure" | "mixed" | "idle";

export interface StatusBlockDetail {
  success: number;
  failure: number;
  rate: number;
  startTime: number;
  endTime: number;
}

export interface StatusBarData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
}

export interface ServiceHealthData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
  rows: number;
  cols: number;
}

export function calculateStatusBarData(
  usageDetails: UsageDetail[],
  sourceFilter?: string,
  authIndexFilter?: number,
): StatusBarData {
  const blockCount = 20;
  const blockDurationMs = 10 * 60 * 1000;
  const windowMs = blockCount * blockDurationMs;

  const now = Date.now();
  const windowStart = now - windowMs;

  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: blockCount },
    () => ({ success: 0, failure: 0 }),
  );

  let totalSuccess = 0;
  let totalFailure = 0;

  usageDetails.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp) || timestamp < windowStart || timestamp > now) return;
    if (sourceFilter !== undefined && detail.source !== sourceFilter) return;
    if (authIndexFilter !== undefined && detail.auth_index !== authIndexFilter) return;

    const ageMs = now - timestamp;
    const blockIndex = blockCount - 1 - Math.floor(ageMs / blockDurationMs);
    if (blockIndex < 0 || blockIndex >= blockCount) return;

    if (detail.failed) {
      blockStats[blockIndex].failure += 1;
      totalFailure += 1;
    } else {
      blockStats[blockIndex].success += 1;
      totalSuccess += 1;
    }
  });

  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];
  blockStats.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) blocks.push("idle");
    else if (stat.failure === 0) blocks.push("success");
    else if (stat.success === 0) blocks.push("failure");
    else blocks.push("mixed");

    const blockStartTime = windowStart + idx * blockDurationMs;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + blockDurationMs,
    });
  });

  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
  };
}

export function calculateServiceHealthData(usageDetails: UsageDetail[]): ServiceHealthData {
  const rows = 7;
  const cols = 96;
  const blockCount = rows * cols;
  const blockDurationMs = 15 * 60 * 1000;
  const windowMs = blockCount * blockDurationMs;

  const now = Date.now();
  const windowStart = now - windowMs;
  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: blockCount },
    () => ({ success: 0, failure: 0 }),
  );

  let totalSuccess = 0;
  let totalFailure = 0;

  usageDetails.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp) || timestamp < windowStart || timestamp > now) return;

    const ageMs = now - timestamp;
    const blockIndex = blockCount - 1 - Math.floor(ageMs / blockDurationMs);
    if (blockIndex < 0 || blockIndex >= blockCount) return;

    if (detail.failed) {
      blockStats[blockIndex].failure += 1;
      totalFailure += 1;
    } else {
      blockStats[blockIndex].success += 1;
      totalSuccess += 1;
    }
  });

  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];
  blockStats.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) blocks.push("idle");
    else if (stat.failure === 0) blocks.push("success");
    else if (stat.success === 0) blocks.push("failure");
    else blocks.push("mixed");

    const blockStartTime = windowStart + idx * blockDurationMs;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + blockDurationMs,
    });
  });

  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
    rows,
    cols,
  };
}

export function computeKeyStats(
  usageData: unknown,
  masker: (val: string) => string = maskApiKey,
): KeyStats {
  const apis = getApisRecord(usageData);
  if (!apis) return { bySource: {}, byAuthIndex: {} };

  const sourceStats: Record<string, KeyStatBucket> = {};
  const authIndexStats: Record<string, KeyStatBucket> = {};

  const ensureBucket = (bucket: Record<string, KeyStatBucket>, key: string) => {
    if (!bucket[key]) bucket[key] = { success: 0, failure: 0 };
    return bucket[key];
  };

  Object.values(apis).forEach((apiEntry) => {
    if (!isRecord(apiEntry)) return;
    const models = isRecord(apiEntry.models) ? apiEntry.models : null;
    if (!models) return;

    Object.values(models).forEach((modelEntry) => {
      if (!isRecord(modelEntry)) return;
      const details = Array.isArray(modelEntry.details) ? modelEntry.details : [];

      details.forEach((detail) => {
        const detailRecord = isRecord(detail) ? detail : null;
        const source = normalizeUsageSourceId(detailRecord?.source, masker);
        const authIndexKey = normalizeAuthIndex(detailRecord?.auth_index);
        const isFailed = detailRecord?.failed === true;

        if (source) {
          const bucket = ensureBucket(sourceStats, source);
          if (isFailed) bucket.failure += 1;
          else bucket.success += 1;
        }

        if (authIndexKey) {
          const bucket = ensureBucket(authIndexStats, authIndexKey);
          if (isFailed) bucket.failure += 1;
          else bucket.success += 1;
        }
      });
    });
  });

  return { bySource: sourceStats, byAuthIndex: authIndexStats };
}

export type TokenCategory = "input" | "output" | "cached" | "reasoning";

export interface TokenBreakdownSeries {
  labels: string[];
  dataByCategory: Record<TokenCategory, number[]>;
  hasData: boolean;
}

export function buildHourlyTokenBreakdown(
  usageData: unknown,
  hourWindow: number = 24,
): TokenBreakdownSeries {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i++) {
    labels.push(formatHourLabel(new Date(earliestTime + i * hourMs)));
  }

  const dataByCategory: Record<TokenCategory, number[]> = {
    input: Array.from({ length: labels.length }, () => 0),
    output: Array.from({ length: labels.length }, () => 0),
    cached: Array.from({ length: labels.length }, () => 0),
    reasoning: Array.from({ length: labels.length }, () => 0),
  };

  const details = collectUsageDetails(usageData);
  let hasData = false;

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp)) return;
    const normalized = new Date(timestamp);
    normalized.setMinutes(0, 0, 0);
    const bucketStart = normalized.getTime();
    const lastBucketTime = earliestTime + (labels.length - 1) * hourMs;
    if (bucketStart < earliestTime || bucketStart > lastBucketTime) return;
    const bucketIndex = Math.floor((bucketStart - earliestTime) / hourMs);
    if (bucketIndex < 0 || bucketIndex >= labels.length) return;

    const tokens = detail.tokens;
    const input = typeof tokens.input_tokens === "number" ? Math.max(tokens.input_tokens, 0) : 0;
    const output = typeof tokens.output_tokens === "number" ? Math.max(tokens.output_tokens, 0) : 0;
    const cached = Math.max(
      typeof tokens.cached_tokens === "number" ? Math.max(tokens.cached_tokens, 0) : 0,
      typeof tokens.cache_tokens === "number" ? Math.max(tokens.cache_tokens, 0) : 0,
    );
    const reasoning =
      typeof tokens.reasoning_tokens === "number" ? Math.max(tokens.reasoning_tokens, 0) : 0;

    dataByCategory.input[bucketIndex] += input;
    dataByCategory.output[bucketIndex] += output;
    dataByCategory.cached[bucketIndex] += cached;
    dataByCategory.reasoning[bucketIndex] += reasoning;
    hasData = true;
  });

  return { labels, dataByCategory, hasData };
}

export function buildDailyTokenBreakdown(usageData: unknown): TokenBreakdownSeries {
  const details = collectUsageDetails(usageData);
  const dayMap: Record<string, Record<TokenCategory, number>> = {};
  let hasData = false;

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp)) return;
    const dayLabel = formatDayLabel(new Date(timestamp));
    if (!dayLabel) return;
    if (!dayMap[dayLabel]) {
      dayMap[dayLabel] = { input: 0, output: 0, cached: 0, reasoning: 0 };
    }

    const tokens = detail.tokens;
    const input = typeof tokens.input_tokens === "number" ? Math.max(tokens.input_tokens, 0) : 0;
    const output = typeof tokens.output_tokens === "number" ? Math.max(tokens.output_tokens, 0) : 0;
    const cached = Math.max(
      typeof tokens.cached_tokens === "number" ? Math.max(tokens.cached_tokens, 0) : 0,
      typeof tokens.cache_tokens === "number" ? Math.max(tokens.cache_tokens, 0) : 0,
    );
    const reasoning =
      typeof tokens.reasoning_tokens === "number" ? Math.max(tokens.reasoning_tokens, 0) : 0;

    dayMap[dayLabel].input += input;
    dayMap[dayLabel].output += output;
    dayMap[dayLabel].cached += cached;
    dayMap[dayLabel].reasoning += reasoning;
    hasData = true;
  });

  const labels = Object.keys(dayMap).sort();
  const dataByCategory: Record<TokenCategory, number[]> = {
    input: labels.map((label) => dayMap[label].input),
    output: labels.map((label) => dayMap[label].output),
    cached: labels.map((label) => dayMap[label].cached),
    reasoning: labels.map((label) => dayMap[label].reasoning),
  };

  return { labels, dataByCategory, hasData };
}

export interface CostSeries {
  labels: string[];
  data: number[];
  hasData: boolean;
}

export function buildHourlyCostSeries(
  usageData: unknown,
  modelPrices: Record<string, ModelPrice>,
  hourWindow: number = 24,
): CostSeries {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i++) {
    labels.push(formatHourLabel(new Date(earliestTime + i * hourMs)));
  }

  const data = Array.from({ length: labels.length }, () => 0);
  const details = collectUsageDetails(usageData);
  let hasData = false;

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp)) return;
    const normalized = new Date(timestamp);
    normalized.setMinutes(0, 0, 0);
    const bucketStart = normalized.getTime();
    const lastBucketTime = earliestTime + (labels.length - 1) * hourMs;
    if (bucketStart < earliestTime || bucketStart > lastBucketTime) return;
    const bucketIndex = Math.floor((bucketStart - earliestTime) / hourMs);
    if (bucketIndex < 0 || bucketIndex >= labels.length) return;

    const cost = calculateCost(detail, modelPrices);
    if (cost > 0) {
      data[bucketIndex] += cost;
      hasData = true;
    }
  });

  return { labels, data, hasData };
}

export function buildDailyCostSeries(
  usageData: unknown,
  modelPrices: Record<string, ModelPrice>,
): CostSeries {
  const details = collectUsageDetails(usageData);
  const dayMap: Record<string, number> = {};
  let hasData = false;

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp)) return;
    const dayLabel = formatDayLabel(new Date(timestamp));
    if (!dayLabel) return;

    const cost = calculateCost(detail, modelPrices);
    if (cost > 0) {
      dayMap[dayLabel] = (dayMap[dayLabel] || 0) + cost;
      hasData = true;
    }
  });

  const labels = Object.keys(dayMap).sort();
  const data = labels.map((label) => dayMap[label]);
  return { labels, data, hasData };
}
