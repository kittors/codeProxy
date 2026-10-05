import { CHART_CATEGORICAL } from "@code-proxy/ui";
export type TimeRange = 1 | 7 | 14 | 30;
export type HourWindow = 6 | 12 | 24;

export const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;
export const HOUR_WINDOWS: readonly HourWindow[] = [6, 12, 24] as const;

/**
 * 分类色（模型分布饼图、按模型堆叠的柱子、门户用量图例）。取自 @code-proxy/ui 的
 * CHART_CATEGORICAL：降饱和的一组色相、不含紫色系；下面的图例圆点类名与它一一对应，
 * 必须保持同序同值，否则图例和图上的颜色会对不上。
 */
export const CHART_COLORS: readonly string[] = CHART_CATEGORICAL;

export const HOURLY_MODEL_COLORS: readonly string[] = CHART_CATEGORICAL.slice(0, 5).map(
  (hex) => `${hex}e0`,
).concat(["#a3a3a3"]);

export const CHART_COLOR_CLASSES: readonly string[] = [
  "bg-[#5b8def]",
  "bg-[#3fb68b]",
  "bg-[#e0a33a]",
  "bg-[#e36c6c]",
  "bg-[#2ba6b0]",
  "bg-[#b08d64]",
  "bg-[#d97ba6]",
  "bg-[#7d8796]",
  "bg-[#8fb34a]",
  "bg-[#c97f3d]",
] as const;
