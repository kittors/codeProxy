import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/lib/http/client";

interface LatencyEntry {
    latencyMs: number | null;
    loading: boolean;
    error: boolean;
}

const INITIAL_ENTRY: LatencyEntry = { latencyMs: null, loading: false, error: false };

/**
 * Format latency value with appropriate unit.
 * <1000ms → "128ms", <60s → "1.2s", <60m → "2.5m", else "1.1h"
 */
export function formatLatency(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function useProviderLatency() {
    const [entries, setEntries] = useState<Map<string, LatencyEntry>>(new Map());
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    const getEntry = useCallback(
        (key: string): LatencyEntry => entries.get(key) ?? INITIAL_ENTRY,
        [entries],
    );

    const checkLatency = useCallback(async (key: string, baseUrl: string) => {
        // Abort previous request for the same key
        abortControllers.current.get(key)?.abort();
        const controller = new AbortController();
        abortControllers.current.set(key, controller);

        // Set loading state
        setEntries((prev) => {
            const next = new Map(prev);
            next.set(key, { latencyMs: null, loading: true, error: false });
            return next;
        });

        const start = performance.now();
        try {
            // Use the management api-call endpoint to ping the provider base URL from the server side
            await apiClient.post(
                "/api-call",
                {
                    method: "GET",
                    url: baseUrl.replace(/\/+$/, ""),
                },
                { timeoutMs: 30000, signal: controller.signal },
            );
            const elapsed = performance.now() - start;

            setEntries((prev) => {
                const next = new Map(prev);
                next.set(key, { latencyMs: elapsed, loading: false, error: false });
                return next;
            });
        } catch {
            // Even on HTTP errors (4xx/5xx), we still got a response — use elapsed time
            const elapsed = performance.now() - start;
            if (controller.signal.aborted) return;

            // If we got a response (even error), latency is still valid
            setEntries((prev) => {
                const next = new Map(prev);
                // If elapsed < 20s, the server responded — show latency even on error status
                if (elapsed < 20000) {
                    next.set(key, { latencyMs: elapsed, loading: false, error: false });
                } else {
                    next.set(key, { latencyMs: null, loading: false, error: true });
                }
                return next;
            });
        }
    }, []);

    return { getEntry, checkLatency };
}
