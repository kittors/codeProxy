import { describe, expect, test } from "vitest";
import { normalizeMonitorOverview, type ChartDataResponse } from "@code-proxy/api-client";
import { escapeHtml, tooltipHtml } from "../charts/chartBase";
import { bandIndexFor, latencyBandLabel, mergeLatencyBands } from "../charts/latencyOption";
import { legacyChartDataToOverview, legacyKeyHint } from "../model/legacyOverview";
import { computePointDelta, computeRelativeDelta, formatDelta } from "../model/monitorDelta";
import {
  formatMonitorBucketLabel,
  formatMonitorBucketRange,
  formatMonitorCost,
  formatMonitorCount,
  formatMonitorDuration,
  formatMonitorRate,
  formatMonitorStamp,
} from "../model/monitorFormat";
import { computeMonitorHealth } from "../model/monitorHealth";
import {
  hasMonitorFilters,
  parseMonitorViewQuery,
  toggleMonitorFilter,
  writeMonitorViewQuery,
} from "../model/monitorQueryState";
import { carryForward, elapsedWindowMinutes } from "../model/monitorSeries";

const overviewWith = (raw: Record<string, unknown>) => normalizeMonitorOverview(raw);

const totals = (fields: Record<string, number>) => ({
  requests: 0,
  success: 0,
  failed: 0,
  success_rate: 0,
  latency_avg_ms: 0,
  ...fields,
});

describe("monitor formatting", () => {
  test("keeps exact counts until they get long", () => {
    expect(formatMonitorCount(17790)).toBe("17,790");
    expect(formatMonitorCount(2_192_476_734)).toBe("2.19B");
  });

  test("writes durations at the precision that matters", () => {
    expect(formatMonitorDuration(850)).toBe("850ms");
    expect(formatMonitorDuration(9_830)).toBe("9.83s");
    expect(formatMonitorDuration(31_100)).toBe("31.1s");
    expect(formatMonitorDuration(125_000)).toBe("2m 05s");
    expect(formatMonitorDuration(71_059)).toBe("1m 11s");
  });

  test("rounds before choosing a unit, so no value reads 1000ms or 1m 60s", () => {
    expect(formatMonitorDuration(999.6)).toBe("1.00s");
    expect(formatMonitorDuration(9_996)).toBe("10.0s");
    expect(formatMonitorDuration(59_960)).toBe("1m 00s");
    expect(formatMonitorDuration(119_600)).toBe("2m 00s");
  });

  test("keeps small costs and rates readable", () => {
    expect(formatMonitorCost(0.0046)).toBe("$0.0046");
    expect(formatMonitorCost(79.934)).toBe("$79.93");
    expect(formatMonitorCost(0)).toBe("$0.00");
    expect(formatMonitorRate(0.19)).toBe("0.19");
    expect(formatMonitorRate(1.43)).toBe("1.4");
    expect(formatMonitorRate(0)).toBe("0");
  });

  test("labels buckets on the server's wall clock, not the browser's", () => {
    const stamp = "2026-10-07T13:00:00+08:00";
    expect(formatMonitorBucketLabel(stamp, 3600)).toBe("13:00");
    expect(formatMonitorBucketLabel(stamp, 3 * 3600)).toBe("10/07 13:00");
    expect(formatMonitorBucketLabel("2026-10-07T00:00:00+08:00", 86400)).toBe("10/07");
    expect(formatMonitorBucketRange(stamp, 3600)).toBe("10/07 13:00 – 14:00");
    expect(formatMonitorBucketRange("2026-10-07T23:00:00+08:00", 3600)).toBe("10/07 23:00 – 00:00");
    expect(formatMonitorStamp(stamp)).toBe("10/07 13:00");
  });
});

describe("period-over-period deltas", () => {
  test("colours by whether the change is good, not by its sign", () => {
    expect(computeRelativeDelta(120, 100, "lower-is-better").tone).toBe("bad");
    expect(computeRelativeDelta(80, 100, "lower-is-better").tone).toBe("good");
    expect(computeRelativeDelta(120, 100, "neutral").tone).toBe("neutral");
    expect(computeRelativeDelta(100.2, 100, "lower-is-better").direction).toBe("flat");
  });

  test("has no baseline when the previous period was empty", () => {
    const delta = computeRelativeDelta(50, 0, "neutral");
    expect(delta.noBaseline).toBe(true);
    expect(formatDelta(delta)).toBe("");
  });

  test("compares percentages in points", () => {
    const delta = computePointDelta(99.5, 99.8, true, "higher-is-better");
    expect(delta.tone).toBe("bad");
    expect(formatDelta(delta)).toBe("−0.30pt");
    expect(computePointDelta(0, 100, false, "higher-is-better").noBaseline).toBe(true);
  });

  test("writes very large growth as a multiple", () => {
    expect(formatDelta(computeRelativeDelta(5287, 100, "neutral"))).toBe("×53");
    expect(formatDelta(computeRelativeDelta(150, 100, "neutral"))).toBe("+50.0%");
  });
});

