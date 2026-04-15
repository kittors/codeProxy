import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import {
  buildLast7DayAxis,
  normalizeProviderKey,
  resolveAuthFileDisplayName,
  resolveFileType,
  type AuthFilesGroupOverview,
  type AuthFilesGroupOverviewRow,
  type AuthFilesGroupTrendPoint,
  type UsageIndex,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import type { QuotaItem, QuotaState } from "@/modules/quota/quota-helpers";
import type { QuotaProvider } from "@/modules/quota/quota-fetch";

interface UseAuthFilesGroupOverviewArgs {
  filter: string;
  filteredFiles: AuthFileItem[];
  providerOptions: string[];
  quotaByFileName: Record<string, QuotaState>;
  usageIndex: UsageIndex;
  tab: "files" | "excluded" | "alias";
  collectQuotaFetchTargets: (items: AuthFileItem[]) => { file: AuthFileItem; provider: QuotaProvider }[];
  runQuotaRefreshBatch: (
    targets: { file: AuthFileItem; provider: QuotaProvider }[],
    options?: { markAsAutoRefreshing?: boolean },
  ) => Promise<void>;
  resolveQuotaProvider: (file: AuthFileItem) => QuotaProvider | null;
  resolveQuotaCardSlots: (
    provider: QuotaProvider,
    items: QuotaItem[],
  ) => { id: string; label: string; item: QuotaItem | null }[];
  resolveAuthFileStats: (file: AuthFileItem, index: UsageIndex) => { success: number; failure: number };
  resolveProviderLabel: (providerKey: string) => string;
}

export function useAuthFilesGroupOverview({
  filter,
  filteredFiles,
  providerOptions,
  quotaByFileName,
  usageIndex,
  tab,
  collectQuotaFetchTargets,
  runQuotaRefreshBatch,
  resolveQuotaProvider,
  resolveQuotaCardSlots,
  resolveAuthFileStats,
  resolveProviderLabel,
}: UseAuthFilesGroupOverviewArgs) {
  const { t } = useTranslation();
  const [groupOverviewOpen, setGroupOverviewOpen] = useState(false);
  const [groupOverviewTab, setGroupOverviewTab] = useState("all");
  const [groupOverviewLoading, setGroupOverviewLoading] = useState(false);
  const [groupTrendLoading, setGroupTrendLoading] = useState(false);
  const [groupTrendPoints, setGroupTrendPoints] = useState<AuthFilesGroupTrendPoint[]>([]);
  const groupTrendRequestRef = useRef(0);

  const formatAveragePercent = useCallback((value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "--";
    return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
  }, []);

  const groupOverviewTabs = useMemo(() => ["all", ...providerOptions], [providerOptions]);

  const computeGroupOverview = useCallback(
    (targetFiles: AuthFileItem[]): AuthFilesGroupOverview => {
      let totalCalls = 0;
      const fiveHourValues: number[] = [];
      const weeklyValues: number[] = [];

      targetFiles.forEach((file) => {
        const stats = resolveAuthFileStats(file, usageIndex);
        totalCalls += stats.success + stats.failure;

        const provider = resolveQuotaProvider(file);
        if (!provider) return;

        const state = quotaByFileName[file.name];
        const items = Array.isArray(state?.items) ? state.items : [];
        if (items.length === 0) return;

        const slots = resolveQuotaCardSlots(provider, items);
        const fiveHour = slots.find((slot) => slot.id === "code_5h")?.item?.percent;
        const weekly = slots.find((slot) => slot.id === "code_week")?.item?.percent;

        if (typeof fiveHour === "number" && Number.isFinite(fiveHour)) fiveHourValues.push(fiveHour);
        if (typeof weekly === "number" && Number.isFinite(weekly)) weeklyValues.push(weekly);
      });

      const average = (values: number[]) =>
        values.length === 0
          ? null
          : values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

      return {
        totalCalls,
        averageFiveHour: average(fiveHourValues),
        averageWeekly: average(weeklyValues),
        quotaSampleCount: Math.max(fiveHourValues.length, weeklyValues.length),
      };
    },
    [quotaByFileName, resolveAuthFileStats, resolveQuotaCardSlots, resolveQuotaProvider, usageIndex],
  );

  const groupOverviewByTab = useMemo<Record<string, AuthFilesGroupOverview>>(() => {
    const map: Record<string, AuthFilesGroupOverview> = {
      all: computeGroupOverview(filteredFiles),
    };
    providerOptions.forEach((key) => {
      const filesForGroup = filteredFiles.filter(
        (file) => normalizeProviderKey(resolveFileType(file)) === key,
      );
      map[key] = computeGroupOverview(filesForGroup);
    });
    return map;
  }, [computeGroupOverview, filteredFiles, providerOptions]);

  const groupOverviewRowsByTab = useMemo<Record<string, AuthFilesGroupOverviewRow[]>>(() => {
    const buildRows = (targetFiles: AuthFileItem[]) =>
      targetFiles
        .map((file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          const provider = resolveQuotaProvider(file);
          const state = quotaByFileName[file.name];
          const items = Array.isArray(state?.items) ? state.items : [];
          const slots = provider ? resolveQuotaCardSlots(provider, items) : [];
          const fiveHour = slots.find((slot) => slot.id === "code_5h")?.item?.percent ?? null;
          const weekly = slots.find((slot) => slot.id === "code_week")?.item?.percent ?? null;
          return {
            name: resolveAuthFileDisplayName(file) || file.name,
            totalCalls: stats.success + stats.failure,
            averageFiveHour:
              typeof fiveHour === "number" && Number.isFinite(fiveHour) ? fiveHour : null,
            averageWeekly:
              typeof weekly === "number" && Number.isFinite(weekly) ? weekly : null,
            hasQuota: items.length > 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    const map: Record<string, AuthFilesGroupOverviewRow[]> = {
      all: buildRows(filteredFiles),
    };
    providerOptions.forEach((key) => {
      const filesForGroup = filteredFiles.filter(
        (file) => normalizeProviderKey(resolveFileType(file)) === key,
      );
      map[key] = buildRows(filesForGroup);
    });
    return map;
  }, [
    filteredFiles,
    providerOptions,
    quotaByFileName,
    resolveAuthFileStats,
    resolveQuotaCardSlots,
    resolveQuotaProvider,
    usageIndex,
  ]);

  const activeGroupOverview = useMemo<AuthFilesGroupOverview>(() => {
    return groupOverviewByTab[groupOverviewTab] ?? groupOverviewByTab.all ?? computeGroupOverview([]);
  }, [computeGroupOverview, groupOverviewByTab, groupOverviewTab]);

  const activeGroupRows = useMemo<AuthFilesGroupOverviewRow[]>(() => {
    return groupOverviewRowsByTab[groupOverviewTab] ?? groupOverviewRowsByTab.all ?? [];
  }, [groupOverviewRowsByTab, groupOverviewTab]);

  const activeGroupTitle = useMemo(() => {
    if (groupOverviewTab === "all") return t("auth_files.group_overview_current_results");
    return t("auth_files.group_overview_group_label", {
      group: resolveProviderLabel(groupOverviewTab),
    });
  }, [groupOverviewTab, resolveProviderLabel, t]);

  const groupOverviewChartOption = useMemo<Record<string, unknown>>(() => {
    const labels = groupTrendPoints.map((point) => point.label);
    const calls = groupTrendPoints.map((point) => point.calls);
    const weekly = groupTrendPoints.map((point) => point.weeklyPercent);

    return {
      backgroundColor: "transparent",
      animationDuration: 420,
      animationDurationUpdate: 280,
      grid: { left: 48, right: 44, top: 36, bottom: 44, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        renderMode: "html",
        appendToBody: true,
        confine: true,
        borderWidth: 0,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        textStyle: { color: "#fff" },
        extraCssText: "z-index: 10000;",
      },
      legend: {
        top: 0,
        left: 0,
        textStyle: { color: "#64748b", fontSize: 11 },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          color: "#64748b",
          fontSize: 11,
        },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
      },
      yAxis: [
        {
          type: "value",
          axisLabel: { color: "#64748b", fontSize: 11, margin: 10 },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } },
        },
        {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: {
            color: "#64748b",
            fontSize: 11,
            margin: 10,
            formatter: (value: number) => `${Math.round(value)}%`,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t("auth_files.group_overview_total_calls_label"),
          type: "bar",
          barMaxWidth: 26,
          itemStyle: { color: "rgba(59,130,246,0.88)", borderRadius: [4, 4, 0, 0] },
          data: calls,
        },
        {
          name: t("auth_files.group_overview_avg_week_label"),
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { width: 3, color: "#10b981" },
          itemStyle: { color: "#10b981" },
          connectNulls: false,
          data: weekly,
        },
      ],
    };
  }, [groupTrendPoints, t]);

  const refreshGroupOverview = useCallback(
    async (targetGroup = groupOverviewTab) => {
      if (tab !== "files") return;
      setGroupOverviewLoading(true);
      try {
        const scopedFiles =
          targetGroup === "all"
            ? filteredFiles
            : filteredFiles.filter(
                (file) => normalizeProviderKey(resolveFileType(file)) === targetGroup,
              );
        const targets = collectQuotaFetchTargets(scopedFiles);
        await runQuotaRefreshBatch(targets, { markAsAutoRefreshing: true });
      } finally {
        setGroupOverviewLoading(false);
      }
    },
    [collectQuotaFetchTargets, filteredFiles, groupOverviewTab, runQuotaRefreshBatch, tab],
  );

  const refreshGroupTrend = useCallback(
    async (targetGroup = groupOverviewTab) => {
      const requestId = Date.now();
      groupTrendRequestRef.current = requestId;
      setGroupTrendLoading(true);

      try {
        const axis = buildLast7DayAxis();
        const callsByDay = new Map(axis.map((item) => [item.date, 0]));
        const weeklyByDay = new Map(axis.map((item) => [item.date, null as number | null]));
        const resp = await usageApi.getAuthFileGroupTrend(targetGroup, 7);
        (resp.points || []).forEach((point) => {
          if (callsByDay.has(point.date)) callsByDay.set(point.date, point.requests ?? 0);
        });
        (resp.quota_points || []).forEach((point) => {
          if (!weeklyByDay.has(point.date)) return;
          const percent = point.percent;
          weeklyByDay.set(
            point.date,
            typeof percent === "number" && Number.isFinite(percent) ? percent : null,
          );
        });
        const points: AuthFilesGroupTrendPoint[] = axis.map((item) => ({
          date: item.date,
          label: item.label,
          calls: callsByDay.get(item.date) ?? 0,
          weeklyPercent: weeklyByDay.get(item.date) ?? null,
        }));

        if (groupTrendRequestRef.current === requestId) {
          setGroupTrendPoints(points);
        }
      } finally {
        if (groupTrendRequestRef.current === requestId) {
          setGroupTrendLoading(false);
        }
      }
    },
    [groupOverviewTab],
  );

  const openGroupOverview = useCallback(() => {
    const normalizedFilter = normalizeProviderKey(filter);
    const nextTab =
      normalizedFilter && normalizedFilter !== "all" && providerOptions.includes(normalizedFilter)
        ? normalizedFilter
        : "all";
    setGroupOverviewTab(nextTab);
    setGroupOverviewOpen(true);
    void refreshGroupOverview(nextTab);
    void refreshGroupTrend(nextTab);
  }, [filter, providerOptions, refreshGroupOverview, refreshGroupTrend]);

  useEffect(() => {
    if (!groupOverviewOpen) return;
    void refreshGroupTrend(groupOverviewTab);
  }, [groupOverviewOpen, groupOverviewTab, refreshGroupTrend]);

  return {
    groupOverviewOpen,
    setGroupOverviewOpen,
    groupOverviewTab,
    setGroupOverviewTab,
    groupOverviewLoading,
    groupTrendLoading,
    formatAveragePercent,
    groupOverviewTabs,
    activeGroupOverview,
    activeGroupRows,
    activeGroupTitle,
    groupOverviewChartOption,
    refreshGroupOverview,
    refreshGroupTrend,
    openGroupOverview,
  };
}
