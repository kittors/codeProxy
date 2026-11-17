import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ClusterHost, ClusterStatus, NodeDatabase, NodeSnapshot } from "@code-proxy/api-client";
import { ClusterNodesSection } from "../ClusterNodesSection";
import { CLUSTER_NODES_POLL_MS } from "../useClusterNodes";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn<() => Promise<ClusterStatus>>(),
  getConfig: vi.fn<() => Promise<Record<string, unknown>>>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    clusterApi: { getStatus: mocks.getStatus },
    configApi: { ...actual.configApi, getConfig: mocks.getConfig },
  };
});

const DECLARED = { capabilities: { "node-metrics": true } };
const NOW = new Date("2026-11-16T22:40:00Z");
const GB = 1024 ** 3;

const snapshot = (over: Partial<NodeSnapshot> = {}): NodeSnapshot => ({
  schema: 1,
  collected_at: "2026-11-16T22:39:58Z",
  version: "dev-1234567",
  started_at: "2026-11-16T20:25:30Z",
  gomaxprocs: 7,
  goroutines: 812,
  host: {
    cpus: 8,
    cpu: {
      window_seconds: 30,
      busy_cores: 0.76,
      steal_cores: 2.76,
      iowait_cores: 0.02,
      idle_cores: 4.46,
    },
    load: { load1: 6.5, load5: 6.1, load15: 5.8 },
    memory: { total_bytes: 8 * GB, available_bytes: 2 * GB },
  },
  cgroup: {
    path: "/system.slice/clirelay2-8318.service",
    cpu: {
      usage_usec: 1,
      nr_periods: 1,
      nr_throttled: 0,
      throttled_usec: 0,
      quota_cores: 7,
      window: { seconds: 30, usage_cores: 2.55, throttled_ratio: 0.12, throttled_seconds: 0.3 },
    },
    memory: { current_bytes: 1.5 * GB, high_bytes: 3 * GB, max_bytes: 4 * GB },
  },
  disks: [
    {
      mount: "/",
      fs_type: "xfs",
      paths: [
        { use: "root", path: "/" },
        { use: "workdir", path: "/opt/clirelay2" },
        { use: "logs", path: "/opt/clirelay2/logs" },
      ],
      // 2 GB reserved for root: 14 GB used and 16 GB available is 47%.
      total_bytes: 32 * GB,
      used_bytes: 14 * GB,
      available_bytes: 16 * GB,
      inodes_total: 15_728_064,
      inodes_free: 15_634_235,
      growth: { window_seconds: 3600, used_delta_bytes: 120 * 1024 ** 2 },
    },
  ],
  traffic: {
    in_flight: 120,
    window_seconds: 60,
    requests: 840,
    bytes_in: 60 * 1024 * 1024,
    bytes_out: 6 * 1024 * 1024,
  },
  egress: {
    breaker_enabled: true,
    breaker_open: 0,
    auth_rejected: 0,
    unreachable: 0,
    check: { total: 4, unreachable: 0 },
  },
  db: { rtt_ms: 8.2 },
  redis: { role: "cluster", rtt_ms: 7.9 },
  shared_redis: { configured: true, available: true },
  ...over,
});

