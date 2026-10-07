import { describe, expect, test } from "vitest";
import { chartGradient, chartPalette, hueHex } from "@code-proxy/ui";
import { buildGroupOverviewChartOption } from "../groupOverviewChartOption";
import { quotaSeriesColor } from "../../helpers/quotaSeriesColors";
import type { GroupTrendPoint } from "../groupOverviewWeekly";

const points: GroupTrendPoint[] = [
  {
    date: "2026-10-01",
    label: "10-01",
    calls: 120,
    weeklyPercent: 80,
    weeklyPercents: { code_week: 80, spark: 95 },
  },
  {
    date: "2026-10-02",
    label: "10-02",
    calls: 90,
    weeklyPercent: 70,
    weeklyPercents: { code_week: 70, spark: null },
  },
];

const series = [
  { id: "code_week", label: "代码：周" },
  { id: "spark", label: "Spark <周>" },
];

type Series = {
  type: string;
  itemStyle: { color: unknown };
  lineStyle?: { color: string };
  data: unknown[];
};

describe("group overview chart colours", () => {
  test("calls are gradient bars in the requests colour and weekly lines use the quota palette", () => {
    const palette = chartPalette(false);
    const option = buildGroupOverviewChartOption({ points, series, isDark: false, callsLabel: "Calls" });
    const [calls, codeWeek, spark] = option.series as Series[];

    expect(calls.type).toBe("bar");
    expect(calls.itemStyle.color).toEqual(chartGradient(palette.metric.requests, 1, 0.55));
    expect(calls.data).toEqual([120, 90]);
    // 与账号详情的额度线同一份配色：第一条粉色，第二条与它分得开。
    expect(codeWeek.lineStyle?.color).toBe(hueHex("pink", false));
    expect(spark.lineStyle?.color).toBe(quotaSeriesColor(1, false));
    expect(spark.data).toEqual([95, null]);
  });

  test("dark mode uses the lighter step of the same hues", () => {
    const option = buildGroupOverviewChartOption({ points, series, isDark: true, callsLabel: "Calls" });
    const [calls, codeWeek] = option.series as Series[];

    expect(calls.itemStyle.color).toEqual(chartGradient(chartPalette(true).metric.requests, 1, 0.55));
    expect(codeWeek.lineStyle?.color).toBe(hueHex("pink", true));
  });

  test("tooltip dots match the series and names from the backend are escaped", () => {
    const option = buildGroupOverviewChartOption({ points, series, isDark: false, callsLabel: "Calls" });
    const formatter = (option.tooltip as { formatter: (params: unknown) => string }).formatter;
    const html = formatter([
      { seriesIndex: 0, seriesName: "Calls", value: 120, axisValueLabel: "10-01" },
      { seriesIndex: 2, seriesName: "Spark <周>", value: 95.4 },
    ]);

    expect(html).toContain(`background:${chartPalette(false).metric.requests}`);
    expect(html).toContain(`background:${quotaSeriesColor(1, false)}`);
    expect(html).toContain("<b>120</b>");
    expect(html).toContain("<b>95%</b>");
    expect(html).toContain("Spark &lt;周&gt;");
  });
});
