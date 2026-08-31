import type { RequestLogsRow } from "./requestLogsShared";

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
    return "border-slate-900/8 bg-slate-50 text-slate-500 dark:border-white/8 dark:bg-neutral-950/45 dark:text-white/55";
  }

  if (seconds < 10) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200";
  }
  if (seconds < 30) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200";
  }
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200";
};
