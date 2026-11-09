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

export const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));
