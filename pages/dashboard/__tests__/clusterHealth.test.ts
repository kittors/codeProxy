import { describe, expect, test } from "vitest";
import type { ClusterNode, NodeSnapshot } from "@code-proxy/api-client";
import { nodeIssues } from "../clusterHealth";

const NOW = Date.parse("2026-11-17T08:00:00Z");
const GB = 1024 ** 3;

const snapshot = (over: Partial<NodeSnapshot> = {}): NodeSnapshot => ({
  schema: 1,
  collected_at: "2026-11-17T07:59:58Z",
  started_at: "2026-11-17T02:00:00Z",
  gomaxprocs: 7,
  goroutines: 800,
  host: {
    cpus: 8,
    cpu: { window_seconds: 30, busy_cores: 0.9, steal_cores: 0.05, iowait_cores: 0, idle_cores: 7.05 },
    load: { load1: 1, load5: 1, load15: 1 },
    memory: { total_bytes: 8 * GB, available_bytes: 6 * GB },
  },
  disks: [
    {
      mount: "/",
      fs_type: "xfs",
      paths: [{ use: "root", path: "/" }],
      total_bytes: 32 * GB,
      used_bytes: 15 * GB,
      available_bytes: 17 * GB,
    },
  ],
  traffic: { in_flight: 1, window_seconds: 60, requests: 60, bytes_in: 1, bytes_out: 1 },
  egress: { breaker_enabled: true, breaker_open: 0, auth_rejected: 0, unreachable: 0 },
  db: { rtt_ms: 4.5 },
  redis: { role: "cluster", rtt_ms: 3.3 },
  shared_redis: { configured: true, available: true },
  ...over,
});

const node = (over: Partial<ClusterNode> = {}): ClusterNode => ({
  node_id: "n143",
  started_at: "2026-11-17T02:00:00Z",
  last_seen: "2026-11-17T07:59:58Z",
  leader: false,
  active: true,
  self: false,
  snapshot: snapshot(),
  snapshot_at: "2026-11-17T07:59:58Z",
  ...over,
});

const keys = (n: ClusterNode) =>
  nodeIssues(n, NOW).map((issue) => `${issue.level}:${issue.key.replace("cluster_nodes.", "")}`);

describe("nodeIssues", () => {
  test("a healthy node has none", () => {
    expect(keys(node())).toEqual([]);
  });

  test("an offline node is offline, whatever its last snapshot says", () => {
    expect(keys(node({ active: false, snapshot: snapshot({ db: { error: "timeout" } }) }))).toEqual(["critical:issue_offline"]);
  });

  test("puts the critical problems first and keeps the cause order within a level", () => {
    const n = node({
      snapshot_at: "2026-11-17T07:59:00Z",
      snapshot: snapshot({
        // hk-155 on 2026-11-16: most of the wanted CPU time went to steal.
        host: {
          cpus: 8,
          cpu: { window_seconds: 30, busy_cores: 0.76, steal_cores: 2.76, iowait_cores: 0, idle_cores: 4.48 },
          memory: { total_bytes: 8 * GB, available_bytes: 1 * GB },
        },
        disks: [
          {
            mount: "/",
            paths: [{ use: "root", path: "/" }],
            total_bytes: 32 * GB,
            used_bytes: 15 * GB,
            available_bytes: 17 * GB,
          },
          {
            mount: "/tmp",
            fs_type: "tmpfs",
            paths: [{ use: "body_cache", path: "/tmp/clirelay-body" }],
            total_bytes: 2 * GB,
            used_bytes: 1.8 * GB,
            available_bytes: 0.2 * GB,
          },
        ],
        egress: { breaker_enabled: true, breaker_open: 0, auth_rejected: 0, unreachable: 1, check: { total: 4, unreachable: 1 } },
        db: { rtt_ms: 120 },
        redis: { role: "cluster", error: "timeout" },
        shared_redis: { configured: true, available: false },
      }),
    });
    expect(keys(n)).toEqual([
      "critical:issue_steal",
      "critical:issue_disk_space",
      "critical:issue_redis_timeout",
      "critical:issue_shared_redis_down",
      "warn:issue_stale",
      "warn:issue_memory",
      "warn:issue_egress_degraded",
      "warn:issue_db_slow",
    ]);
    const disk = nodeIssues(n, NOW).find((issue) => issue.key.endsWith("issue_disk_space"));
    expect(disk?.params).toEqual({ mount: "/tmp", pct: "90%" });
  });

  test("warns when a disk fills within days at the current rate", () => {
    // 62.5% used: past the 60% a fill forecast needs before it counts.
    const n = node({
      snapshot: snapshot({
        disks: [
          {
            mount: "/",
            paths: [{ use: "root", path: "/" }],
            total_bytes: 32 * GB,
            used_bytes: 20 * GB,
            available_bytes: 12 * GB,
            growth: { window_seconds: 3600, used_delta_bytes: 0.28 * GB },
          },
        ],
      }),
    });
    const issues = nodeIssues(n, NOW);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "warn", key: "cluster_nodes.issue_disk_fill", params: { mount: "/", time: "43h" } });
  });

  test("names a cluster without a shared Redis and an open egress breaker", () => {
    const n = node({
      snapshot: snapshot({
        egress: { breaker_enabled: true, breaker_open: 2, auth_rejected: 2, unreachable: 0 },
        shared_redis: { configured: false, available: false },
      }),
    });
    expect(keys(n)).toEqual(["critical:issue_egress_open", "warn:issue_shared_redis_none"]);
  });
});
