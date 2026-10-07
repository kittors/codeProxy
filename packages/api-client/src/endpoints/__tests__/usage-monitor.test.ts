import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: { get: getMock },
}));

describe("usageMonitorApi", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  test("repeats multi-value filters instead of joining them with commas", async () => {
    const { usageMonitorApi } = await import("../usage-monitor");
    getMock.mockResolvedValue({});
    await usageMonitorApi.getOverview({
      range: "7d",
      consumers: ["eu:alice", "key:ci"],
      models: ["gpt-x"],
      channels: ["Team A, Codex"],
    });
    expect(getMock).toHaveBeenCalledWith(
      "/usage/monitor/overview?range=7d&consumer=eu%3Aalice&consumer=key%3Aci&model=gpt-x&channel=Team+A%2C+Codex",
      { signal: undefined },
    );

    await usageMonitorApi.getRealtime({});
    expect(getMock).toHaveBeenLastCalledWith("/usage/monitor/realtime", { signal: undefined });
  });

  test("fills a complete, null-free shape from an empty or malformed payload", async () => {
    const { normalizeMonitorOverview } = await import("../usage-monitor");
    for (const raw of [
      null,
      {},
      { series: "nope", models: { rows: "x" }, latency: { bounds_ms: [1, 2] } },
    ]) {
      const overview = normalizeMonitorOverview(raw);
      expect(overview.series).toEqual([]);
      expect(overview.models).toEqual({ rows: [], total: 0 });
      expect(overview.filters).toEqual({ models: [], channels: [], consumers: [] });
      expect(overview.range.key).toBe("24h");
      expect(overview.summary.current.requests).toBe(0);
      // Histograms always have one cell more than the bounds.
      expect(overview.latency.total.histogram.length).toBe(overview.latency.bounds_ms.length + 1);
    }
  });

  test("keeps real values and coerces bad numbers to zero", async () => {
    const { normalizeMonitorOverview } = await import("../usage-monitor");
    const overview = normalizeMonitorOverview({
      range: { key: "6h", step_seconds: 300 },
      summary: { current: { requests: "12", failed: 1, success_rate: "NaN" } },
      models: {
        rows: [{ key: "gpt-x", label: "gpt-x", requests: 12, trend: [1, "2", null] }],
        total: 0,
      },
      flows: {
        nodes: [{ id: "model:gpt-x", label: "gpt-x", layer: "model" }, { id: "" }],
        links: [
          { source: "consumer:a", target: "model:gpt-x", requests: 3 },
          { source: "consumer:b", target: "model:gpt-x", requests: 0 },
        ],
      },
      filters: { models: [{ value: "gpt-x", label: "gpt-x", requests: 12 }, { value: "" }] },
      recent_failures: [{ id: 7, streaming: "yes" }],
    });
    expect(overview.range).toMatchObject({ key: "6h", step_seconds: 300 });
    expect(overview.summary.current).toMatchObject({ requests: 12, failed: 1, success_rate: 0 });
    // total is never smaller than the rows actually returned.
    expect(overview.models.total).toBe(1);
    expect(overview.models.rows[0].trend).toEqual([1, 2, 0]);
    expect(overview.flows.nodes).toHaveLength(1);
    expect(overview.flows.links).toHaveLength(1);
    expect(overview.filters.models).toHaveLength(1);
    expect(overview.recent_failures[0].streaming).toBe(false);
  });

  test("normalises the realtime strip", async () => {
    const { normalizeMonitorRealtime } = await import("../usage-monitor");
    const realtime = normalizeMonitorRealtime({
      points: [{ start: "2026-10-07T13:00:00+08:00", requests: 3 }],
      current_rpm: 2,
      last_5m: { requests: 9, success_rate: 100 },
    });
    expect(realtime.points[0]).toMatchObject({
      start: "2026-10-07T13:00:00+08:00",
      requests: 3,
      failed: 0,
    });
    expect(realtime.current_rpm).toBe(2);
    expect(realtime.peak_tpm).toBe(0);
    expect(realtime.last_5m).toMatchObject({ requests: 9, success_rate: 100 });
  });
});
