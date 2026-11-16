import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ClusterStatus, NodeSnapshot } from "@code-proxy/api-client";
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
      window: { seconds: 30, usage_cores: 2.55, throttled_ratio: 0.12, throttled_seconds: 0.3 },
    },
    memory: { current_bytes: 1.5 * 1024 ** 3, high_bytes: 3 * 1024 ** 3, max_bytes: 4 * 1024 ** 3 },
  },
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
      started_at: "2026-11-16T20:25:31Z",
      last_seen: "2026-11-16T22:39:58Z",
      leader: true,
      active: true,
      self: true,
      snapshot: snapshot(),
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

  test("draws one card per node with running and stolen CPU apart", async () => {
    mocks.getStatus.mockResolvedValue(clusterStatus());
    render(<ClusterNodesSection enabled />);

    const self = await screen.findByRole("group", { name: "n155" });
    expect(screen.getByText("Server nodes")).toBeInTheDocument();
    expect(screen.getByText("2 / 3 online")).toBeInTheDocument();

    const card = within(self);
    expect(card.getByText("Leader")).toBeInTheDocument();
    expect(card.getByText("This node")).toBeInTheDocument();
    expect(card.getByText("Online")).toBeInTheDocument();
    expect(card.getByText("CPU · 8 vCPU")).toBeInTheDocument();
    expect(card.getByText("0.76 cores")).toBeInTheDocument();
    expect(card.getByText("2.76 cores")).toBeInTheDocument();
    expect(card.getByText("Steal is 78% of the time the CPUs wanted to run")).toBeInTheDocument();
    expect(
      card.getByRole("img", { name: "Running 0.76 cores, steal 2.76 cores, 8 vCPU in all" }),
    ).toBeInTheDocument();
    expect(card.getByTestId("node-cpu-busy")).toHaveStyle({ width: "9.5%" });
    expect(card.getByTestId("node-cpu-steal")).toHaveStyle({ left: "9.5%", width: "34.5%" });
    // Slot: quota, usage including steal, and a 12% throttle share as a warning.
    expect(card.getByText("7.00 cores")).toBeInTheDocument();
    expect(card.getByText("2.55 cores")).toBeInTheDocument();
    expect(card.getByText("12%")).toBeInTheDocument();
    expect(card.getByText("1.5 GB / 3.0 GB")).toBeInTheDocument();
    // Traffic over the last minute.
    expect(card.getByText("120")).toBeInTheDocument();
    expect(card.getByText("840")).toBeInTheDocument();
    expect(card.getByText("In 1.00 MB/s")).toBeInTheDocument();
    expect(card.getByText("Out 102.4 KB/s")).toBeInTheDocument();
    expect(card.getByText("6.50 / 6.10 / 5.80")).toBeInTheDocument();
    expect(card.getByText("Shared Redis round trip")).toBeInTheDocument();
    expect(card.getByText("8.2 ms")).toBeInTheDocument();
    expect(card.getByText("OK")).toBeInTheDocument();
    expect(card.getByText("Connected")).toBeInTheDocument();

    const n149 = within(screen.getByRole("group", { name: "n149" }));
    expect(n149.getByText("Breaker open: 1")).toBeInTheDocument();
    expect(n149.getByText("Unreachable, counting locally")).toBeInTheDocument();
    const offline = within(screen.getByRole("group", { name: "n43" }));
    expect(offline.getByText("Offline")).toBeInTheDocument();
    expect(offline.getByText("10m ago")).toBeInTheDocument();
    expect(offline.getByText(/No resource data from this node yet/)).toBeInTheDocument();
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

  test("shows the membership error next to this node", async () => {
    const status = clusterStatus();
    mocks.getStatus.mockResolvedValue({
      ...status,
      nodes: status.nodes.filter((node) => node.self),
      nodes_error: "cluster: list nodes: timeout",
    });
    render(<ClusterNodesSection enabled />);
    expect(
      await screen.findByText(
        "The membership table cannot be read, so only this node is shown: cluster: list nodes: timeout",
      ),
    ).toBeInTheDocument();
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
