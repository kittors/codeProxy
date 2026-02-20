export type TimeRange = 1 | 7 | 14 | 30;
export type HourWindow = 6 | 12 | 24;

export const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;
export const HOUR_WINDOWS: readonly HourWindow[] = [6, 12, 24] as const;

export const CHART_COLORS: readonly string[] = [
  "#60a5fa",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#818cf8",
  "#2dd4bf",
  "#22d3ee",
  "#a3e635",
  "#f472b6",
] as const;

export const HOURLY_MODEL_COLORS: readonly string[] = [
  "rgba(110,231,183,0.88)",
  "rgba(196,181,253,0.88)",
  "rgba(252,211,77,0.88)",
  "rgba(249,168,212,0.88)",
  "rgba(94,234,212,0.88)",
  "rgba(148,163,184,0.58)",
] as const;

export const CHART_COLOR_CLASSES: readonly string[] = [
  "bg-blue-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
  "bg-indigo-400",
  "bg-teal-400",
  "bg-cyan-400",
  "bg-lime-400",
  "bg-pink-400",
] as const;
