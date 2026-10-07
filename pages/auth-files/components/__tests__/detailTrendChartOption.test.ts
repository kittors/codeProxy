import { describe, expect, test } from "vitest";
import { chartGradient, chartPalette, hueHex } from "@code-proxy/ui";
import { buildDetailTrendChartOption } from "../detailTrendChartOption";
import { quotaSeriesColor } from "../../helpers/quotaSeriesColors";

type Series = {
  type: string;
  itemStyle: { color: unknown };
  emphasis?: { itemStyle?: { color: unknown } };
  lineStyle?: { color: string };
  areaStyle?: { color: { colorStops: { color: string }[] } };
};

const build = (isDark: boolean, quotaCount = 2) =>
  buildDetailTrendChartOption({
    isDark,
    categories: ["10-01", "10-02"],
    requests: [3, 5],
    cost: [0.1, 0.2],
    quotaSeries: Array.from({ length: quotaCount }, (_, index) => ({
      name: `quota ${index}`,
      values: [10, 20],
    })),
    labels: { requests: "Requests", cost: "Cost" },
    animate: false,
    animationMs: 0,
    formatCurrency: (value) => `$${value.toFixed(2)}`,
  });

const seriesOf = (option: ReturnType<typeof build>) => option.series as unknown as Series[];

// 以前的灰柱、墨黑主线与灰色面积，任何一个出现都说明又退回了灰色图表。
const GREY_OR_INK = ["#e6e6e6", "#cfcfcf", "#3a3a3a", "#0d0d0d", "#ececec", "rgba(13, 13, 13"];

describe("account detail trend chart colours", () => {
  test("requests are gradient bars in the requests identity colour (blue)", () => {
    const palette = chartPalette(false);
    const [requests] = seriesOf(build(false));

    expect(requests.type).toBe("bar");
    expect(requests.itemStyle.color).toEqual(chartGradient(palette.metric.requests, 1, 0.55));
    // 悬停时渐变变实（亮一档），仍是同一个色相。
    expect(requests.emphasis?.itemStyle?.color).toEqual(
      chartGradient(palette.metric.requests, 1, 0.85),
    );
  });

  test("cost is a solid amber line with an amber fading area", () => {
    const palette = chartPalette(false);
    const cost = seriesOf(build(false))[1];

    expect(cost.type).toBe("line");
    expect(cost.lineStyle?.color).toBe(palette.metric.cost);
    expect(cost.itemStyle.color).toBe(palette.metric.cost);
    const stops = cost.areaStyle?.color.colorStops ?? [];
    expect(stops[0]?.color).toBe("rgba(245, 158, 11, 0.16)");
    expect(stops[1]?.color).toBe("rgba(245, 158, 11, 0)");
  });

  test("quota lines use the quota palette, distinct from the request bars and cost line", () => {
    const palette = chartPalette(false);
    const [, , first, second] = seriesOf(build(false));

    expect(first.lineStyle?.color).toBe(hueHex("pink", false));
    expect(second.lineStyle?.color).toBe(quotaSeriesColor(1, false));
    for (const line of [first, second]) {
      expect(line.lineStyle?.color).not.toBe(palette.metric.requests);
      expect(line.lineStyle?.color).not.toBe(palette.metric.cost);
    }
    expect(first.lineStyle?.color).not.toBe(second.lineStyle?.color);
  });

  test("dark mode takes the lighter step of every colour", () => {
    const dark = chartPalette(true);
    const [requests, cost, quota] = seriesOf(build(true, 1));

    expect(requests.itemStyle.color).toEqual(chartGradient(dark.metric.requests, 1, 0.55));
    expect(cost.lineStyle?.color).toBe(dark.metric.cost);
    expect(quota.lineStyle?.color).toBe(hueHex("pink", true));
  });

  test("no grey bars, ink lines or grey areas are left", () => {
    for (const isDark of [false, true]) {
      const serialized = JSON.stringify(build(isDark).series);
      for (const grey of GREY_OR_INK) expect(serialized).not.toContain(grey);
    }
  });

  test("tooltip dots are the series colours, in series order", () => {
    const palette = chartPalette(false);
    const formatter = build(false).tooltip.formatter as (params: unknown) => string;
    const html = formatter([
      { seriesIndex: 0, seriesType: "bar", seriesName: "Requests", value: 3, axisValueLabel: "10-01" },
      { seriesIndex: 1, seriesType: "line", seriesName: "Cost", value: 0.1 },
      { seriesIndex: 2, seriesType: "line", seriesName: "quota 0", value: 10 },
    ]);

    expect(html).toContain(`background:${palette.metric.requests}`);
    expect(html).toContain(`background:${palette.metric.cost}`);
    expect(html).toContain(`background:${hueHex("pink", false)}`);
    expect(html).toContain("$0.10");
    expect(html).toContain("10.0%");
  });
});
