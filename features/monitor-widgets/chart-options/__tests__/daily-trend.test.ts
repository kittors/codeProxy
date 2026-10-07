import { describe, expect, test } from "vitest";
import { chartPalette } from "@code-proxy/ui";
import { createDailyTrendOption, dailyTrendColors } from "../daily-trend";

const build = (isDark: boolean) =>
  createDailyTrendOption({
    dailySeries: [
      { label: "10/1", requests: 10, inputTokens: 5000, outputTokens: 800 },
      { label: "10/2", requests: 12, inputTokens: 6000, outputTokens: 900 },
    ],
    dailyLegendSelected: {},
    legendKeys: { input: "daily_input", output: "daily_output", requests: "daily_requests" },
    labels: { input: "Input", output: "Output", requests: "Requests", tokenAxis: "Token", requestAxis: "Requests" },
    isDark,
  });

type Series = {
  name: string;
  itemStyle?: { color: unknown; borderColor?: string };
  lineStyle?: { color: string };
};

describe("daily usage trend colours", () => {
  test("token bars are the token identity colour (violet) and requests are blue", () => {
    for (const isDark of [false, true]) {
      const palette = chartPalette(isDark);
      const colors = dailyTrendColors(isDark);
      const series = build(isDark).series as Series[];
      const output = series.find((item) => item.name === "Output");
      const input = series.find((item) => item.name === "Input");
      const requests = series.find((item) => item.name === "Requests");

      expect(colors.output).toBe(palette.metric.tokens);
      expect(colors.requests).toBe(palette.metric.requests);
      expect(requests?.lineStyle?.color).toBe(palette.metric.requests);
      // 输入 / 输出两组柱子前后重叠：渐变两端都是不透明色，叠在一起不会混出第三种颜色。
      const stops = (item?: Series) => {
        const gradient = item?.itemStyle?.color as { colorStops: { color: string }[] } | undefined;
        return (gradient?.colorStops ?? []).map((stop) => stop.color);
      };
      expect(stops(output)[0]).toBe(palette.metric.tokens);
      expect(stops(input)[0]).toBe(colors.input);
      for (const color of [...stops(output), ...stops(input)]) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("the input tint is a lighter, opaque step of the token colour", () => {
    expect(dailyTrendColors(false).input).toMatch(/^#[0-9a-f]{6}$/);
    expect(dailyTrendColors(false).input).not.toBe(dailyTrendColors(false).output);
    expect(dailyTrendColors(true).input).not.toBe(dailyTrendColors(false).input);
  });

  test("no grey bars or ink line are left", () => {
    // 只看数据序列和图例色板；提示框气泡本来就是墨色实心块。
    const option = build(false);
    const serialized = JSON.stringify({ series: option.series, color: option.color });
    for (const grey of ["#e6e6e6", "#a3a3a3", "#767676", "#0d0d0d"]) {
      expect(serialized).not.toContain(grey);
    }
  });
});
