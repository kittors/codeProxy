export interface TrendChartTooltipItem {
  marker?: string;
  seriesName?: string;
  seriesType?: string;
  seriesIndex?: number;
  value?: unknown;
  axisValueLabel?: string;
}

export const formatTrendChartTooltip = (
  params: unknown,
  formatCurrency: (value: number) => string,
): string => {
  const items: TrendChartTooltipItem[] = Array.isArray(params) ? params : [params as TrendChartTooltipItem];
  const title = items[0]?.axisValueLabel ?? "";
  const activeItems = items.filter((item) => {
    const val = item?.value;
    return val !== null && val !== undefined && val !== "" && val !== "--";
  });
  if (activeItems.length === 0) return title;
  const lines = activeItems.map((item) => {
    const marker = item?.marker ?? "";
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
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;"><span>${marker}${name}</span><b>${displayVal}</b></div>`;
  });
  return `<div><div style="font-weight:600;margin-bottom:4px;">${title}</div>${lines.join("")}</div>`;
};
