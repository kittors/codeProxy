import { describe, expect, test } from "vitest";
import type { ClusterNode, NodeSnapshot } from "@code-proxy/api-client";
import {
  formatAge,
  isSnapshotStale,
  nodeCpuView,
  nodeEgressView,
  nodeMemoryView,
  nodeSlotView,
  nodeTrafficView,
  nodeUptimeSeconds,
  roundTripLevel,
  secondsSince,
  throttleLevel,
} from "../clusterNodeView";

const NOW = Date.parse("2026-11-16T22:40:00Z");

// hk-155 on 2026-11-16 at 22:39: the host ran 0.76 cores and lost 2.76 to steal.
const snapshot: NodeSnapshot = {
  schema: 1,
  collected_at: "2026-11-16T22:39:58Z",
  version: "dev-1234567",
  started_at: "2026-11-16T20:25:30Z",
  gomaxprocs: 7,
  goroutines: 812,
  host: {
    cpus: 8,
    cpu: {
      window_seconds: 5,
      busy_cores: 0.76,
      steal_cores: 2.76,
      iowait_cores: 0.02,
      idle_cores: 4.46,
    },
    load: { load1: 6.5, load5: 6.1, load15: 5.8 },
    memory: { total_bytes: 8 * 1024 ** 3, available_bytes: 2 * 1024 ** 3 },
  },
  cgroup: {
    path: "/system.slice/clirelay2-8318.service",
    cpu: {
      usage_usec: 1,
      nr_periods: 1,
      nr_throttled: 0,
      throttled_usec: 0,
      quota_cores: 7,
      window: { seconds: 5, usage_cores: 2.55, throttled_ratio: 0.12, throttled_seconds: 0.3 },
    },
    memory: { current_bytes: 1.5 * 1024 ** 3, high_bytes: 3 * 1024 ** 3, max_bytes: 4 * 1024 ** 3 },
  },
  traffic: {
    in_flight: 120,
    window_seconds: 60,
    requests: 840,
    bytes_in: 600 * 1024 * 1024,
    bytes_out: 6 * 1024 * 1024,
  },
  egress: {
    breaker_enabled: true,
    breaker_open: 0,
    auth_rejected: 0,
    unreachable: 0,
    check: { total: 4, unreachable: 0 },
  },
  db: { rtt_ms: 0.8 },
  redis: { role: "usage", rtt_ms: 0.4 },
};

const node = (over: Partial<ClusterNode> = {}): ClusterNode => ({
  node_id: "n155",
  started_at: "2026-11-16T20:25:31Z",
  last_seen: "2026-11-16T22:39:58Z",
  leader: true,
  active: true,
  self: true,
  snapshot,
  snapshot_at: "2026-11-16T22:39:58Z",
  ...over,
});