describe("health score", () => {
  const channel = (label: string, requests: number, rate: number) => ({
    key: label.toLowerCase(),
    label,
    requests,
    success_rate: rate,
  });

  test("is idle without traffic", () => {
    const report = computeMonitorHealth(overviewWith({}));
    expect(report).toEqual({ score: null, level: "idle", checks: [] });
  });

  test("is healthy when everything is fine", () => {
    const report = computeMonitorHealth(
      overviewWith({
        summary: {
          current: totals({
            requests: 1000,
            success: 999,
            failed: 1,
            success_rate: 99.9,
            latency_avg_ms: 1000,
          }),
          previous: totals({ requests: 900, latency_avg_ms: 1000 }),
        },
        channels: { rows: [channel("A", 600, 99.9), channel("B", 400, 99.9)], total: 2 },
      }),
    );
    expect(report.level).toBe("healthy");
    expect(report.score).toBe(100);
    expect(report.checks.map((check) => check.level)).toEqual(["ok", "ok", "ok"]);
  });

  test("weights a failing channel by the traffic it carries", () => {
    const small = computeMonitorHealth(
      overviewWith({
        summary: { current: totals({ requests: 1000, success_rate: 99.5 }), previous: totals({}) },
        channels: { rows: [channel("Big", 950, 100), channel("Small", 50, 80)], total: 2 },
      }),
    );
    const big = computeMonitorHealth(
      overviewWith({
        summary: { current: totals({ requests: 1000, success_rate: 99.5 }), previous: totals({}) },
        channels: { rows: [channel("Big", 950, 80), channel("Small", 50, 100)], total: 2 },
      }),
    );
    expect(small.checks[1].level).toBe("warn");
    expect(big.checks[1].level).toBe("critical");
    expect(big.checks[1].values.worst).toBe("Big");
    expect(big.score!).toBeLessThan(small.score!);
    expect(big.level).toBe("warning");
  });

  test("uses the same thresholds as the channel status dots", () => {
    const report = computeMonitorHealth(
      overviewWith({
        summary: { current: totals({ requests: 1000, success_rate: 99.5 }), previous: totals({}) },
        // 98% is amber in the channel table, so the health check must not call it fine.
        channels: { rows: [channel("Amber", 500, 98), channel("Green", 500, 100)], total: 2 },
      }),
    );
    expect(report.checks[1].level).toBe("warn");
  });

  test("ignores channels with too few requests to judge", () => {
    const report = computeMonitorHealth(
      overviewWith({
        summary: { current: totals({ requests: 1000, success_rate: 99.9 }), previous: totals({}) },
        channels: { rows: [channel("Main", 997, 100), channel("Tiny", 3, 33.3)], total: 2 },
      }),
    );
    expect(report.checks[1].level).toBe("ok");
  });

  test("is at risk whenever the success rate itself is critical", () => {
    const report = computeMonitorHealth(
      overviewWith({
        summary: {
          current: totals({ requests: 100, failed: 20, success_rate: 80, latency_avg_ms: 900 }),
          previous: totals({ requests: 100, latency_avg_ms: 1000 }),
        },
        channels: { rows: [channel("A", 100, 80)], total: 1 },
      }),
    );
    expect(report.level).toBe("critical");
  });

  test("flags latency that got much slower than the previous period", () => {
    const report = computeMonitorHealth(
      overviewWith({
        summary: {
          current: totals({ requests: 100, success_rate: 100, latency_avg_ms: 3000 }),
          previous: totals({ requests: 100, latency_avg_ms: 1000 }),
        },
        channels: { rows: [channel("A", 100, 100)], total: 1 },
      }),
    );
    expect(report.checks[2]).toMatchObject({ key: "latency", level: "critical", score: 0 });
    expect(report.checks[2].values.change).toBe("+200%");
  });

  test("leaves checks without data out of the score instead of zeroing them", () => {
    const report = computeMonitorHealth(
      overviewWith({
        summary: { current: totals({ requests: 10, success_rate: 100 }), previous: totals({}) },
      }),
    );
    expect(report.checks.map((check) => check.level)).toEqual(["ok", "unknown", "unknown"]);
    expect(report.score).toBe(100);
  });
});

describe("view query in the address bar", () => {
  test("round-trips and keeps defaults out of the link", () => {
    const query = parseMonitorViewQuery(
      new URLSearchParams("range=7d&model=a&model=b&channel=Team%20A%2C%20Codex"),
    );
    expect(query).toEqual({
      range: "7d",
      consumers: [],
      models: ["a", "b"],
      channels: ["Team A, Codex"],
    });
    expect(writeMonitorViewQuery(query, new URLSearchParams("tab=x")).toString()).toBe(
      "tab=x&range=7d&model=a&model=b&channel=Team+A%2C+Codex",
    );
    const defaults = parseMonitorViewQuery(new URLSearchParams(""));
    expect(writeMonitorViewQuery(defaults, new URLSearchParams()).toString()).toBe("");
  });

  test("falls back to the default range and drops duplicates", () => {
    const query = parseMonitorViewQuery(new URLSearchParams("range=90d&model=a&model=a&model=%20"));
    expect(query.range).toBe("24h");
    expect(query.models).toEqual(["a"]);
  });

  test("toggles one value in one dimension", () => {
    const base = parseMonitorViewQuery(new URLSearchParams(""));
    const on = toggleMonitorFilter(base, "models", "gpt");
    expect(on.models).toEqual(["gpt"]);
    expect(hasMonitorFilters(on)).toBe(true);
    expect(toggleMonitorFilter(on, "models", "gpt").models).toEqual([]);
  });
});

