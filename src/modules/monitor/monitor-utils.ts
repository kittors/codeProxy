import type { UsageData, UsageDetail } from "@/lib/http/types";

export interface KpiMetrics {
  requestCount: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
}

export interface UsageRecord extends UsageDetail {
  model: string;
}

export const parseUsageTimestampMs = (value: string): number => {
  const raw = value.trim();
  if (!raw) return Number.NaN;

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      // 10 digits: seconds, 13 digits: milliseconds, 16 digits: microseconds, 19 digits: nanoseconds
      if (raw.length <= 10) return numeric * 1000;
      if (raw.length <= 13) return numeric;
      if (raw.length <= 16) return Math.floor(numeric / 1000);
      return Math.floor(numeric / 1_000_000);
    }
  }

  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;

  // Safari/strict parser fallback:
  // - "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
  // - "YYYY/MM/DD ..." -> "YYYY-MM-DD..."
  // - "+0800" -> "+08:00"
  let normalized = raw
    .replace(/^(\d{4})\/(\d{2})\/(\d{2})\s+/, "$1-$2-$3T")
    .replace(/^(\d{4})-(\d{2})-(\d{2})\s+/, "$1-$2-$3T")
    // "...,123" -> "... .123"
    .replace(/,(\d{1,9})(?=[Z+-]|$)/, ".$1")
    // Truncate >3 fractional second digits (e.g. 2026-03-14T01:02:03.123456Z)
    .replace(/\.(\d{3})\d+(?=[Z+-]|$)/, ".$1")
    // Remove whitespace before timezone: "...T00:00:00 +08:00" -> "...T00:00:00+08:00"
    .replace(/\s+([Z+-])/, "$1")
    // Drop trailing timezone names that Safari can't parse: "...+08:00 CST" -> "...+08:00"
    .replace(/\s+[A-Za-z]{2,6}$/, "")
    // Normalize timezone offset without colon: +0800 -> +08:00
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

  const normalizedParsed = Date.parse(normalized);
  if (Number.isFinite(normalizedParsed)) return normalizedParsed;

  // Manual local-time parse for non-ISO strings.
  const match =
    raw.match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/,
    ) ?? null;

  if (!match) return Number.NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  const msRaw = match[7];
  const ms = msRaw ? Number(msRaw.padEnd(3, "0").slice(0, 3)) : 0;

  const date = new Date(year, month - 1, day, hour, minute, second, ms);
  const time = date.getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

export const filterUsageByDays = (data: UsageData, days: number, apiFilter: string): UsageData => {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const normalizedFilter = apiFilter.trim().toLowerCase();

  const filtered: UsageData = { apis: {} };

  if (!data?.apis) return filtered;

  for (const [apiKey, apiData] of Object.entries(data.apis)) {
    if (normalizedFilter && !apiKey.toLowerCase().includes(normalizedFilter)) {
      continue;
    }

    const nextModels: UsageData["apis"][string]["models"] = {};

    if (!apiData?.models) continue;

    for (const [modelName, modelData] of Object.entries(apiData.models)) {
      const details = (modelData?.details || []).filter((detail) => {
        const timestamp = parseUsageTimestampMs(detail.timestamp);
        return Number.isFinite(timestamp) ? timestamp >= cutoff : false;
      });

      if (details.length > 0) {
        nextModels[modelName] = { details };
      }
    }

    if (Object.keys(nextModels).length > 0) {
      filtered.apis[apiKey] = { models: nextModels };
    }
  }

  return filtered;
};

export const iterateUsageRecords = (data: UsageData): UsageRecord[] => {
  const details: UsageRecord[] = [];
  if (!data?.apis) return details;
  for (const apiData of Object.values(data.apis)) {
    if (!apiData?.models) continue;
    for (const [model, modelData] of Object.entries(apiData.models)) {
      details.push(...(modelData?.details || []).map((detail) => ({ ...detail, model })));
    }
  }
  return details;
};

export const computeKpiMetrics = (data: UsageData): KpiMetrics => {
  const details = iterateUsageRecords(data);

  const requestCount = details.length;
  const failedCount = details.reduce((count, detail) => (detail.failed ? count + 1 : count), 0);
  const successCount = requestCount - failedCount;
  const successRate = requestCount === 0 ? 0 : (successCount / requestCount) * 100;

  const inputTokens = details.reduce((sum, detail) => sum + (detail.tokens?.input_tokens ?? 0), 0);
  const outputTokens = details.reduce(
    (sum, detail) => sum + (detail.tokens?.output_tokens ?? 0),
    0,
  );
  const reasoningTokens = details.reduce(
    (sum, detail) => sum + (detail.tokens?.reasoning_tokens ?? 0),
    0,
  );
  const cachedTokens = details.reduce(
    (sum, detail) => sum + (detail.tokens?.cached_tokens ?? 0),
    0,
  );
  const totalTokens = details.reduce((sum, detail) => sum + (detail.tokens?.total_tokens ?? 0), 0);

  return {
    requestCount,
    successCount,
    failedCount,
    successRate,
    totalTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedTokens,
  };
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
};

export const formatRate = (value: number): string => {
  return `${value.toFixed(2)}%`;
};
