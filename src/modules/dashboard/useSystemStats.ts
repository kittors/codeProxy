import { useEffect, useRef, useState, useCallback } from "react";
import { computeManagementApiBase } from "@/lib/connection";
import { useAuth } from "@/modules/auth/AuthProvider";
import { apiClient } from "@/lib/http/client";

export interface SystemStats {
    db_size_bytes: number;
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
    uptime_seconds: number;
    start_time: string;
    channel_latency: ChannelLatency[];
}

export interface ChannelLatency {
    source: string;
    count: number;
    avg_ms: number;
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

export function useSystemStats(interval = 3): {
    stats: SystemStats | null;
    connected: boolean;
    error: string | null;
} {
    const { state: { apiBase, managementKey } } = useAuth();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const httpFallbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const mountedRef = useRef(true);

    // --- HTTP fallback: poll if WebSocket fails ---
    const fetchHttp = useCallback(async () => {
        try {
            const data = await apiClient.get<SystemStats>("/system-stats");
            if (mountedRef.current) setStats(data);
        } catch {
            // silently ignore
        }
    }, []);

    const startHttpFallback = useCallback(() => {
        // Only start if WebSocket is not connected
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        void fetchHttp();
        httpFallbackTimer.current = setInterval(() => void fetchHttp(), interval * 1000) as unknown as ReturnType<typeof setTimeout>;
    }, [fetchHttp, interval]);

    const stopHttpFallback = useCallback(() => {
        if (httpFallbackTimer.current) {
            clearInterval(httpFallbackTimer.current as unknown as number);
            httpFallbackTimer.current = undefined;
        }
    }, []);

    // --- WebSocket connection ---
    const connect = useCallback(() => {
        const url = buildWsUrl(apiBase, managementKey);
        if (!url) {
            // No WebSocket URL — use HTTP polling instead
            startHttpFallback();
            return;
        }

        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) return;
                setConnected(true);
                setError(null);
                stopHttpFallback();
                ws.send(JSON.stringify({ interval }));
            };

            ws.onmessage = (ev) => {
                if (!mountedRef.current) return;
                try {
                    const data = JSON.parse(ev.data as string) as SystemStats;
                    setStats(data);
                } catch {
                    // ignore
                }
            };

            ws.onerror = () => {
                if (!mountedRef.current) return;
                setError("WebSocket 连接错误");
            };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setConnected(false);
                wsRef.current = null;
                // Fall back to HTTP, then retry WebSocket in 5s
                startHttpFallback();
                reconnectTimer.current = setTimeout(() => {
                    stopHttpFallback();
                    connect();
                }, 5000);
            };
        } catch {
            // WebSocket creation failed, use HTTP polling
            startHttpFallback();
        }
    }, [apiBase, managementKey, interval, startHttpFallback, stopHttpFallback]);

    useEffect(() => {
        mountedRef.current = true;
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
    }, [connect, stopHttpFallback]);

    return { stats, connected, error };
}
