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

export const computeOutputTokensPerSecond = (row: RequestLogsRow): number | null => {
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

  let generationSeconds: number;

  if (row.streaming && firstMs > 0 && firstMs < totalMs) {
    const streamGenerationMs = totalMs - firstMs;
    // When stream generation duration is extremely short (< 200ms) or first token accounts
    // for >= 90% of duration while remaining time is under 500ms (burst stream or buffered chunks),
    // calculating TPS based purely on delta-window results in misleading artificial spikes (e.g. 8000+ t/s).
    // In such burst/buffered cases, model generation occurred over the full total duration.
    if (streamGenerationMs < 200 || (firstMs / totalMs >= 0.9 && streamGenerationMs < 500)) {
      generationSeconds = totalMs / 1000;
    } else {
      generationSeconds = streamGenerationMs / 1000;
    }
  } else {
    // Non-streaming or streaming without valid first-token metric uses total latency
    generationSeconds = totalMs / 1000;
  }

  if (generationSeconds <= 0) return null;

  const tps = row.outputTokens / generationSeconds;
  return Number.isFinite(tps) && tps > 0 ? tps : null;
};

export const formatTokensPerSecond = (value: number | null): string => {
  if (!Number.isFinite(value ?? Number.NaN) || !value || value <= 0) return "--";
  if (value >= 100) return `${Math.round(value)} t/s`;
  if (value >= 10) return `${value.toFixed(1)} t/s`;
  return `${value.toFixed(2)} t/s`;
};

export const hasRequestLogMetricText = (value: string): boolean => {
  const trimmed = String(value || "").trim();
  return trimmed !== "" && trimmed !== "--";
};

export const resolveLatencyToneClasses = (latencyText: string): string => {
  const seconds = parseLatencyTextToSeconds(latencyText);
  if (seconds === null) {
    return "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]";
  }

  // 10 秒内是常态：中性淡底；慢了才变琥珀、红色。只有淡底、不描边。
  if (seconds < 10) {
    return "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";
  }
  if (seconds < 30) {
    return "bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200";
  }
  return "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200";
};
