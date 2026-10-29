import { describe, expect, test } from "vitest";
import { normalizeMonitorOverview } from "@code-proxy/api-client";
import { createTrafficTrendOption, type TrendLabels } from "../charts/trafficTrendOption";
import { formatMonitorCacheRate } from "../model/monitorFormat";

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
    "cache_read",
    "cache_write",
  ].map((key) => [key, `<${key}>`]),
) as TrendLabels;

type TrendOption = {
  series: { id: string; data: (number | null)[] }[];
  tooltip: { formatter: (params: unknown) => string };
};

const tokensOption = (series: Record<string, unknown>[]) =>
  createTrafficTrendOption(
    normalizeMonitorOverview({ range: { key: "24h", step_seconds: 3600 }, series }),
    "tokens",
    false,
    labels,
    {},
  ) as unknown as TrendOption;

describe("monitor cache rate", () => {
  test("plots the hit rate and leaves a gap where no request reported its cache use", () => {
    const option = tokensOption([
      {
        start: "2026-10-30T00:00:00+08:00",
        requests: 2,
        input_tokens: 100,
        cached_tokens: 400,
        cache_rate: 40,
        cache_hit_rate: 40,
        cache_read_tokens: 400,
        cache_write_tokens: 50,
      },
      {
        start: "2026-10-30T01:00:00+08:00",
        requests: 2,
        input_tokens: 100,
        cache_rate: 0,
        cache_hit_rate: null,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      },
    ]);
    expect(option.series.find((item) => item.id === "cache_rate")?.data).toEqual([40, null]);

    const known = option.tooltip.formatter([{ dataIndex: 0 }]);
    expect(known).toContain("&lt;cache_read&gt;");
    expect(known).toContain("&lt;cache_write&gt;");
    expect(known).not.toContain("&lt;cached&gt;");
    expect(known).toContain("40.0%");
    // Unknown is "—", not 0%.
    const unknown = option.tooltip.formatter([{ dataIndex: 1 }]);
    expect(unknown).toContain("—");
    expect(unknown).not.toContain("0.0%");
  });

  test("an older backend keeps its token share and its single cached figure", () => {
    const option = tokensOption([
      {
        start: "2026-10-30T00:00:00+08:00",
        requests: 2,
        input_tokens: 100,
        cached_tokens: 30,
        cache_rate: 30,
      },
      { start: "2026-10-30T01:00:00+08:00", requests: 0, input_tokens: 0, cache_rate: 0 },
    ]);
    expect(option.series.find((item) => item.id === "cache_rate")?.data).toEqual([30, null]);
    const html = option.tooltip.formatter([{ dataIndex: 0 }]);
    expect(html).toContain("&lt;cached&gt;");
    expect(html).not.toContain("&lt;cache_read&gt;");
  });

  test("the tokens tile shows the hit rate, or — when nobody reported it", () => {
    const totals = (raw: Record<string, unknown>) =>
      normalizeMonitorOverview({ summary: { current: raw } }).summary.current;
    expect(
      formatMonitorCacheRate(totals({ input_tokens: 100, cache_rate: 12, cache_hit_rate: 12 })),
    ).toBe("12.0%");
    expect(
      formatMonitorCacheRate(totals({ input_tokens: 100, cache_rate: 0, cache_hit_rate: null })),
    ).toBe("—");
    expect(formatMonitorCacheRate(totals({ input_tokens: 100, cache_rate: 30 }))).toBe("30.0%");
    expect(formatMonitorCacheRate(totals({ input_tokens: 0, cache_rate: 0 }))).toBe("—");
  });
});
