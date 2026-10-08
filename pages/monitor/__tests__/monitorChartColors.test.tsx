import { render } from "@testing-library/react";
import { Timer, Waypoints } from "lucide-react";
import { describe, expect, test } from "vitest";
import { normalizeMonitorOverview, normalizeMonitorRealtime } from "@code-proxy/api-client";
import { chartGradient, chartPalette } from "@code-proxy/ui";
import { createLatencyOption } from "../charts/latencyOption";
import { createRealtimeOption } from "../charts/realtimeOption";
import { createTrafficTrendOption, trendSeriesColor } from "../charts/trafficTrendOption";
import { MonitorCardTitle } from "../components/MonitorCardTitle";

const BOUNDS = [500, 1000, 2000, 5000];

const overview = normalizeMonitorOverview({
  range: { key: "24h", step_seconds: 3600 },
  series: [
    { start: "2026-10-07T12:00:00+08:00", requests: 10, success: 9, failed: 1, cost: 0.5 },
    { start: "2026-10-07T13:00:00+08:00", requests: 20, success: 20, failed: 0, cost: 1.5 },
  ],
  latency: {
    bounds_ms: BOUNDS,
    total: { samples: 30, p50_ms: 800, p95_ms: 4000, histogram: [2, 20, 5, 3, 0] },
    first_token: { samples: 0, histogram: [] },
  },
});

const labels = Object.fromEntries(
  [
    "success",
    "failed",
    "success_rate",
    "input",
    "output",
    "cache_rate",
    "latency_avg",
    "first_token_avg",
    "cost",
    "cumulative_cost",
    "requests",
    "tokens",
    "reasoning",
    "cached",
  ].map((key) => [key, key]),
) as Parameters<typeof createTrafficTrendOption>[3];

type Bar = { id: string; itemStyle: { color: unknown }; emphasis?: { itemStyle: { color: unknown } } };

describe("monitor center chart colours", () => {
  test("cumulative cost is a cost-family orange, not the indigo that means latency", () => {
    for (const isDark of [false, true]) {
      const palette = chartPalette(isDark);
      expect(trendSeriesColor("cumulative_cost", isDark)).toBe(palette.metric.costTotal);
      expect(trendSeriesColor("cumulative_cost", isDark)).not.toBe(palette.metric.latency);
      expect(trendSeriesColor("cumulative_cost", isDark)).not.toBe(palette.metric.cost);
    }
  });

  test("trend bars are same-colour gradients that firm up on hover", () => {
    const palette = chartPalette(false);
    const requests = createTrafficTrendOption(overview, "requests", false, labels, {}) as {
      series: Bar[];
    };
    const success = requests.series.find((item) => item.id === "success");
    const failed = requests.series.find((item) => item.id === "failed");
    expect(success?.itemStyle.color).toEqual(chartGradient(palette.metric.requests, 1, 0.6));
    expect(success?.emphasis?.itemStyle.color).toEqual(chartGradient(palette.metric.requests, 1, 0.88));
    expect(failed?.itemStyle.color).toEqual(chartGradient(palette.err, 1, 0.6));

    const cost = createTrafficTrendOption(overview, "cost", false, labels, {}) as { series: Bar[] };
    expect(cost.series.find((item) => item.id === "cost")?.itemStyle.color).toEqual(
      chartGradient(palette.metric.cost, 1, 0.6),
    );
  });

  test("the live bars and the latency histogram keep their identity colours as gradients", () => {
    const palette = chartPalette(false);
    const realtime = normalizeMonitorRealtime({
      points: [
        { start: "2026-10-07T13:00:00+08:00", requests: 3, success: 3 },
        { start: "2026-10-07T13:01:00+08:00", requests: 2, success: 2 },
      ],
    });
    const live = createRealtimeOption(realtime.points, false, {
      success: "s",
      failed: "f",
      tokens: "t",
      latency: "l",
      inProgress: "p",
    }) as { series: (Bar & { data: { itemStyle?: { color: unknown } }[] })[] };
    expect(live.series[0].itemStyle.color).toEqual(chartGradient(palette.metric.requests, 1, 0.6));
    // 还没走完的这一分钟整体更淡，仍是同一个色相。
    expect(live.series[0].data[1].itemStyle?.color).toEqual(
      chartGradient(palette.metric.requests, 0.45, 0.2),
    );

    const latency = createLatencyOption(overview.latency.total, BOUNDS, false, {
      requests: "r",
      share: "s",
    }) as { series: { data: { itemStyle: { color: unknown } }[] }[] };
    const fills = latency.series[0].data.map((item) => item.itemStyle.color);
    expect(fills).toContainEqual(chartGradient(palette.metric.latency, 1, 0.6));
    expect(fills).toContainEqual(chartGradient(palette.metric.latency, 0.42, 0.2));
  });

  test("card title icons are neutral: colour belongs to the data and to states", () => {
    const { container: latency } = render(<MonitorCardTitle icon={Timer} label="Latency" />);
    expect(latency.querySelector("svg")?.getAttribute("class")).toContain("text-ink-3");

    const { container: flows } = render(<MonitorCardTitle icon={Waypoints} label="Flows" />);
    expect(flows.querySelector("svg")?.getAttribute("class")).toContain("text-ink-3");
  });
});
