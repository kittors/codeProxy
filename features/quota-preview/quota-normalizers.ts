export const normalizeAuthIndexValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

export const normalizeStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

export const normalizeNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeQuotaFraction = (value: unknown): number | null => {
  const normalized = normalizeNumberValue(value);
  if (normalized !== null) return normalized;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith("%")) {
      const parsed = Number(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed / 100 : null;
    }
  }
  return null;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const parseIdTokenPayload = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Fallback to JWT payload decoding below.
  }
  const segments = trimmed.split(".");
  if (segments.length < 2) return null;
  try {
    const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = typeof window.atob === "function" ? window.atob(padded) : atob(padded);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const parseResetTimeToMs = (value?: string | null): number | undefined => {
  const normalized = normalizeStringValue(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
};

export const unixSecondsToMs = (seconds?: number | null): number | undefined => {
  const normalized = normalizeNumberValue(seconds);
  if (normalized === null || normalized <= 0) return undefined;
  return Math.round(normalized * 1000);
};

export const formatRelativeResetLabel = (
  resetAtMs?: number,
  nowMs = Date.now(),
): string | undefined => {
  if (typeof resetAtMs !== "number" || !Number.isFinite(resetAtMs)) return undefined;

  const diffMs = resetAtMs - nowMs;
  if (diffMs <= 0) return "m_quota.refresh_due";

  const minutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (minutes < 60) return `m_quota.minutes_later::${minutes}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `m_quota.hours_minutes_later::${hours}::${rest}` : `m_quota.hours_later::${hours}`;
};

export const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));
