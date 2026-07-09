import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, type AuthFileItem } from "@code-proxy/api-client";
import { normalizeAuthIndexValue, normalizeProviderKey, resolveFileType } from "@code-proxy/domain";

type RefreshCycleUsageOptions = {
  force?: boolean;
};

const supportsCycleUsage = (file: AuthFileItem): boolean => {
  const provider = normalizeProviderKey(resolveFileType(file));
  return provider === "codex" || provider === "kimi" || provider === "xai";
};

const resolveCycleUsageAuthIndex = (file: AuthFileItem): string | null => {
  if (!supportsCycleUsage(file)) return null;
  return normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
};

/**
 * Prefer cycle_request_total when the backend knows the weekly cycle start.
 * When cycle_known is false, fall back to request_total so cards do not jump
 * from entity-stats totals (e.g. 116) to a misleading 0.
 */
const resolveDisplayCycleCount = (trend: {
  cycle_known?: boolean;
  cycle_request_total?: number;
  request_total?: number;
}): number | null => {
  const cycleKnown = trend.cycle_known === true;
  const cycleTotal = trend.cycle_request_total;
  if (cycleKnown && typeof cycleTotal === "number" && Number.isFinite(cycleTotal)) {
    return Math.max(0, Math.round(cycleTotal));
  }

  const requestTotal = trend.request_total;
  if (typeof requestTotal === "number" && Number.isFinite(requestTotal)) {
    return Math.max(0, Math.round(requestTotal));
  }

  if (typeof cycleTotal === "number" && Number.isFinite(cycleTotal)) {
    return Math.max(0, Math.round(cycleTotal));
  }
  return null;
};

export function useAuthFilesCycleUsageState() {
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Map<string, Promise<number | null>>>(new Map());
  const callsByAuthIndexRef = useRef<Record<string, number>>({});
  const [callsByAuthIndex, setCallsByAuthIndex] = useState<Record<string, number>>({});

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    callsByAuthIndexRef.current = callsByAuthIndex;
  }, [callsByAuthIndex]);

  const fetchCycleUsage = useCallback(async (authIndex: string): Promise<number | null> => {
    const existing = inFlightRef.current.get(authIndex);
    if (existing) return existing;

    let request: Promise<number | null>;
    request = usageApi
      .getAuthFileTrend(authIndex, { days: 7, hours: 5 })
      .then((trend) => {
        const nextCount = resolveDisplayCycleCount(trend);
        if (nextCount === null) return null;

        if (mountedRef.current) {
          setCallsByAuthIndex((prev) =>
            prev[authIndex] === nextCount ? prev : { ...prev, [authIndex]: nextCount },
          );
        }
        return nextCount;
      })
      .catch(() => null)
      .finally(() => {
        if (inFlightRef.current.get(authIndex) === request) {
          inFlightRef.current.delete(authIndex);
        }
      });

    inFlightRef.current.set(authIndex, request);
    return request;
  }, []);

  const refreshCycleUsageForFiles = useCallback(
    async (files: AuthFileItem[], options?: RefreshCycleUsageOptions): Promise<void> => {
      const authIndexes = Array.from(
        new Set(
          files
            .map(resolveCycleUsageAuthIndex)
            .filter((authIndex): authIndex is string => Boolean(authIndex)),
        ),
      );
      const targets = options?.force
        ? authIndexes
        : authIndexes.filter((authIndex) => callsByAuthIndexRef.current[authIndex] === undefined);
      if (targets.length === 0) return;

      await Promise.allSettled(targets.map((authIndex) => fetchCycleUsage(authIndex)));
    },
    [fetchCycleUsage],
  );

  return {
    callsByAuthIndex,
    refreshCycleUsageForFiles,
  };
}
