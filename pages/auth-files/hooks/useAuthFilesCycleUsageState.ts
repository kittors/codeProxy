import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, type AuthFileItem } from "@code-proxy/api-client";
import { normalizeAuthIndexValue, normalizeProviderKey, resolveFileType } from "@code-proxy/domain";

type RefreshCycleUsageOptions = {
  force?: boolean;
};

const supportsCycleUsage = (file: AuthFileItem): boolean => {
  const provider = normalizeProviderKey(resolveFileType(file));
  return provider === "codex" || provider === "kimi";
};

const resolveCycleUsageAuthIndex = (file: AuthFileItem): string | null => {
  if (!supportsCycleUsage(file)) return null;
  return normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
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
        const rawCount = trend.cycle_request_total;
        if (typeof rawCount !== "number" || !Number.isFinite(rawCount)) return null;

        const nextCount = Math.max(0, Math.round(rawCount));
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
