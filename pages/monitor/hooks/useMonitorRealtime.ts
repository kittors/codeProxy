import { useCallback, useEffect, useRef, useState } from "react";
import {
  isApiClientError,
  usageMonitorApi,
  type MonitorFilterSelection,
  type MonitorRealtime,
} from "@code-proxy/api-client";
import { usePageVisible } from "./usePageVisible";

/** 实时条每 15 秒取一次：分钟桶的粒度下，再快也看不到新东西。 */
export const MONITOR_REALTIME_POLL_MS = 15_000;

export interface MonitorRealtimeState {
  realtime: MonitorRealtime | null;
  error: boolean;
  /** 后端没有这个接口（旧版本），停止轮询。 */
  unavailable: boolean;
}

export function useMonitorRealtime(
  filters: MonitorFilterSelection,
  enabled: boolean,
): MonitorRealtimeState {
  const visible = usePageVisible();
  const [realtime, setRealtime] = useState<MonitorRealtime | null>(null);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await usageMonitorApi.getRealtime(
        JSON.parse(filterKey) as MonitorFilterSelection,
        { signal: controller.signal },
      );
      if (request !== requestRef.current) return;
      setRealtime(next);
      setError(false);
    } catch (err) {
      if (request !== requestRef.current || controller.signal.aborted) return;
      if (isApiClientError(err) && err.status === 404) {
        setUnavailable(true);
        return;
      }
      setError(true);
    }
  }, [filterKey]);

  const active = enabled && !unavailable;

  useEffect(() => {
    if (!active) return undefined;
    void load();
    return () => abortRef.current?.abort();
  }, [active, load]);

  useEffect(() => {
    if (!active || !visible) return undefined;
    const timer = window.setInterval(() => void load(), MONITOR_REALTIME_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, visible, load]);

  return { realtime: active ? realtime : null, error, unavailable };
}
