import { useCallback, useState } from "react";
import { Link, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/http/client";

/**
 * Format latency value with appropriate unit.
 * <1000ms → "128ms", <60s → "1.2s", <60m → "2.5m", else → "1.1h"
 */
function formatLatency(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
}

interface LatencyBadgeProps {
    /** Provider base URL to ping */
    baseUrl?: string;
}

/**
 * Self-contained latency badge component.
 * Displays "--" initially, shows a loading spinner while checking,
 * then shows the latency value. Clicking triggers a new check.
 */
export function LatencyBadge({ baseUrl }: LatencyBadgeProps) {
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const check = useCallback(async () => {
        if (!baseUrl || loading) return;
        setLoading(true);
        setError(false);

        const start = performance.now();
        try {
            await apiClient.post(
                "/api-call",
                { method: "GET", url: baseUrl.replace(/\/+$/, "") },
                { timeoutMs: 30000 },
            );
            setLatencyMs(performance.now() - start);
        } catch {
            const elapsed = performance.now() - start;
            // If we got a response within a reasonable time, still show it
            if (elapsed < 20000) {
                setLatencyMs(elapsed);
            } else {
                setError(true);
                setLatencyMs(null);
            }
        } finally {
            setLoading(false);
        }
    }, [baseUrl, loading]);

    if (!baseUrl) return null;

    return (
        <span
            className="latency-badge"
            onClick={(e) => {
                e.stopPropagation();
                void check();
            }}
            title={`Check latency: ${baseUrl}`}
        >
            {loading ? (
                <Loader2 size={10} className="latency-badge-spinner" />
            ) : error ? (
                <span className="latency-badge-error">×</span>
            ) : latencyMs !== null ? (
                <span className="latency-badge-value">{formatLatency(latencyMs)}</span>
            ) : (
                <span className="latency-badge-placeholder">--</span>
            )}
            <Link size={9} className="latency-badge-icon" />
        </span>
    );
}
