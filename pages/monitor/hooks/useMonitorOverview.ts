import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isApiClientError,
  usageApi,
  usageMonitorApi,
  type MonitorOverview,
} from "@code-proxy/api-client";
import {
  LEGACY_RANGE_DAYS,
  isLegacyRangeSupported,
  legacyChartDataToOverview,
} from "../model/legacyOverview";
import type { MonitorViewQuery } from "../model/monitorQueryState";
import { usePageVisible } from "./usePageVisible";

export type MonitorDataMode = "full" | "legacy";

/**
 * 旧后端没有 /usage/monitor/*（返回 404）。探测结果在页面会话内记住：后端版本不会在页面
 * 打开期间变化，不必每次切换范围都先撞一次 404。
 */
let legacyBackend = false;

/** 测试用：用例之间重置探测结果。 */
export function resetMonitorBackendProbe() {
  legacyBackend = false;
}

export interface MonitorOverviewState {
  overview: MonitorOverview | null;
  mode: MonitorDataMode;
  /** 首次加载，屏上还没有任何数据（显示骨架）。 */
  initialLoading: boolean;
  /** 切换范围或筛选：旧数据还在屏上，新数据在路上（卡片上盖加载层）。 */
  switching: boolean;
  /** 任意一次请求在途，包括静默的自动刷新（只让刷新图标转起来）。 */
  refreshing: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => void;
}

type Pending = "none" | "switch" | "silent";

export function useMonitorOverview(
  query: MonitorViewQuery,
  refreshSeconds: number,
): MonitorOverviewState {
  const { t } = useTranslation();
  const visible = usePageVisible();
  const [overview, setOverview] = useState<MonitorOverview | null>(null);
  const [mode, setMode] = useState<MonitorDataMode>(legacyBackend ? "legacy" : "full");
  const [pending, setPending] = useState<Pending>("switch");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const queryKey = JSON.stringify(query);

  const load = useCallback(
    async (silent: boolean) => {
      const request = ++requestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPending(silent ? "silent" : "switch");
      const current = JSON.parse(queryKey) as MonitorViewQuery;
      try {
        let next: MonitorOverview | null = null;
        let nextMode: MonitorDataMode = "full";
        if (!legacyBackend) {
          try {
            next = await usageMonitorApi.getOverview(current, { signal: controller.signal });
          } catch (err) {
            if (!(isApiClientError(err) && err.status === 404)) throw err;
            legacyBackend = true;
          }
        }
        if (legacyBackend) {
          // 页面会把不支持的范围切到「今天」，这里再兜一次，免得那一帧请求到错的天数。
          const range = isLegacyRangeSupported(current.range) ? current.range : "today";
          const chart = await usageApi.getChartData(LEGACY_RANGE_DAYS[range] ?? 1, "", {
            signal: controller.signal,
          });
          next = legacyChartDataToOverview(chart, range);
          nextMode = "legacy";
        }
        if (request !== requestRef.current || !next) return;
        setOverview(next);
        setMode(nextMode);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (request !== requestRef.current || controller.signal.aborted) return;
        // 静默刷新失败不清掉屏上的数据，只在页头提示「更新失败」。
        setError(
          err instanceof Error && err.message ? err.message : t("monitor_center.load_failed"),
        );
      } finally {
        if (request === requestRef.current) setPending("none");
      }
    },
    [queryKey, t],
  );

  useEffect(() => {
    void load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  // 定时器与回到前台的补刷都读 ref，避免它们随 load 的身份变化而反复重建。
  const loadRef = useRef(load);
  loadRef.current = load;
  const updatedAtRef = useRef(updatedAt);
  updatedAtRef.current = updatedAt;

  useEffect(() => {
    if (!refreshSeconds || !visible) return undefined;
    const timer = window.setInterval(() => void loadRef.current(true), refreshSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds, visible, queryKey]);

  // 标签页回到前台时，数据已经过了一个刷新周期就立刻补一次，而不是再等一整个周期。
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    const becameVisible = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    const last = updatedAtRef.current;
    if (becameVisible && refreshSeconds && last && Date.now() - last >= refreshSeconds * 1_000) {
      void loadRef.current(true);
    }
  }, [visible, refreshSeconds]);

  const refresh = useCallback(() => void loadRef.current(true), []);

  return {
    overview,
    mode,
    initialLoading: overview === null && pending !== "none",
    switching: overview !== null && pending === "switch",
    refreshing: pending !== "none",
    error,
    updatedAt,
    refresh,
  };
}
