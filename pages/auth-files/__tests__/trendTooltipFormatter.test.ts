import { describe, expect, test } from "vitest";
import { formatTrendChartTooltip } from "../components/trendTooltipFormatter";

describe("formatTrendChartTooltip", () => {
  const mockFormatCurrency = (val: number) => `$${val.toFixed(4)}`;

  test("filters out items with null, undefined, empty, or '--' values", () => {
    const params = [
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span style='color:blue'>●</span>",
        seriesName: "请求数",
        seriesType: "bar",
        seriesIndex: 0,
        value: 115,
      },
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span style='color:pink'>●</span>",
        seriesName: "费用消耗",
        seriesType: "line",
        seriesIndex: 1,
        value: 0.4295,
      },
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span style='color:green'>●</span>",
        seriesName: "Claude 已消耗",
        seriesType: "line",
        seriesIndex: 2,
        value: null,
      },
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span style='color:purple'>●</span>",
        seriesName: "Gemini Flash 已消耗",
        seriesType: "line",
        seriesIndex: 3,
        value: undefined,
      },
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span style='color:teal'>●</span>",
        seriesName: "Gemini Image 已消耗",
        seriesType: "line",
        seriesIndex: 4,
        value: "--",
      },
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span style='color:red'>●</span>",
        seriesName: "Claude and GPT... 已消耗",
        seriesType: "line",
        seriesIndex: 5,
        value: 21,
      },
    ];

    const html = formatTrendChartTooltip(params, mockFormatCurrency);
    expect(html).toContain("09-04 16:00");
    expect(html).toContain("请求数");
    expect(html).toContain("115");
    expect(html).toContain("费用消耗");
    expect(html).toContain("$0.4295");
    expect(html).toContain("Claude and GPT... 已消耗");
    expect(html).toContain("21.0%");
    expect(html).not.toContain("Claude 已消耗");
    expect(html).not.toContain("Gemini Flash 已消耗");
    expect(html).not.toContain("Gemini Image 已消耗");
    expect(html).not.toContain("--");
  });

  test("draws each dot in the series colour when colours are given", () => {
    const params = [
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span>echarts-marker</span>",
        seriesName: "请求数",
        seriesType: "bar",
        seriesIndex: 0,
        value: 115,
      },
      {
        axisValueLabel: "09-04 16:00",
        marker: "<span>echarts-marker</span>",
        seriesName: "费用消耗",
        seriesType: "line",
        seriesIndex: 1,
        value: 0.4295,
      },
    ];

    const html = formatTrendChartTooltip(params, mockFormatCurrency, ["#3b82f6", "#f59e0b"]);
    // 请求柱是渐变填充，echarts 自带的 marker 只取渐变一端；给了序列颜色就按序列颜色画色块。
    expect(html).toContain("background:#3b82f6");
    expect(html).toContain("background:#f59e0b");
    expect(html).not.toContain("echarts-marker");
  });

  test("falls back to the echarts marker for series without a colour", () => {
    const html = formatTrendChartTooltip(
      [{ axisValueLabel: "09-04", marker: "<i>m</i>", seriesName: "额度", seriesIndex: 2, value: 12 }],
      mockFormatCurrency,
      ["#3b82f6", "#f59e0b"],
    );
    expect(html).toContain("<i>m</i>");
    expect(html).toContain("12.0%");
  });

  test("returns empty title when all series are empty", () => {
    const params = [
      {
        axisValueLabel: "09-04 17:00",
        seriesName: "Claude",
        value: null,
      },
    ];
    const html = formatTrendChartTooltip(params, mockFormatCurrency);
    expect(html).toBe("09-04 17:00");
  });
});
