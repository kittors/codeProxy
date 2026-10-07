import { describe, expect, test } from "vitest";
import { CHART_CATEGORICAL, chartGradient, chartPalette } from "@code-proxy/ui";
import { createSparklineOption } from "../DashboardMetrics";
import { throughputTenantColor } from "../ThroughputTrendChart";

describe("dashboard chart colours", () => {
  test("sparklines are a solid identity-colour line over a same-colour fading area", () => {
    const color = chartPalette(false).metric.requests;
    const option = createSparklineOption([{ label: "Mon", value: 3 }], color) as {
      series: { lineStyle: { color: string }; areaStyle: { color: unknown } }[];
    };

    expect(option.series[0].lineStyle.color).toBe(color);
    expect(option.series[0].areaStyle.color).toEqual(chartGradient(color, 0.24, 0));
  });

  test("tenant lines never borrow the aggregate RPM / TPM colours or the failure red", () => {
    for (const isDark of [false, true]) {
      const palette = chartPalette(isDark);
      const colors = Array.from({ length: 7 }, (_, index) => throughputTenantColor(index, isDark));

      expect(new Set(colors).size).toBe(7);
      for (const color of colors) {
        expect(color).not.toBe(palette.metric.rpm);
        expect(color).not.toBe(palette.metric.tpm);
        expect(color).not.toBe(palette.primary);
        expect(color).not.toBe(palette.err);
        expect(color).not.toBe(CHART_CATEGORICAL[CHART_CATEGORICAL.length - 1]);
      }
    }
    // 深色模式取同一色相的亮一档。
    expect(throughputTenantColor(0, true)).not.toBe(throughputTenantColor(0, false));
  });
});
