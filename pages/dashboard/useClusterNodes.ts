import { useCallback, useEffect, useRef, useState } from "react";
import { clusterApi, isApiClientError, type ClusterStatus } from "@code-proxy/api-client";

/** 快照每 5 秒采一次、随心跳写库；10 秒取一次足够看清走势，也不给后端添负担。 */
export const CLUSTER_NODES_POLL_MS = 10_000;

export interface ClusterNodesState {
  /** 最近一次取到的成员表；还没取到、或接口不可用时为 null，节点视图整块不显示。 */
  status: ClusterStatus | null;
  /** 收到这份成员表的时刻（Date.now()），卡片据此算「多久前」。 */
  receivedAt: number;
  /** 上一次刷新失败（之前取到的数据仍在显示）。 */
  stale: boolean;
}

/**
 * 轮询 GET /cluster。只在后端于 GET /config 声明了 node-metrics 时启用（见 ClusterNodesSection），
 * 但仍按旧后端来防：
 * - 404（声明了能力、请求却落到没有这个接口的节点）当作没有这项能力，停止轮询、不报错；
 * - 401 / 403 / 会话失效也停止，免得无权限的账号一直打这个接口；
 * - 其他失败（网络、5xx）保留上一次的数据，下一轮再试。
 */
export function useClusterNodes(enabled: boolean): ClusterNodesState {
  const [status, setStatus] = useState<ClusterStatus | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [stale, setStale] = useState(false);
  const [stopped, setStopped] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await clusterApi.getStatus({ signal: controller.signal });
      if (request !== requestRef.current) return;
      setStatus(next);
      setReceivedAt(Date.now());
      setStale(false);
    } catch (err) {
      if (request !== requestRef.current || controller.signal.aborted) return;
      if (
        isApiClientError(err) &&
        (err.status === 404 || err.status === 401 || err.status === 403 || err.isAuthError)
      ) {
        setStatus(null);
        setStopped(true);
        return;
      }
      setStale(true);
    }
  }, []);

  const active = enabled && !stopped;

  useEffect(() => {
    if (!active) return undefined;
    void load();
    const timer = window.setInterval(() => void load(), CLUSTER_NODES_POLL_MS);
    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [active, load]);

  if (!enabled) return { status: null, receivedAt: 0, stale: false };
  return { status, receivedAt, stale };
}
