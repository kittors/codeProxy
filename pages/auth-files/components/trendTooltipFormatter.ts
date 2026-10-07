export interface TrendChartTooltipItem {
  marker?: string;
  seriesName?: string;
  seriesType?: string;
  seriesIndex?: number;
  value?: unknown;
  axisValueLabel?: string;
}

/**
 * 提示框里每行前的色块。传了序列颜色就按它画：请求柱是渐变填充，echarts 自带的 marker
 * 只取渐变的一端，深浅会和柱子对不上；自己画能保证色块就是图上那条线 / 那根柱的颜色。
 */
const colorDot = (color: string) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${color};margin-right:6px;flex:none"></span>`;

export const formatTrendChartTooltip = (
  params: unknown,
  formatCurrency: (value: number) => string,
  seriesColors?: readonly string[],
): string => {
  const items: TrendChartTooltipItem[] = Array.isArray(params) ? params : [params as TrendChartTooltipItem];
  const title = items[0]?.axisValueLabel ?? "";
  const activeItems = items.filter((item) => {
    const val = item?.value;
    return val !== null && val !== undefined && val !== "" && val !== "--";
  });
  if (activeItems.length === 0) return title;
  const lines = activeItems.map((item) => {
    const color =
      typeof item?.seriesIndex === "number" ? seriesColors?.[item.seriesIndex] : undefined;
    const marker = color ? colorDot(color) : (item?.marker ?? "");
    const name = item?.seriesName ?? "";
    const val = item?.value;
    let displayVal = String(val ?? "");
    if (item?.seriesType === "bar") {
      displayVal = String(val ?? 0);
    } else if (item?.seriesIndex === 1) {
      displayVal = formatCurrency(Number(val));
    } else if (typeof val === "number" && Number.isFinite(val)) {
      displayVal = `${val.toFixed(1)}%`;
    }
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;"><span style="display:flex;align-items:center;">${marker}${name}</span><b>${displayVal}</b></div>`;
  });
  return `<div><div style="font-weight:600;margin-bottom:4px;">${title}</div>${lines.join("")}</div>`;
};
