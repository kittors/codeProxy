import { describe, expect, test } from "vitest";
import type { ClusterHost, ClusterStatus, NodeDatabase, NodeSnapshot } from "@code-proxy/api-client";
import { databaseView, findDatabase } from "../clusterDatabaseView";

const NOW = Date.parse("2026-11-17T08:00:00Z");
const GB = 1024 ** 3;

// Production on 2026-11-17 (PostgreSQL 15.19 on 149), read with the probe's queries.
export const productionDatabase = (over: Partial<NodeDatabase> = {}): NodeDatabase => ({
  collected_at: "2026-11-17T07:59:50Z",
  engine: "postgres",
  version: "15.19",
  started_at: "2026-11-16T16:03:22Z",
  in_recovery: false,
  size_bytes: 561_995_111,
  xid_age: 89_696,
  connections: { max: 200, reserved: 3, client: 19, active: 0, idle: 18, idle_in_transaction: 0, wal_senders: 1 },
  activity: {
    longest_transaction_seconds: 0,
    long_transactions: 0,
    longest_idle_in_transaction_seconds: 0,
    lock_waits: 0,
    longest_lock_wait_seconds: 0,
  },
  wal: { bytes: 83_886_080, files: 5, max_wal_size_bytes: GB, max_slot_keep_bytes: 4 * GB },
  slots: [
    {
      name: "clirelay_walarchive",
      type: "physical",
      active: true,
      wal_status: "reserved",
      retained_bytes: 834_064,
      safe_wal_size_bytes: 4_310_910_448,
    },
  ],
  replication: [
    { name: "pg_receivewal", state: "streaming", sync_state: "async", sent_lag_bytes: 0, flush_lag_bytes: 834_064, reply_age_seconds: 0.9 },
  ],
  window: { seconds: 300, commits: 3_600, rollbacks: 2, blocks_hit: 550_000, blocks_read: 1_100, deadlocks: 0, temp_bytes: 0 },
  ...over,
});

const leaderSnapshot = (database?: NodeDatabase): NodeSnapshot => ({
  schema: 1,
  collected_at: "2026-11-17T07:59:58Z",
  started_at: "2026-11-17T02:00:00Z",
  gomaxprocs: 4,
  goroutines: 300,
  traffic: { in_flight: 0, window_seconds: 60, requests: 0, bytes_in: 0, bytes_out: 0 },
  database,
});

const dbHost = (over: Partial<ClusterHost> = {}): ClusterHost => ({
  host_id: "db-149",
  role: "database",
  snapshot_at: "2026-11-17T07:59:55Z",
  age_seconds: 5,
  snapshot: {
    schema: 1,
    collected_at: "2026-11-17T07:59:55Z",
    started_at: "2026-11-17T00:00:00Z",
    gomaxprocs: 4,
    goroutines: 9,
    traffic: { in_flight: 0, window_seconds: 60, requests: 0, bytes_in: 0, bytes_out: 0 },
    host: {
      cpus: 4,
      cpu: { window_seconds: 30, busy_cores: 0.6, steal_cores: 0.05, iowait_cores: 0.01, idle_cores: 3.34 },
      load: { load1: 0.8, load5: 0.7, load15: 0.6 },
      memory: { total_bytes: 8_322_871_296, available_bytes: 3_310_891_008 },
    },
    // 149's root: 41.4 GB, 26.7 GB used, 14.7 GB available; the data directory lives on it.
    disks: [
      {
        mount: "/",
        fs_type: "ext4",
        paths: [
          { use: "root", path: "/" },
          { use: "database", path: "/opt/clirelay-data/pg" },
        ],
        total_bytes: 41_429_692_416,
        used_bytes: 26_669_805_568,
        available_bytes: 14_743_109_632,
        inodes_total: 5_160_960,
        inodes_free: 4_821_091,
      },
    ],
  },
  ...over,
});

const status = (database?: NodeDatabase, hosts?: ClusterHost[]): ClusterStatus => ({
  enabled: true,
  node_id: "n43",
  is_leader: true,
  active_nodes: 2,
  nodes: [
    {
      node_id: "n43",
      started_at: "2026-11-17T02:00:00Z",
      last_seen: "2026-11-17T07:59:58Z",
      leader: true,
      active: true,
      self: true,
      snapshot: leaderSnapshot(database),
    },
    {
      node_id: "n143",
      started_at: "2026-11-17T06:00:00Z",
      last_seen: "2026-11-17T07:59:57Z",
      leader: false,
      active: true,
      self: false,
      snapshot: leaderSnapshot(),
    },
  ],
  hosts,
});

