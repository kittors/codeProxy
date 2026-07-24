import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, type AuthFileItem } from "@code-proxy/api-client";
import {
  normalizeAuthIndexValue,
  normalizeProviderKey,
  resolveFileType,
  type AuthFileCycleBudgetStats,
} from "@code-proxy/domain";
import { mapWithConcurrency } from "./mapWithConcurrency";

type RefreshCycleUsageOptions = {
  force?: boolean;
};

export type AuthFileCycleUsageSnapshot = {
  calls: number | null;
  cycleCostTotal: number | null;
  cycleTotalTokens: number | null;
  weeklyQuotaUsedPercent: number | null;
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

const toFiniteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readCycleBudgetStats = (trend: {
  cycle_cost_total?: number;
  cycle_total_tokens?: number | null;
  weekly_quota_used_percent?: number | null;
}): Pick<
  AuthFileCycleUsageSnapshot,
  "cycleCostTotal" | "cycleTotalTokens" | "weeklyQuotaUsedPercent"
> => ({
  cycleCostTotal: toFiniteOrNull(trend.cycle_cost_total),
  cycleTotalTokens: toFiniteOrNull(trend.cycle_total_tokens),
  weeklyQuotaUsedPercent: toFiniteOrNull(trend.weekly_quota_used_percent),
});

/**
 * Limit concurrent /usage/auth-file-trend fan-out from the AI Accounts card view.
 * Each trend call fans into multiple request_logs aggregates on the backend; unbounded
 * Promise.all on a full page can peg CPU while leaving other features starved.
 */
const AUTH_FILE_TREND_FETCH_CONCURRENCY = 2;

export function useAuthFilesCycleUsageState() {
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Map<string, Promise<AuthFileCycleUsageSnapshot | null>>>(new Map());
  const snapshotByAuthIndexRef = useRef<Record<string, AuthFileCycleUsageSnapshot>>({});
  const [snapshotByAuthIndex, setSnapshotByAuthIndex] = useState<
    Record<string, AuthFileCycleUsageSnapshot>
  >({});

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    snapshotByAuthIndexRef.current = snapshotByAuthIndex;
  }, [snapshotByAuthIndex]);

  const fetchCycleUsage = useCallback(
    async (authIndex: string): Promise<AuthFileCycleUsageSnapshot | null> => {
      const existing = inFlightRef.current.get(authIndex);
      if (existing) return existing;

      let request: Promise<AuthFileCycleUsageSnapshot | null>;
      request = usageApi
        .getAuthFileTrend(authIndex, { days: 7, hours: 5 })
        .then((trend) => {
          const nextCount = resolveDisplayCycleCount(trend);
          const budget = readCycleBudgetStats(trend);
          const snapshot: AuthFileCycleUsageSnapshot = {
            calls: nextCount,
            cycleCostTotal: budget.cycleCostTotal,
            cycleTotalTokens: budget.cycleTotalTokens,
            weeklyQuotaUsedPercent: budget.weeklyQuotaUsedPercent,
          };

          if (mountedRef.current) {
            setSnapshotByAuthIndex((prev) => {
              const current = prev[authIndex];
              if (
                current &&
                current.calls === snapshot.calls &&
                current.cycleCostTotal === snapshot.cycleCostTotal &&
                current.cycleTotalTokens === snapshot.cycleTotalTokens &&
                current.weeklyQuotaUsedPercent === snapshot.weeklyQuotaUsedPercent
              ) {
                return prev;
              }
              return { ...prev, [authIndex]: snapshot };
            });
          }
          return snapshot;
        })
        .catch(() => null)
        .finally(() => {
          if (inFlightRef.current.get(authIndex) === request) {
            inFlightRef.current.delete(authIndex);
          }
        });

      inFlightRef.current.set(authIndex, request);
      return request;
    },
    [],
  );

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
        : authIndexes.filter((authIndex) => snapshotByAuthIndexRef.current[authIndex] === undefined);
      if (targets.length === 0) return;

      // Force refresh (manual button) still uses the same concurrency cap so a
      // single page action cannot open N simultaneous auth-file-trend storms.
      await mapWithConcurrency(targets, AUTH_FILE_TREND_FETCH_CONCURRENCY, (authIndex) =>
        fetchCycleUsage(authIndex),
      );
    },
    [fetchCycleUsage],
  );

  const callsByAuthIndex = Object.fromEntries(
    Object.entries(snapshotByAuthIndex)
      .filter(([, snapshot]) => typeof snapshot.calls === "number")
      .map(([authIndex, snapshot]) => [authIndex, snapshot.calls as number]),
  );

  const cycleBudgetByAuthIndex: Record<string, AuthFileCycleBudgetStats> = Object.fromEntries(
    Object.entries(snapshotByAuthIndex).map(([authIndex, snapshot]) => [
      authIndex,
      {
        cycleCostTotal: snapshot.cycleCostTotal,
        weeklyQuotaUsedPercent: snapshot.weeklyQuotaUsedPercent,
      } satisfies AuthFileCycleBudgetStats,
    ]),
  );

  const cycleTotalTokensByAuthIndex: Record<string, number | null> = Object.fromEntries(
    Object.entries(snapshotByAuthIndex).map(([authIndex, snapshot]) => [
      authIndex,
      snapshot.cycleTotalTokens,
    ]),
  );

  return {
    callsByAuthIndex,
    cycleBudgetByAuthIndex,
    cycleTotalTokensByAuthIndex,
    refreshCycleUsageForFiles,
  };
}