// Production on 2026-11-17, as the leader's probe read it.
const database = (over: Partial<NodeDatabase> = {}): NodeDatabase => ({
  collected_at: "2026-11-16T22:39:50Z",
  engine: "postgres",
  version: "15.19",
  started_at: "2026-11-16T06:44:00Z",
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
  wal: { bytes: 80 * 1024 ** 2, files: 5, max_wal_size_bytes: GB, max_slot_keep_bytes: 4 * GB },
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

const databaseHost = (): ClusterHost => ({
  host_id: "db-149",
  role: "database",
  snapshot_at: "2026-11-16T22:39:55Z",
  age_seconds: 5,
  snapshot: {
    ...snapshot({ cgroup: undefined, egress: undefined, db: undefined, redis: undefined, shared_redis: undefined }),
    host: {
      cpus: 4,
      cpu: { window_seconds: 30, busy_cores: 0.6, steal_cores: 0.05, iowait_cores: 0.01, idle_cores: 3.34 },
      load: { load1: 0.8, load5: 0.7, load15: 0.6 },
      memory: { total_bytes: 8_322_871_296, available_bytes: 3_310_891_008 },
    },
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
});

const clusterStatus = (): ClusterStatus => ({
  enabled: true,
  node_id: "n155",
  is_leader: true,
  active_nodes: 2,
  nodes: [
    {
      node_id: "n149",
      version: "dev-1234567",
      started_at: "2026-11-16T21:00:00Z",
      last_seen: "2026-11-16T22:39:57Z",
      leader: false,
      active: true,
      self: false,
      snapshot: snapshot({
        egress: { breaker_enabled: true, breaker_open: 1, auth_rejected: 1, unreachable: 0 },
        shared_redis: { configured: true, available: false, since: "2026-11-16T22:39:00Z" },
      }),
      snapshot_at: "2026-11-16T22:39:57Z",
    },
    {
      node_id: "n155",
      version: "dev-1234567",
      advertise: "198.51.100.20",
      started_at: "2026-11-16T20:25:31Z",
      last_seen: "2026-11-16T22:39:58Z",
      leader: true,
      active: true,
      self: true,
      snapshot: snapshot({ database: database() }),
      snapshot_at: "2026-11-16T22:39:58Z",
    },
    {
      node_id: "n43",
      version: "dev-0000000",
      started_at: "2026-11-15T10:00:00Z",
      last_seen: "2026-11-16T22:30:00Z",
      leader: false,
      active: false,
      self: false,
    },
  ],
  hosts: [databaseHost()],
});

describe("ClusterNodesSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    mocks.getStatus.mockReset();
    mocks.getConfig.mockReset();
    mocks.getConfig.mockResolvedValue(DECLARED);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("puts each node in a compact card with what needs attention on top", async () => {
    mocks.getStatus.mockResolvedValue(clusterStatus());
    render(<ClusterNodesSection enabled />);

    const self = await screen.findByRole("group", { name: "n155" });
    expect(screen.getByText("Server nodes")).toBeInTheDocument();
    expect(screen.getByText("2 / 3 online")).toBeInTheDocument();
    // All three node cards need attention: two lose most of their CPU to steal, one is offline.
    expect(screen.getByText("Critical: 3")).toBeInTheDocument();

    const card = within(self);
    expect(card.getByText("Leader")).toBeInTheDocument();
    expect(card.getByText("This node")).toBeInTheDocument();
    expect(card.getByText("dev-1234567 · 198.51.100.20")).toBeInTheDocument();
    // The badge names the worst problem, and counts the rest.
    const pill = card.getByTestId("health-pill");
    expect(pill).toHaveAttribute("data-level", "critical");
    expect(within(pill).getByText("Steal 78%")).toBeInTheDocument();
    expect(within(pill).getByText("+1")).toBeInTheDocument();

    const cpu = within(card.getByTestId("node-cpu"));
    expect(cpu.getByText("CPU · 8 vCPU")).toBeInTheDocument();
    expect(cpu.getByText("44%")).toBeInTheDocument();
    expect(cpu.getByText("0.76 cores")).toBeInTheDocument();
    expect(cpu.getByText("Steal 2.76 cores · 78%")).toBeInTheDocument();
    expect(cpu.getByRole("img", { name: "Running 0.76 cores, steal 2.76 cores, 8 vCPU in all" })).toBeInTheDocument();
    expect(cpu.getByTestId("node-cpu-busy")).toHaveStyle({ width: "9.5%" });
    expect(cpu.getByTestId("node-cpu-steal")).toHaveStyle({ left: "9.5%", width: "34.5%" });

    const memory = within(card.getByTestId("node-memory"));
    expect(memory.getByText("6.0 GB / 8.0 GB")).toBeInTheDocument();
    expect(memory.getByText("75%")).toBeInTheDocument();
    expect(memory.getByText("2.0 GB available")).toBeInTheDocument();

    const disk = within(card.getByTestId("node-disk"));
    expect(disk.getByText("Disk · /")).toBeInTheDocument();
    expect(disk.getByText("47%")).toBeInTheDocument();
    expect(disk.getByText("16.0 GB free")).toBeInTheDocument();
    expect(disk.getByText("14.0 GB / 32.0 GB")).toBeInTheDocument();

    const slot = within(card.getByTestId("node-slot"));
    expect(slot.getByText("Slot · 7.00 cores")).toBeInTheDocument();
    expect(slot.getByText("36%")).toBeInTheDocument();
    expect(slot.getByText("2.55 cores")).toBeInTheDocument();
    expect(slot.getByText("Throttled 12% · memory 1.5 GB / 3.0 GB")).toBeInTheDocument();
    expect(card.getByTestId("node-slot")).toHaveAttribute("data-level", "warn");

    expect(card.getByText("Load 6.50 · 6.10 · 5.80")).toBeInTheDocument();
    expect(card.getByText("In flight: 120")).toBeInTheDocument();
    expect(card.getByText("840 req/min")).toBeInTheDocument();
    expect(card.getByText("In 1.00 MB/s")).toBeInTheDocument();
    expect(card.getByText("Out 102.4 KB/s")).toBeInTheDocument();
    expect(card.getByText("Egress OK")).toBeInTheDocument();
    expect(card.getByText("DB 8.2 ms")).toBeInTheDocument();
    expect(card.getByText("Shared Redis 7.9 ms")).toBeInTheDocument();
    expect(card.getByText(/Up 2h 14m/)).toBeInTheDocument();
    expect(card.getByText("Heartbeat 2s ago")).toBeInTheDocument();

    const n149 = within(screen.getByRole("group", { name: "n149" }));
    expect(n149.getByTestId("chip-egress")).toHaveAttribute("data-level", "critical");
    expect(n149.getByText("Egress Breaker open: 1")).toBeInTheDocument();
    expect(n149.getByText("Shared Redis lost")).toBeInTheDocument();

    const offline = within(screen.getByRole("group", { name: "n43" }));
    expect(within(offline.getByTestId("health-pill")).getByText("Offline")).toBeInTheDocument();
    expect(offline.getByText("Heartbeat 10m ago")).toBeInTheDocument();
    expect(offline.getByText(/No resource data from this node yet/)).toBeInTheDocument();
    expect(offline.queryByRole("button", { name: /Details/ })).toBeNull();
  });

  test("opens a node's details in place", async () => {
    mocks.getStatus.mockResolvedValue(clusterStatus());
    render(<ClusterNodesSection enabled />);
    const card = within(await screen.findByRole("group", { name: "n155" }));

    const toggle = card.getByRole("button", { name: /Details/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(card.queryByTestId("node-details")).toBeNull();
    fireEvent.click(toggle);
    expect(card.getByRole("button", { name: /Less/ })).toHaveAttribute("aria-expanded", "true");

    const details = within(card.getByTestId("node-details"));
    expect(details.getByText("Needs attention")).toBeInTheDocument();
    expect(details.getByText("Throttled 12%")).toBeInTheDocument();
    const disk = within(details.getByTestId("disk-row"));
    expect(disk.getByText("/")).toBeInTheDocument();
    expect(disk.getByText("xfs")).toBeInTheDocument();
    expect(disk.getByText("Root · Program · Logs")).toBeInTheDocument();
    expect(disk.getByText("14.0 GB of 32.0 GB used · 16.0 GB free")).toBeInTheDocument();
    expect(disk.getByText("Inodes 0.6%")).toBeInTheDocument();
    // 120 MB an hour with 16 GB free: about six days, which is information, not a warning.
    expect(disk.getByText("+120.0 MB over 1h 0m, full in ~6d")).toBeInTheDocument();
    expect(details.getByTestId("disk-row")).toHaveAttribute("data-level", "normal");
    expect(details.getByText("clirelay2-8318.service")).toBeInTheDocument();
    expect(details.getByText("4 / 4 reachable")).toBeInTheDocument();
    expect(details.getByText("812")).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: /Less/ }));
    expect(card.queryByTestId("node-details")).toBeNull();
  });

  test("warns when a disk is filling, on the card and in the badge", async () => {
    const status = clusterStatus();
    const self = status.nodes[1];
    self.snapshot = snapshot({
      host: { cpus: 8, cpu: { window_seconds: 30, busy_cores: 0.5, steal_cores: 0, iowait_cores: 0, idle_cores: 7.5 } },
      cgroup: undefined,
      disks: [
        ...(snapshot().disks ?? []),
        {
          mount: "/tmp",
          fs_type: "tmpfs",
          paths: [{ use: "body_cache", path: "/tmp/clirelay-body" }],
          total_bytes: 2 * GB,
          used_bytes: 1.86 * GB,
          available_bytes: 0.14 * GB,
        },
      ],
    });
    mocks.getStatus.mockResolvedValue(status);
    render(<ClusterNodesSection enabled />);
    const card = within(await screen.findByRole("group", { name: "n155" }));

    expect(within(card.getByTestId("health-pill")).getByText("Disk /tmp 93% full")).toBeInTheDocument();
    const disk = card.getByTestId("node-disk");
    expect(disk).toHaveAttribute("data-level", "critical");
    expect(within(disk).getByText("Disk · /tmp")).toBeInTheDocument();
    expect(within(disk).getByText("143.4 MB free")).toBeInTheDocument();
    expect(within(disk).getByText("1.9 GB / 2.0 GB · 1 more")).toBeInTheDocument();
  });

  test("shows the database next to the nodes", async () => {
    mocks.getStatus.mockResolvedValue(clusterStatus());
    render(<ClusterNodesSection enabled />);
    const card = within(await screen.findByRole("group", { name: "Database" }));

    expect(card.getByText("db-149")).toBeInTheDocument();
    expect(card.getByText(/^PostgreSQL 15\.19 · 536\.0 MB database · Up 15h 56m$/)).toBeInTheDocument();
    expect(within(card.getByTestId("health-pill")).getByText("Healthy")).toBeInTheDocument();

    const connections = within(card.getByTestId("db-connections"));
    expect(connections.getByText("19 / 200")).toBeInTheDocument();
    expect(connections.getByText("10%")).toBeInTheDocument();
    expect(connections.getByText("0 active · 18 idle · 0 in tx")).toBeInTheDocument();
    const hostDisk = within(card.getByTestId("db-host-disk"));
    expect(hostDisk.getByText("Host disk · /")).toBeInTheDocument();
    expect(hostDisk.getByText("64%")).toBeInTheDocument();
    expect(hostDisk.getByText("13.7 GB free")).toBeInTheDocument();
    const wal = within(card.getByTestId("db-wal"));
    expect(wal.getByText("80.0 MB")).toBeInTheDocument();
    expect(wal.getByText("Slot holds 814.5 KB of 4.0 GB")).toHaveAttribute("title", "clirelay_walarchive");
    const cache = within(card.getByTestId("db-throughput"));
    expect(cache.getByText("99.8%")).toBeInTheDocument();
    expect(cache.getByText("12.0 tx/s")).toBeInTheDocument();

    expect(card.getByText("pg_receivewal · streaming")).toBeInTheDocument();
    expect(card.getByText("Longest tx 0s")).toBeInTheDocument();
    expect(card.getByText("Lock waits: 0")).toBeInTheDocument();
    expect(card.getByText("XID age 90K")).toBeInTheDocument();
    expect(card.getByText("Queried by n155 10s ago")).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: /Details/ }));
    const details = within(card.getByTestId("database-details"));
    expect(details.getByText("19 / 200 (3 reserved)")).toBeInTheDocument();
    expect(details.getByTestId("slot-row")).toHaveAttribute("data-level", "normal");
    expect(details.getByText("Active · reserved")).toBeInTheDocument();
    expect(details.getByText("db-149 · reported 5s ago")).toBeInTheDocument();
    expect(details.getByText("Root · Database data")).toBeInTheDocument();
  });

  test("says how to see the database host's disk when no host reports", async () => {
    mocks.getStatus.mockResolvedValue({ ...clusterStatus(), hosts: undefined });
    render(<ClusterNodesSection enabled />);
    const hostDisk = within(await screen.findByTestId("db-host-disk"));
    expect(hostDisk.getByText("Not reported")).toBeInTheDocument();
    expect(hostDisk.getByText("Deploy clirelay-hostagent to see it")).toBeInTheDocument();
  });

  test("flags a database the leader cannot query", async () => {
    const status = clusterStatus();
    const leader = status.nodes[1];
    if (leader.snapshot) {
      leader.snapshot.database = database({ error: "timeout", last_ok_at: "2026-11-16T22:38:00Z" });
    }
    mocks.getStatus.mockResolvedValue(status);
    render(<ClusterNodesSection enabled />);
    const card = within(await screen.findByRole("group", { name: "Database" }));
    expect(within(card.getByTestId("health-pill")).getByText("Query timed out")).toBeInTheDocument();
    expect(card.getByText("Query failed (Timeout); showing data from 2m ago")).toBeInTheDocument();
  });

  test("an older backend without disks, the database or hosts still draws its nodes", async () => {
    const status = clusterStatus();
    const self = status.nodes[1];
    self.snapshot = snapshot({ disks: undefined });
    mocks.getStatus.mockResolvedValue({ ...status, hosts: undefined });
    render(<ClusterNodesSection enabled />);
    const card = within(await screen.findByRole("group", { name: "n155" }));
    const disk = within(card.getByTestId("node-disk"));
    expect(disk.getByText("Disk")).toBeInTheDocument();
    expect(disk.getByText("No disk data from this backend")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Database" })).toBeNull();
  });

  test("asks nothing and shows nothing when the backend does not declare node-metrics", async () => {
    mocks.getConfig.mockResolvedValue({ capabilities: { alerts: true } });
    const { container } = render(<ClusterNodesSection enabled />);

    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_NODES_POLL_MS * 2);
    });
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("asks nothing when the declarations cannot be read", async () => {
    const { ApiError } =
      await vi.importActual<typeof import("@code-proxy/api-client")>("@code-proxy/api-client");
    mocks.getConfig.mockRejectedValue(new ApiError({ message: "Forbidden", status: 403 }));
    const { container } = render(<ClusterNodesSection enabled />);

    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_NODES_POLL_MS);
    });
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("stops asking when a node without the endpoint answers despite the declaration", async () => {
    const { ApiError } =
      await vi.importActual<typeof import("@code-proxy/api-client")>("@code-proxy/api-client");
    mocks.getStatus.mockRejectedValue(new ApiError({ message: "Not Found", status: 404 }));
    const { container } = render(<ClusterNodesSection enabled />);

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_NODES_POLL_MS * 2);
    });
    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  test("keeps the last nodes on a failed refresh and says so", async () => {
    mocks.getStatus
      .mockResolvedValueOnce(clusterStatus())
      .mockRejectedValueOnce(new Error("network down"));
    render(<ClusterNodesSection enabled />);
    await screen.findByRole("group", { name: "n155" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_NODES_POLL_MS);
    });
    expect(
      await screen.findByText("The last refresh failed; showing the previous data."),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "n155" })).toBeInTheDocument();
  });

  test("shows the membership and host errors next to this node", async () => {
    const status = clusterStatus();
    mocks.getStatus.mockResolvedValue({
      ...status,
      nodes: status.nodes.filter((node) => node.self),
      nodes_error: "cluster: list nodes: timeout",
      hosts: undefined,
      hosts_error: "relation \"cluster_hosts\" does not exist",
    });
    render(<ClusterNodesSection enabled />);
    expect(
      await screen.findByText(
        "The membership table cannot be read, so only this node is shown: cluster: list nodes: timeout",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cannot read the host reports: relation \"cluster_hosts\" does not exist")).toBeInTheDocument();
  });

  test("asks nothing while disabled", async () => {
    mocks.getStatus.mockResolvedValue(clusterStatus());
    render(<ClusterNodesSection enabled={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_NODES_POLL_MS);
    });
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).toBeNull();
  });
});