describe("clusterNodeView", () => {
  test("splits host CPU into running and steal cores and flags a host losing most of its time", () => {
    const cpu = nodeCpuView(snapshot);
    expect(cpu).not.toBeNull();
    expect(cpu?.busyPct).toBeCloseTo(9.5);
    expect(cpu?.stealPct).toBeCloseTo(34.5);
    expect(cpu?.stealShare).toBeCloseTo(2.76 / 3.52);
    // 44% busy is fine on its own; 78% of the runnable time going to steal is not.
    expect(cpu?.level).toBe("critical");

    const calm = nodeCpuView({
      ...snapshot,
      host: { ...snapshot.host, cpu: { ...snapshot.host!.cpu!, steal_cores: 0.05 } },
    });
    expect(calm?.level).toBe("normal");
    // Next to idle, the share is noise and not reported.
    const idle = nodeCpuView({
      ...snapshot,
      host: {
        ...snapshot.host,
        cpu: {
          window_seconds: 5,
          busy_cores: 0.02,
          steal_cores: 0.03,
          iowait_cores: 0,
          idle_cores: 7.95,
        },
      },
    });
    expect(idle?.stealShare).toBeNull();
    expect(idle?.level).toBe("normal");
  });

  test("leaves out what the backend could not read", () => {
    const bare: NodeSnapshot = {
      ...snapshot,
      host: undefined,
      cgroup: undefined,
      egress: undefined,
    };
    expect(nodeCpuView(bare)).toBeNull();
    expect(nodeMemoryView(bare)).toBeNull();
    expect(nodeSlotView(bare)).toBeNull();
    expect(nodeEgressView(bare)).toBeNull();
    // A host with no window yet (first sample) has CPUs but no split.
    expect(nodeCpuView({ ...snapshot, host: { cpus: 8 } })).toBeNull();
    expect(nodeMemoryView({ ...snapshot, host: { memory: { total_bytes: 1024 } } })).toBeNull();
    expect(nodeCpuView(undefined)).toBeNull();
  });

  test("reads memory, slot quota and throttling", () => {
    const memory = nodeMemoryView(snapshot);
    expect(memory).toMatchObject({
      usedBytes: 6 * 1024 ** 3,
      totalBytes: 8 * 1024 ** 3,
      pct: 75,
      level: "normal",
    });

    const slot = nodeSlotView(snapshot);
    expect(slot).toMatchObject({
      quotaCores: 7,
      usageCores: 2.55,
      throttledRatio: 0.12,
      cpuLevel: "warn",
    });
    // The soft limit (memory.high) is what reclaim starts at, so it is the one compared against.
    expect(slot?.memoryPct).toBeCloseTo(50);
    expect(slot?.memoryLimit).toBe(3 * 1024 ** 3);

    const unlimited = nodeSlotView({
      ...snapshot,
      cgroup: {
        path: "/",
        cpu: { usage_usec: 1, nr_periods: 0, nr_throttled: 0, throttled_usec: 0 },
        memory: { current_bytes: 10 },
      },
    });
    expect(unlimited).toMatchObject({
      quotaCores: null,
      usageCores: null,
      throttledRatio: null,
      memoryLimit: null,
      memoryPct: null,
    });
    expect(throttleLevel(0.3)).toBe("critical");
    expect(throttleLevel(0.01)).toBe("normal");
  });

  test("turns window counts into rates", () => {
    const traffic = nodeTrafficView(snapshot);
    expect(traffic).toMatchObject({ inFlight: 120, requestsPerMinute: 840 });
    expect(traffic?.bytesInPerSecond).toBeCloseTo((600 * 1024 * 1024) / 60);
    // A process that has not counted a window yet has no rate rather than an infinite one.
    expect(
      nodeTrafficView({ ...snapshot, traffic: { ...snapshot.traffic, window_seconds: 0 } }),
    ).toMatchObject({
      requestsPerMinute: null,
      bytesInPerSecond: null,
    });
  });

  test("ranks egress problems", () => {
    expect(nodeEgressView(snapshot)).toMatchObject({ state: "ok", level: "normal" });
    expect(
      nodeEgressView({
        ...snapshot,
        egress: { ...snapshot.egress!, breaker_open: 2, auth_rejected: 2 },
      }),
    ).toMatchObject({
      state: "open",
      open: 2,
      level: "critical",
    });
    expect(
      nodeEgressView({
        ...snapshot,
        egress: { ...snapshot.egress!, check: { total: 4, unreachable: 1 } },
      }),
    ).toMatchObject({ state: "degraded", unreachable: 1, total: 4, level: "warn" });
    expect(
      nodeEgressView({ ...snapshot, egress: { ...snapshot.egress!, breaker_enabled: false } })
        ?.state,
    ).toBe("off");
    expect(roundTripLevel({ error: "timeout" })).toBe("critical");
    expect(roundTripLevel({ rtt_ms: 80 })).toBe("warn");
    expect(roundTripLevel(undefined)).toBe("normal");
  });

  test("measures ages against the clock and never goes negative", () => {
    expect(secondsSince("2026-11-16T22:39:30Z", NOW)).toBe(30);
    expect(secondsSince("2026-11-16T22:41:00Z", NOW)).toBe(0);
    expect(secondsSince(undefined, NOW)).toBeNull();
    expect(secondsSince("not a time", NOW)).toBeNull();
    // The process start from the snapshot wins over the membership row's registration.
    expect(nodeUptimeSeconds(node(), NOW)).toBe(
      Date.parse("2026-11-16T22:40:00Z") / 1000 - Date.parse("2026-11-16T20:25:30Z") / 1000,
    );
    expect(nodeUptimeSeconds(node({ snapshot: undefined }), NOW)).toBe(
      (NOW - Date.parse("2026-11-16T20:25:31Z")) / 1000,
    );
    expect(isSnapshotStale(node(), NOW)).toBe(false);
    expect(isSnapshotStale(node({ snapshot_at: "2026-11-16T22:39:00Z" }), NOW)).toBe(true);
    expect(formatAge(45)).toBe("45s");
    expect(formatAge(12 * 60)).toBe("12m");
    expect(formatAge(3 * 3600 + 5 * 60)).toBe("3h 5m");
    expect(formatAge(2 * 86400 + 4 * 3600)).toBe("2d 4h");
  });
});
