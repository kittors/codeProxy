import { hueHex, type Hue } from "@code-proxy/ui";

/**
 * 额度占用线的配色：账号详情「额度与请求趋势」与组概览的周限线共用这一份，同一条额度在两处同色。
 * 图标着色为多彩时，账号详情与组概览里和额度有关的统计格图标也用第一个色相（QUOTA_HUE）。
 *
 * 不直接轮换 CHART_CATEGORICAL：这两张图里请求数是蓝柱、费用是琥珀线，而分类色板的第一个是靛蓝、
 * 第三个就是琥珀，额度线会和请求柱、费用线撞色。前三个色相按色觉差异校验过——与琥珀费用线、
 * 彼此之间在红绿色弱模拟下都分得开；超过三条额度线时色差会变小，好在同一窗口很少超过三条。
 */
export const QUOTA_HUE: Hue = "pink";

const QUOTA_SERIES_HUES: readonly Hue[] = [QUOTA_HUE, "cyan", "violet", "emerald", "fuchsia", "lime"];

export const quotaSeriesColor = (index: number, isDark: boolean): string =>
  hueHex(QUOTA_SERIES_HUES[index % QUOTA_SERIES_HUES.length] ?? QUOTA_HUE, isDark);