describe("series helpers", () => {
  const point = (requests: number, rate: number) =>
    ({ ...totals({ requests, success_rate: rate }), start: "" }) as never;

  test("carries ratios across empty buckets and backfills the start", () => {
    const series = [point(0, 0), point(10, 90), point(0, 0), point(5, 100)];
    expect(
      carryForward(
        series,
        (p: { success_rate: number }) => p.success_rate,
        (p: { requests: number }) => p.requests > 0,
        100,
      ),
    ).toEqual([90, 90, 90, 100]);
  });

  test("averages over the time that has actually passed", () => {
    const overview = overviewWith({
      generated_at: "2026-10-07T06:00:00+08:00",
      range: {
        start: "2026-10-07T00:00:00+08:00",
        end: "2026-10-08T00:00:00+08:00",
        step_seconds: 3600,
      },
    });
    expect(elapsedWindowMinutes(overview)).toBe(360);
  });
});

describe("legacy chart-data adapter", () => {
  const chart: ChartDataResponse = {
    daily_series: [
      {
        date: "2026-10-06",
        requests: 100,
        failed_requests: 2,
        input_tokens: 1000,
        output_tokens: 200,
      },
      {
        date: "2026-10-07",
        requests: 50,
        failed_requests: 0,
        input_tokens: 500,
        output_tokens: 100,
      },
    ],
    model_distribution: [
      { model: "small", requests: 10, tokens: 100 },
      { model: "big", requests: 140, tokens: 1700 },
    ],
    hourly_tokens: [],
    hourly_models: [],
    apikey_distribution: [
      { api_key: "sk-legacy-XXXXXXXXXXXX9876", name: "", requests: 90, tokens: 900 },
      { api_key: "sk-legacy-XXXXXXXXXXXX1234", name: "Alice", requests: 60, tokens: 600 },
    ],
  };

  test("maps what chart-data has into the overview shape", () => {
    const overview = legacyChartDataToOverview(chart, "7d");
    expect(overview.summary.current).toMatchObject({
      requests: 150,
      failed: 2,
      total_tokens: 1800,
    });
    expect(overview.series.map((p) => p.start)).toEqual([
      "2026-10-06T00:00:00",
      "2026-10-07T00:00:00",
    ]);
    expect(overview.range).toMatchObject({ key: "7d", step_seconds: 86400 });
    expect(overview.models.rows.map((row) => row.label)).toEqual(["big", "small"]);
    expect(overview.channels.rows).toEqual([]);
  });

  test("never keeps a raw API key", () => {
    const overview = legacyChartDataToOverview(chart, "7d");
    expect(overview.consumers.rows.map((row) => row.label)).toEqual(["sk-…9876", "Alice"]);
    expect(JSON.stringify(overview)).not.toContain("sk-legacy-XXXXXXXXXXXX");
    expect(legacyKeyHint("short")).toBe("");
  });
});

describe("latency bands", () => {
  const bounds = [
    100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000,
    20000, 25000, 30000, 40000, 50000, 60000, 90000, 120000, 180000, 300000, 600000,
  ];

  test("merges fine bins into display bands without splitting one", () => {
    const histogram = Array.from({ length: bounds.length + 1 }, () => 1);
    const bands = mergeLatencyBands(bounds, histogram);
    expect(bands.reduce((sum, band) => sum + band.count, 0)).toBe(bounds.length + 1);
    expect(bands[0].count).toBe(6); // <100 … 400–500 are all below 0.5s
    expect(bands[bands.length - 1].count).toBe(2); // 300–600s and ≥600s
    expect(bands.map(latencyBandLabel).slice(0, 3)).toEqual(["<0.5s", "0.5s–1s", "1s–2s"]);
    expect(latencyBandLabel(bands[bands.length - 1])).toBe("≥5m");
  });

  test("places a percentile in its half-open band", () => {
    const bands = mergeLatencyBands(bounds, []);
    expect(bandIndexFor(bands, 999)).toBe(1);
    expect(bandIndexFor(bands, 1000)).toBe(2);
    expect(bandIndexFor(bands, 0)).toBe(-1);
  });
});

describe("tooltip markup", () => {
  test("escapes names that come from data", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    const html = tooltipHtml("<b>model</b>", [{ label: "<i>", value: "1" }]);
    expect(html).not.toContain("<b>model</b>");
    expect(html).toContain("&lt;b&gt;model&lt;/b&gt;");
  });
});
