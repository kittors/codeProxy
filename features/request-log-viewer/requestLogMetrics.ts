import type { RequestLogsRow } from "./requestLogsRow";

const parseLatencyTextToSeconds = (text: string): number | null => {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed === "--") return null;
  if (trimmed === "<1ms") return 0.0005;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(ms|s)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  return match[2] === "ms" ? value / 1000 : value;
};

/**
 * 吞吐的分母：生成用了多久、按哪种口径算的。和后端 internal/usage/generation_speed.go 同口径：
 * 流式且有首字时间时是「总耗时 − 首字」（generation）；生成段极短（< 200ms），或首字占了九成以上、
 * 剩下不到 500ms 时，是缓冲后一次性写出的（burst），按总耗时算，免得算出 8000+ tok/s 的假尖峰；
 * 非流式或没有首字时间按总耗时（total）。没有输出或耗时为 0 时返回 null。
 */
export const describeThroughput = (
  row: RequestLogsRow,
): { basis: "generation" | "burst" | "total"; ms: number } | null => {
  if (!Number.isFinite(row.outputTokens) || row.outputTokens <= 0) return null;

  // Prefer exact milliseconds when available, fall back to parsing latencyText
  const totalMs =
    typeof row.latencyMs === "number" && Number.isFinite(row.latencyMs)
      ? row.latencyMs
      : (parseLatencyTextToSeconds(row.latencyText) ?? 0) * 1000;

  if (totalMs <= 0) return null;

  const firstMs =
    row.streaming && typeof row.firstTokenMs === "number" && Number.isFinite(row.firstTokenMs)
      ? row.firstTokenMs
      : row.streaming
        ? (parseLatencyTextToSeconds(row.firstTokenText) ?? 0) * 1000
        : 0;

  if (row.streaming && firstMs > 0 && firstMs < totalMs) {
    const streamGenerationMs = totalMs - firstMs;
    if (streamGenerationMs < 200 || (firstMs / totalMs >= 0.9 && streamGenerationMs < 500)) {
      return { basis: "burst", ms: totalMs };
    }
    return { basis: "generation", ms: streamGenerationMs };
  }
  return { basis: "total", ms: totalMs };
};

export const computeOutputTokensPerSecond = (row: RequestLogsRow): number | null => {
  const basis = describeThroughput(row);
  if (!basis || basis.ms <= 0) return null;
  const tps = row.outputTokens / (basis.ms / 1000);
  return Number.isFinite(tps) && tps > 0 ? tps : null;
};

export const formatTokensPerSecond = (value: number | null): string => {
  if (!Number.isFinite(value ?? Number.NaN) || !value || value <= 0) return "--";
  if (value >= 100) return `${Math.round(value)} t/s`;
  if (value >= 10) return `${value.toFixed(1)} t/s`;
  return `${value.toFixed(2)} t/s`;
};
