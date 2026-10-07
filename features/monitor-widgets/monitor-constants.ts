import { CHART_CATEGORICAL } from "@code-proxy/ui";
export type TimeRange = 1 | 7 | 14 | 30;

export const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;

/**
 * 分类色（模型分布环图、门户用量的 API Key 占比）：取自 @code-proxy/ui 的 CHART_CATEGORICAL，
 * 一组明快、相邻两色色相分得开的颜色。图例的色点不再另抄一份 Tailwind 类名，而是直接用
 * model-distribution 的 modelDistributionColors 给出的色值——以前那份类名表在色板换色后没跟着改，
 * 图例和环图的颜色对不上。
 */
export const CHART_COLORS: readonly string[] = CHART_CATEGORICAL;
