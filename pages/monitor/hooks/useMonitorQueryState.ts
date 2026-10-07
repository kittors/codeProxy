import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { MonitorRangeKey } from "@code-proxy/api-client";
import { useLocalStorage } from "@code-proxy/ui";
import {
  DEFAULT_MONITOR_REFRESH,
  normalizeMonitorRefresh,
  parseMonitorViewQuery,
  toggleMonitorFilter,
  writeMonitorViewQuery,
  type MonitorFilterDimension,
  type MonitorRefreshSeconds,
  type MonitorViewQuery,
} from "../model/monitorQueryState";

const REFRESH_STORAGE_KEY = "code-proxy-monitor-refresh-seconds";

/** 视图状态读写地址栏（replace，不污染返回历史）；自动刷新档位存本地。 */
export function useMonitorQueryState() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseMonitorViewQuery(params), [params]);

  const update = useCallback(
    (next: (current: MonitorViewQuery) => MonitorViewQuery) => {
      setParams((prev) => writeMonitorViewQuery(next(parseMonitorViewQuery(prev)), prev), {
        replace: true,
      });
    },
    [setParams],
  );

  const setRange = useCallback(
    (range: MonitorRangeKey) => update((current) => ({ ...current, range })),
    [update],
  );
  const setFilter = useCallback(
    (dimension: MonitorFilterDimension, values: string[]) =>
      update((current) => ({ ...current, [dimension]: values })),
    [update],
  );
  const toggleFilter = useCallback(
    (dimension: MonitorFilterDimension, value: string) =>
      update((current) => toggleMonitorFilter(current, dimension, value)),
    [update],
  );
  const clearFilters = useCallback(
    () => update((current) => ({ ...current, consumers: [], models: [], channels: [] })),
    [update],
  );

  const [storedRefresh, setStoredRefresh] = useLocalStorage<number>(
    REFRESH_STORAGE_KEY,
    DEFAULT_MONITOR_REFRESH,
  );
  const refreshSeconds = normalizeMonitorRefresh(storedRefresh);
  const setRefreshSeconds = useCallback(
    (value: MonitorRefreshSeconds) => setStoredRefresh(value),
    [setStoredRefresh],
  );

  return {
    query,
    setRange,
    setFilter,
    toggleFilter,
    clearFilters,
    refreshSeconds,
    setRefreshSeconds,
  };
}
