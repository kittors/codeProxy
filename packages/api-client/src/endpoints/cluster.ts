import { apiClient } from "../client/client";

/*
 * GET /v0/management/cluster：后端所在集群的成员表，每个节点带一份资源快照（CliRelay
 * internal/nodemetrics，每 5 秒采一次，随心跳写进 cluster_nodes）。单节点也返回自己这一条。
 *
 * 面板会自动更新到最新 release，旧后端也会拿到新面板：后端在 GET /config 的 capabilities 里
 * 声明了 node-metrics（ConfigCapabilities.nodeMetrics）才有快照，没声明就不请求这个接口。
 *
 * 快照里每一段都可能缺：非 Linux、cgroup v1 主机、读不到的文件，后端都留空而不是报错。磁盘（disks）、
 * 数据库（主节点快照里的 database）和主机（hosts）是后来加的，同样声明了 node-metrics 的旧后端没有，
 * 面板按字段在不在来显示，不另设能力。
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

/**
 * 一个文件系统，以及它上面的哪些目录是进程要写的。用途：root（根分区，总会报告）、workdir（工作目录：
 * 二进制与 config.yaml）、auth（凭据文件）、logs、body_cache（请求体缓存，默认在临时目录，有的主机上是
 * tmpfs）、usage_spool（数据库不可用时的用量队列）、extra（运维追加的目录）；主机上报还有 database（库的
 * 数据目录）、backups。未知的用途原样显示。
 */
export interface NodeDiskPath {
  use: string;
  path: string;
}

export interface NodeDisk {
  mount: string;
  /** mountinfo 里的类型，如 xfs、ext4；tmpfs 占的是内存。 */
  fs_type?: string;
  read_only?: boolean;
  paths: NodeDiskPath[];
  total_bytes: number;
  /** 总量减空闲，和 df 的 Used 一致。 */
  used_bytes: number;
  /** 普通进程还能写的量（不含给 root 预留的块），和 df 的 Avail 一致；Use% = used / (used + available)。 */
  available_bytes: number;
  /** 没有固定 inode 表的文件系统（btrfs）不报。 */
  inodes_total?: number;
  inodes_free?: number;
  /** 最近约 1 小时（进程更年轻时是启动以来）已用量的变化；看满 10 分钟才有。 */
  growth?: { window_seconds: number; used_delta_bytes: number };
}

/** 数据库服务本身（PostgreSQL），只有主节点每 30 秒查一次，放在它的快照里。 */
export interface NodeDatabase {
  collected_at: string;
  /** 最近一轮查询失败："timeout" 或 "error"。这时下面的数是 last_ok_at 那一轮的，之前没成功过就是空的。 */
  error?: string;
  last_ok_at?: string;
  engine: string;
  version?: string;
  started_at?: string;
  /** 备库（只读）。 */
  in_recovery: boolean;
  size_bytes: number;
  /** max(age(datfrozenxid))：超过 autovacuum_freeze_max_age（默认 2 亿）强制冻结，接近 20 亿停写。 */
  xid_age: number;
  connections?: {
    max: number;
    /** superuser_reserved_connections：只有超级用户能用的那部分。 */
    reserved: number;
    client: number;
    active: number;
    idle: number;
    idle_in_transaction: number;
    /** 复制连接；PostgreSQL 12 起不占 max。 */
    wal_senders: number;
  };
  activity?: {
    longest_transaction_seconds: number;
    long_transactions: number;
    longest_idle_in_transaction_seconds: number;
    lock_waits: number;
    longest_lock_wait_seconds: number;
  };
  wal?: {
    /** pg_ls_waldir() 要超级用户或 pg_monitor，没权限时缺省。 */
    bytes?: number;
    files?: number;
    max_wal_size_bytes?: number;
    /** max_slot_wal_keep_size；-1 表示复制槽可以无限保留 WAL。 */
    max_slot_keep_bytes?: number;
  };
  slots?: Array<{
    name: string;
    type: string;
    active: boolean;
    /** reserved / extended 正常，unreserved 快失效，lost 已失效。 */
    wal_status?: string;
    retained_bytes?: number;
    safe_wal_size_bytes?: number;
  }>;
  replication?: Array<{
    name: string;
    state: string;
    sync_state?: string;
    sent_lag_bytes?: number;
    /** pg_receivewal 默认段尾才确认，正常也会到一个段（16 MB）。 */
    flush_lag_bytes?: number;
    reply_age_seconds?: number;
  }>;
  /** 最近约 5 分钟计数器的变化，主节点查过两轮才有。 */
  window?: {
    seconds: number;
    commits: number;
    rollbacks: number;
    blocks_hit: number;
    blocks_read: number;
    deadlocks: number;
    temp_bytes: number;
  };
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
  /** 根分区和进程要写的各目录所在的文件系统，同一文件系统一项。旧后端没有。 */
  disks?: NodeDisk[];
  traffic: NodeTraffic;
  egress?: NodeEgress;
  db?: NodeRoundTrip;
  redis?: NodeRoundTrip;
  shared_redis?: NodeSharedRedis;
  /** 只在主节点的快照里。 */
  database?: NodeDatabase;
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

/**
 * 不跑节点、经 clirelay-hostagent 上报的主机（数据库主机）。快照里只有 host 与 disks 描述这台机器。
 */
export interface ClusterHost {
  host_id: string;
  /** "database" 是数据库所在的主机。 */
  role: string;
  version?: string;
  snapshot: NodeSnapshot;
  snapshot_at: string;
  /** 按数据库时钟算的快照年龄，不受浏览器时钟偏差影响。 */
  age_seconds: number;
}

export interface ClusterStatus {
  enabled: boolean;
  node_id: string;
  is_leader: boolean;
  active_nodes: number;
  nodes: ClusterNode[];
  /** 读成员表失败时的错误；这时 nodes 只有当前节点。 */
  nodes_error?: string;
  /** 没有主机上报、或运行库不是 PostgreSQL 时缺省；旧后端也没有。 */
  hosts?: ClusterHost[];
  hosts_error?: string;
}

export const clusterApi = {
  getStatus: (options?: { signal?: AbortSignal }) =>
    options?.signal
      ? apiClient.get<ClusterStatus>("/cluster", { signal: options.signal })
      : apiClient.get<ClusterStatus>("/cluster"),
};
