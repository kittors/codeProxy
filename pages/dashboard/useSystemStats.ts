import { useEffect, useRef, useState, useCallback } from "react";
import { computeManagementApiBase } from "@code-proxy/api-client";
import { useAuth } from "@app/providers/AuthProvider";
import { apiClient, extractApiErrorCode, isApiClientError } from "@code-proxy/api-client";

export interface SystemStats {
  db_size_bytes: number;
  db_engine?: string;
  log_content_store_bytes: number;
  log_dir_size_bytes: number;
  log_size_bytes: number;
  process_mem_bytes: number;
  process_mem_pct: number;
  process_cpu_pct: number;
  go_routines: number;
  go_heap_bytes: number;
  system_cpu_pct: number;
  system_mem_total: number;
  system_mem_used: number;
  system_mem_pct: number;
  net_bytes_sent: number;
  net_bytes_recv: number;
  net_send_rate: number;
  net_recv_rate: number;
  disk_total: number;
  disk_used: number;
  disk_free: number;
  disk_pct: number;
  uptime_seconds: number;
  start_time: string;
  channel_latency: ChannelLatency[];
  active_concurrency: ConcurrencySnapshot[] | null;
  total_in_flight: number;
  total_rpm: number;
  total_tpm: number;
}

export interface ChannelLatency {
  source: string;
  count: number;
  avg_ms: number;
}

export interface ConcurrencySnapshot {
  api_key: string;
  rpm: number;
  tpm: number;
  rpm_limit: number;
  tpm_limit: number;
}

/** Auth/permission failures that should stop reconnect storms. */
export function isFatalSystemStatsStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function isFatalSystemStatsError(error: unknown): boolean {
  if (!isApiClientError(error)) return false;
  if (isFatalSystemStatsStatus(error.status)) return true;
  if (error.isAuthError) return true;
  const code = extractApiErrorCode(error.payload);
  return (
    code === "permission_denied" ||
    code === "tenant_resource_scope_unavailable" ||
    code === "session_expired" ||
    code === "session_revoked" ||
    code === "invalid_credentials"
  );
}

/** Build WebSocket URL from auth context */
function buildWsUrl(apiBase: string, managementKey: string): string | null {
  const httpBase = computeManagementApiBase(apiBase);
  if (!httpBase) return null;
  try {
    const abs = new URL(httpBase, window.location.origin);
    abs.protocol = abs.protocol === "https:" ? "wss:" : "ws:";
    abs.pathname += "/system-stats/ws";
    if (managementKey) {
      abs.searchParams.set("token", managementKey);
    }
    return abs.toString();
  } catch {
    return null;
  }
}

export function useSystemStats(
  interval = 3,
  /** When false, skip WebSocket/HTTP and expose an empty idle state. */
  enabled = true,
): {
  stats: SystemStats | null;
  connected: boolean;
  error: string | null;
} {
  const {
    state: { apiBase, managementKey },
  } = useAuth();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const httpFallbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  // Stop WS reconnect + HTTP polling after auth/permission failures.
  const haltedRef = useRef(false);

  const haltPolling = useCallback((message: string) => {
    haltedRef.current = true;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
    if (httpFallbackTimer.current) {
      clearInterval(httpFallbackTimer.current as unknown as number);
      httpFallbackTimer.current = undefined;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    if (mountedRef.current) {
      setConnected(false);
      setError(message);
    }
  }, []);

  // --- HTTP fallback: poll if WebSocket fails ---
  const fetchHttp = useCallback(async () => {
    if (haltedRef.current) return;
    try {
      const data = await apiClient.get<SystemStats>("/system-stats");
      if (mountedRef.current && !haltedRef.current) setStats(data);
    } catch (err) {
      if (isFatalSystemStatsError(err)) {
        haltPolling("System monitor unauthorized or forbidden");
      }
      // transient errors: silently ignore
    }
  }, [haltPolling]);

  const startHttpFallback = useCallback(() => {
    if (haltedRef.current) return;
    // Only start if WebSocket is not connected
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (httpFallbackTimer.current) return;
    void fetchHttp();
    httpFallbackTimer.current = setInterval(
      () => void fetchHttp(),
      interval * 1000,
    ) as unknown as ReturnType<typeof setTimeout>;
  }, [fetchHttp, interval]);

  const stopHttpFallback = useCallback(() => {
    if (httpFallbackTimer.current) {
      clearInterval(httpFallbackTimer.current as unknown as number);
      httpFallbackTimer.current = undefined;
    }
  }, []);

  // --- WebSocket connection ---
  const connect = useCallback(() => {
    if (haltedRef.current) return;

    const url = buildWsUrl(apiBase, managementKey);
    if (!url) {
      // No WebSocket URL — use HTTP polling instead
      startHttpFallback();
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let sawOpen = false;

      ws.onopen = () => {
        if (!mountedRef.current || haltedRef.current) return;
        sawOpen = true;
        setConnected(true);
        setError(null);
        stopHttpFallback();
        ws.send(JSON.stringify({ interval }));
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current || haltedRef.current) return;
        try {
          const data = JSON.parse(ev.data as string) as SystemStats;
          setStats(data);
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current || haltedRef.current) return;
        setError("WebSocket connection error");
      };

      ws.onclose = (ev) => {
        if (!mountedRef.current) return;
        setConnected(false);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        // Auth handshake failures close before open with 4xx-class codes.
        // Also stop if the socket never opened (common for rejected Upgrade).
        if (isFatalSystemStatsStatus(ev.code) || (!sawOpen && (ev.code === 1006 || ev.code === 1002))) {
          // Confirm with one HTTP probe so we only halt on real 401/403, not network blips.
          void (async () => {
            try {
              await apiClient.get<SystemStats>("/system-stats");
              // HTTP works — keep HTTP fallback, do not reconnect WS forever on transient WS issues.
              if (!haltedRef.current) {
                startHttpFallback();
              }
            } catch (err) {
              if (isFatalSystemStatsError(err)) {
                haltPolling("System monitor unauthorized or forbidden");
                return;
              }
              if (!haltedRef.current) {
                startHttpFallback();
              }
            }
          })();
          return;
        }

        if (haltedRef.current) return;

        // Fall back to HTTP, then retry WebSocket in 5s
        startHttpFallback();
        reconnectTimer.current = setTimeout(() => {
          if (haltedRef.current) return;
          stopHttpFallback();
          connect();
        }, 5000);
      };
    } catch {
      // WebSocket creation failed, use HTTP polling
      startHttpFallback();
    }
  }, [apiBase, managementKey, interval, startHttpFallback, stopHttpFallback, haltPolling]);

  useEffect(() => {
    mountedRef.current = true;
    haltedRef.current = false;
    if (!enabled) {
      setStats(null);
      setConnected(false);
      setError(null);
      return () => {
        mountedRef.current = false;
      };
    }
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      stopHttpFallback();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled, stopHttpFallback]);

  if (!enabled) {
    return { stats: null, connected: false, error: null };
  }

  return { stats, connected, error };
}
