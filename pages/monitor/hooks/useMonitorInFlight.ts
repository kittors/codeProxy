import { useCallback, useEffect, useRef, useState } from "react";
import { isApiClientError, usageMonitorApi, type MonitorInFlight } from "@code-proxy/api-client";
import { usePageVisible } from "./usePageVisible";

/**
 * 在途请求每 5 秒取一次：阶段按秒在变，而这份列表只读后端进程内存，取一次很便宜。两次之间
 * 的已耗时由卡片按收到时刻自己往上走。
 */
export const MONITOR_IN_FLIGHT_POLL_MS = 5_000;

export interface MonitorInFlightState {
  inFlight: MonitorInFlight | null;
  /** 收到这份列表的时刻（Date.now()）。 */
  receivedAt: number;
  error: boolean;
  /** 这个后端答不了在途列表：卡片不出现。 */
  unavailable: boolean;
}

/**
 * enabled 为 false（后端没声明 in-flight-requests，或是旧后端的降级模式）时不发请求。
 * 声明了能力却回 404，说明请求打到了没有这个接口的节点：当作没有这项能力，停止轮询。
 */
export function useMonitorInFlight(enabled: boolean): MonitorInFlightState {
  const visible = usePageVisible();
  const [inFlight, setInFlight] = useState<MonitorInFlight | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await usageMonitorApi.getInFlight({ signal: controller.signal });
      if (request !== requestRef.current) return;
      setInFlight(next);
      setReceivedAt(Date.now());
      setError(false);
    } catch (err) {
      if (request !== requestRef.current || controller.signal.aborted) return;
      if (isApiClientError(err) && err.status === 404) {
        setMissing(true);
        return;
      }
      setError(true);
    }
  }, []);

  const active = enabled && !missing;

  useEffect(() => {
    if (!active || !visible) return undefined;
    void load();
    const timer = window.setInterval(() => void load(), MONITOR_IN_FLIGHT_POLL_MS);
    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [active, visible, load]);

  return {
    inFlight: active ? inFlight : null,
    receivedAt,
    error: active && error,
    unavailable: !active,
  };
}
