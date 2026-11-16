import { apiClient } from "../client/client";

/*
 * GET /v0/management/cluster：后端所在集群的成员表，每个节点带一份资源快照（CliRelay
 * internal/nodemetrics，每 5 秒采一次，随心跳写进 cluster_nodes）。单节点也返回自己这一条。
 *
 * 面板会自动更新到最新 release，旧后端也会拿到新面板：后端在 GET /config 的 capabilities 里
 * 声明了 node-metrics（ConfigCapabilities.nodeMetrics）才有快照，没声明就不请求这个接口。
 *
 * 快照里每一段都可能缺：非 Linux、cgroup v1 主机、读不到的文件，后端都留空而不是报错。
 */

/** 最近约 30 秒（进程更年轻时是启动以来）整机 CPU 时间按状态折成的核数。 */
export interface NodeHostCpu {
  window_seconds: number;
  /** 在跑：user + nice + system + irq + softirq。 */
  busy_cores: number;
  /** vCPU 有活要干、却被宿主机拿去跑别的的时间。 */
  steal_cores: number;
  iowait_cores: number;
  idle_cores: number;
}

export interface NodeHost {
  cpus?: number;
  cpu?: NodeHostCpu;
  load?: { load1: number; load5: number; load15: number };
  memory?: { total_bytes: number; available_bytes?: number };
}

export interface NodeCgroupCpu {
  usage_usec: number;
  nr_periods: number;
  nr_throttled: number;
  throttled_usec: number;
  /** cpu.max 折成核数；没有配额时缺省。 */
  quota_cores?: number;
  window?: {
    seconds: number;
    /** 含 steal：内核没开 CONFIG_PARAVIRT_TIME_ACCOUNTING 时 cgroup 也把被偷走的时间算在进程头上。 */
    usage_cores: number;
    throttled_ratio: number;
    throttled_seconds: number;
  };
}

export interface NodeCgroup {
  path: string;
  cpu?: NodeCgroupCpu;
  memory?: { current_bytes: number; high_bytes?: number; max_bytes?: number };
}

export interface NodeTraffic {
  in_flight: number;
  /** 下面三个数的统计跨度：约最近一分钟，进程更年轻时是启动以来。 */
  window_seconds: number;
  requests: number;
  bytes_in: number;
  bytes_out: number;
}

export interface NodeEgress {
  breaker_enabled: boolean;
  breaker_open: number;
  auth_rejected: number;
  unreachable: number;
  open_since?: string;
  check?: { total: number; unreachable: number };
}

export interface NodeRoundTrip {
  /** Redis 才有："cluster" 是集群共享 Redis，"usage" 是用量持久化的 Redis。 */
  role?: string;
  rtt_ms?: number;
  /** "timeout" 或 "error"。 */
  error?: string;
}

/** 集群共享 Redis：限流、并发槽位、会话粘性与合成 ID 靠它跨节点共享。单节点没有这一段。 */
export interface NodeSharedRedis {
  /** 集群模式但没配 cluster.redis：限额按在线节点数均分，粘性只在本节点。 */
  configured: boolean;
  /** 配了但连不上：这台已退化为本机计数。 */
  available: boolean;
  /** available 最近一次变化的时刻。 */
  since?: string;
}

export interface NodeSnapshot {
  schema: number;
  collected_at: string;
  version?: string;
  started_at: string;
  gomaxprocs: number;
  goroutines: number;
  memory_limit_bytes?: number;
  host?: NodeHost;
  cgroup?: NodeCgroup;
  traffic: NodeTraffic;
  egress?: NodeEgress;
  db?: NodeRoundTrip;
  redis?: NodeRoundTrip;
  shared_redis?: NodeSharedRedis;
}

export interface ClusterNode {
  node_id: string;
  version?: string;
  advertise?: string;
  started_at: string;
  last_seen: string;
  leader: boolean;
  /** 后端按数据库时钟判断：20 秒内心跳过且没有标记停止。 */
  active: boolean;
  self: boolean;
  snapshot?: NodeSnapshot;
  snapshot_at?: string;
}

export interface ClusterStatus {
  enabled: boolean;
  node_id: string;
  is_leader: boolean;
  active_nodes: number;
  nodes: ClusterNode[];
  /** 读成员表失败时的错误；这时 nodes 只有当前节点。 */
  nodes_error?: string;
}

export const clusterApi = {
  getStatus: (options?: { signal?: AbortSignal }) =>
    options?.signal
      ? apiClient.get<ClusterStatus>("/cluster", { signal: options.signal })
      : apiClient.get<ClusterStatus>("/cluster"),
};