describe("clusterDatabaseView", () => {
  test("reads production as healthy", () => {
    const view = databaseView(status(productionDatabase(), [dbHost()]), NOW, NOW);
    expect(view).not.toBeNull();
    expect(view?.leaderId).toBe("n43");
    expect(view?.issues).toEqual([]);
    expect(view?.level).toBe("normal");
    // 19 clients of the 197 a non-superuser may open.
    expect(view?.connections).toMatchObject({ client: 19, max: 200, usable: 197 });
    expect(view?.connections?.pct).toBeCloseTo(9.6, 1);
    expect(view?.cacheHitRatio).toBeCloseTo(0.998, 3);
    expect(view?.commitsPerSecond).toBe(12);
    expect(view?.slots[0]).toMatchObject({ name: "clirelay_walarchive", level: "normal" });
    expect(view?.slots[0].keepRatio).toBeCloseTo(834_064 / (4 * GB), 6);
    expect(view?.replicas[0]).toMatchObject({ name: "pg_receivewal", state: "streaming", level: "normal" });
    expect(view?.host?.disks[0]).toMatchObject({ mount: "/", level: "normal" });
    expect(view?.host?.disks[0].pct).toBeCloseTo(64.4, 1);
  });

  test("is absent until a leader reports the database", () => {
    expect(databaseView(status(undefined, [dbHost()]), NOW, NOW)).toBeNull();
    // A stopped node's snapshot does not count.
    const stopped = status(productionDatabase());
    stopped.nodes[0].active = false;
    expect(findDatabase(stopped)).toBeNull();
  });

  test("flags a stalled archive slot, a filling host disk and long transactions", () => {
    const db = productionDatabase({
      slots: [
        {
          name: "clirelay_walarchive",
          type: "physical",
          active: false,
          wal_status: "extended",
          retained_bytes: 3.4 * GB,
          safe_wal_size_bytes: 0.6 * GB,
        },
      ],
      replication: [],
      wal: { bytes: 3.5 * GB, files: 224, max_wal_size_bytes: GB, max_slot_keep_bytes: 4 * GB },
      activity: {
        longest_transaction_seconds: 2_400,
        long_transactions: 1,
        longest_idle_in_transaction_seconds: 90,
        lock_waits: 3,
        longest_lock_wait_seconds: 12,
      },
    });
    const host = dbHost();
    const disk = host.snapshot.disks?.[0];
    if (disk) {
      disk.used_bytes = 38 * GB;
      disk.available_bytes = 1.5 * GB;
    }
    const view = databaseView(status(db, [host]), NOW, NOW);
    expect(view?.level).toBe("critical");
    const keys = view?.issues.map((issue) => `${issue.level}:${issue.key.replace("cluster_nodes.", "")}`);
    expect(keys).toEqual([
      // 85% of max_slot_wal_keep_size retained: the slot is close to being lost.
      "critical:issue_slot_inactive",
      "critical:issue_long_transaction",
      "critical:issue_disk_space",
      "warn:issue_wal",
      "warn:issue_idle_transaction",
      "warn:issue_lock_wait",
    ]);
  });

  test("keeps the last figures of a failed round and marks them", () => {
    const view = databaseView(
      status(productionDatabase({ error: "timeout", last_ok_at: "2026-11-17T07:58:20Z" })),
      NOW,
      NOW,
    );
    expect(view?.issues[0]).toMatchObject({ level: "critical", key: "cluster_nodes.issue_query_timeout" });
    expect(view?.connections?.client).toBe(19);
  });

  test("calls data that stopped arriving stale, from the database and from the host", () => {
    const old = productionDatabase({ collected_at: "2026-11-17T07:56:00Z" });
    const view = databaseView(status(old, [dbHost({ age_seconds: 100 })]), NOW, NOW - 30_000);
    expect(view?.stale).toBe(true);
    // The host's age is counted from when the response arrived: 100 s + 30 s.
    expect(view?.host?.ageSeconds).toBeCloseTo(130, 0);
    expect(view?.issues.map((issue) => issue.key)).toEqual([
      "cluster_nodes.issue_database_stale",
      "cluster_nodes.issue_host_stale",
    ]);
  });

  test("grades connections, wraparound and the cache", () => {
    const busy = databaseView(
      status(
        productionDatabase({
          connections: { max: 200, reserved: 3, client: 170, active: 130, idle: 40, idle_in_transaction: 0, wal_senders: 1 },
          xid_age: 600_000_000,
          window: { seconds: 300, commits: 100, rollbacks: 0, blocks_hit: 7_000, blocks_read: 3_000, deadlocks: 2, temp_bytes: 0 },
        }),
      ),
      NOW,
      NOW,
    );
    expect(busy?.connections?.level).toBe("warn");
    expect(busy?.xidLevel).toBe("warn");
    expect(busy?.cacheLevel).toBe("critical");
    expect(busy?.issues.map((issue) => issue.key)).toEqual([
      "cluster_nodes.issue_cache",
      "cluster_nodes.issue_connections",
      "cluster_nodes.issue_xid",
      "cluster_nodes.issue_deadlocks",
    ]);
    // Too few block reads to say anything about the cache.
    const quiet = databaseView(
      status(productionDatabase({ window: { seconds: 300, commits: 1, rollbacks: 0, blocks_hit: 10, blocks_read: 90, deadlocks: 0, temp_bytes: 0 } })),
      NOW,
      NOW,
    );
    expect(quiet?.cacheHitRatio).toBeNull();
    expect(quiet?.issues).toEqual([]);
  });
});
