import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@code-proxy/api-client";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  buildLast7DayAxis,
  normalizeProviderKey,
  resolveAuthFileDisplayName,
  resolveFileType,
  type AuthFilesGroupOverviewRow,
  type UsageIndex,
} from "@code-proxy/domain";
import type { QuotaItem, QuotaState } from "@features/quota-preview/quota-helpers";
import type { QuotaProvider } from "@features/quota-preview/quota-fetch";
import {
  collectWeeklyFamilies,
  formatWeeklySeriesLabel,
  normalizeGroupTrendSeries,
  WEEKLY_SERIES_COLORS,
  type GroupOverviewSummary,
  type GroupTrendPoint,
} from "./groupOverviewWeekly";
import type { QuotaCardSlot } from "./quotaCardSlots";

interface UseAuthFilesGroupOverviewArgs {
  filter: string;
  filteredFiles: AuthFileItem[];
  providerOptions: string[];
  quotaByFileName: Record<string, QuotaState>;
  usageIndex: UsageIndex;
  tab: "files" | "excluded" | "alias";
  runQuotaRefreshBatch: (
    targets: { file: AuthFileItem; provider: QuotaProvider }[],
    options?: { showLoading?: boolean },
  ) => Promise<void>;
  resolveQuotaProvider: (file: AuthFileItem) => QuotaProvider | null;
  resolveQuotaCardSlots: (
    provider: QuotaProvider,
    items: QuotaItem[],
  ) => { id: string; label: string; item: QuotaItem | null }[];
  resolveAuthFileStats: (
    file: AuthFileItem,
    index: UsageIndex,
  ) => { success: number; failure: number };
  resolveProviderLabel: (providerKey: string) => string;
}

export function useAuthFilesGroupOverview({
  filter,
  filteredFiles,
  providerOptions,
  quotaByFileName,
  usageIndex,
  tab,
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
  const [groupTrendPoints, setGroupTrendPoints] = useState<GroupTrendPoint[]>([]);
  const [groupTrendSeries, setGroupTrendSeries] = useState<{ id: string; label: string; color: string }[]>(
    [],
  );
  const groupTrendRequestRef = useRef(0);

  const formatAveragePercent = useCallback((value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "--";
    return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
  }, []);

  // Match by window length so claude (five_hour/seven_day), xai, etc. contribute
  // to group averages — codex/kimi keep their stable slot ids as the fast path.
  const resolveSlotWindowPercent = useCallback(
    (
      slots: { id: string; item: QuotaItem | null }[],
      window: "5h" | "week",
    ): number | null => {
      const preferredId = window === "5h" ? "code_5h" : "code_week";
      const matchesWindow = (item: QuotaItem | null): boolean => {
        const windowSeconds = item?.windowSeconds;
        if (typeof windowSeconds !== "number") return false;
        return window === "5h" ? windowSeconds === 18000 : windowSeconds >= 604800;
      };
      const slot =
        slots.find((candidate) => candidate.id === preferredId) ??
        slots.find((candidate) => matchesWindow(candidate.item));
      const percent = slot?.item?.percent;
      return typeof percent === "number" && Number.isFinite(percent) ? percent : null;
    },
    [],
  );

  const groupOverviewTabs = useMemo(() => ["all", ...providerOptions], [providerOptions]);

  const computeGroupOverview = useCallback(
    (targetFiles: AuthFileItem[]): GroupOverviewSummary => {
      let totalCalls = 0;
      const fiveHourValues: number[] = [];
      const weeklySlotsByFile: QuotaCardSlot[][] = [];

      targetFiles.forEach((file) => {
        const stats = resolveAuthFileStats(file, usageIndex);
        totalCalls += stats.success + stats.failure;

        const provider = resolveQuotaProvider(file);
        if (!provider) return;

        const state = quotaByFileName[file.name];
        const items = Array.isArray(state?.items) ? state.items : [];
        if (items.length === 0) return;

        const slots = resolveQuotaCardSlots(provider, items);
        weeklySlotsByFile.push(slots);
        const fiveHour = resolveSlotWindowPercent(slots, "5h");
        if (fiveHour !== null) fiveHourValues.push(fiveHour);
      });

      const weeklyFamilies = collectWeeklyFamilies(weeklySlotsByFile);
      const weeklyValues = weeklyFamilies
        .map((family) => family.remainingPercent)
        .filter((value): value is number => typeof value === "number");
      const average = (values: number[]) =>
        values.length === 0
          ? null
          : values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

      return {
        totalCalls,
        averageFiveHour: average(fiveHourValues),
        averageWeekly: weeklyFamilies.length === 1 ? weeklyFamilies[0]?.remainingPercent ?? null : average(weeklyValues),
        weeklyFamilies,
        quotaSampleCount: Math.max(fiveHourValues.length, ...weeklyFamilies.map((family) => family.sampleCount), 0),
      };
    },
    [
      quotaByFileName,
      resolveAuthFileStats,
      resolveQuotaCardSlots,
      resolveQuotaProvider,
      resolveSlotWindowPercent,
      usageIndex,
    ],
  );

  const groupOverviewByTab = useMemo<Record<string, GroupOverviewSummary>>(() => {
    const map: Record<string, GroupOverviewSummary> = {
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
          return {
            name: resolveAuthFileDisplayName(file) || file.name,
            totalCalls: stats.success + stats.failure,
            averageFiveHour: resolveSlotWindowPercent(slots, "5h"),
            averageWeekly: resolveSlotWindowPercent(slots, "week"),
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
    resolveSlotWindowPercent,
    usageIndex,
  ]);

  const activeGroupOverview = useMemo<GroupOverviewSummary>(() => {
    return (
      groupOverviewByTab[groupOverviewTab] ?? groupOverviewByTab.all ?? computeGroupOverview([])
    );
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
    const formatPercent = (value: unknown) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return "-";
      return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
    };
    const weeklySeries = groupTrendSeries.map((series) => ({
      name: series.label,
      type: "line",
      yAxisIndex: 1,
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 3, color: series.color },
      itemStyle: { color: series.color },
      connectNulls: false,
      data: groupTrendPoints.map((point) => point.weeklyPercents[series.id] ?? null),
    }));

    return {
      backgroundColor: "transparent",
      animationDuration: 420,
      animationDurationUpdate: 280,
      grid: {
        left: 48,
        right: 44,
        top: groupTrendSeries.length > 2 ? 52 : 36,
        bottom: 44,
        containLabel: false,
      },
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
        formatter: (params: Array<{ seriesName?: string; value?: unknown; axisValueLabel?: string; marker?: string }>) => {
          const title = params[0]?.axisValueLabel ?? "";
          const rows = params.map((item) => {
            const isPercent = item.seriesName !== t("auth_files.group_overview_total_calls_label");
            const display = isPercent ? formatPercent(item.value) : String(item.value ?? 0);
            return `${item.marker ?? ""} ${item.seriesName ?? ""}&nbsp;&nbsp;<b>${display}</b>`;
          });
          return [title, ...rows].join("<br/>");
        },
      },
      legend: {
        top: 0,
        left: 0,
        type: "scroll",
        textStyle: { color: "#64748b", fontSize: 12 },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          color: "#64748b",
          fontSize: 12,
        },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
      },
      yAxis: [
        {
          type: "value",
          axisLabel: { color: "#64748b", fontSize: 12, margin: 10 },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } },
        },
        {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: {
            color: "#64748b",
            fontSize: 12,
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
        ...weeklySeries,
      ],
    };
  }, [groupTrendPoints, groupTrendSeries, t]);

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
        const targets = scopedFiles
          .map((file) => {
            const provider = resolveQuotaProvider(file);
            return provider ? { file, provider } : null;
          })
          .filter(Boolean) as { file: AuthFileItem; provider: QuotaProvider }[];
        await runQuotaRefreshBatch(targets, { showLoading: true });
      } finally {
        setGroupOverviewLoading(false);
      }
    },
    [filteredFiles, groupOverviewTab, resolveQuotaProvider, runQuotaRefreshBatch, tab],
  );

  const refreshGroupTrend = useCallback(
    async (targetGroup = groupOverviewTab) => {
      const requestId = Date.now();
      groupTrendRequestRef.current = requestId;
      setGroupTrendLoading(true);

      try {
        const axis = buildLast7DayAxis();
        const callsByDay = new Map(axis.map((item) => [item.date, 0]));
        const resp = await usageApi.getAuthFileGroupTrend(targetGroup, 7);
        (resp.points || []).forEach((point) => {
          if (callsByDay.has(point.date)) callsByDay.set(point.date, point.requests ?? 0);
        });
        const rawSeries = normalizeGroupTrendSeries(resp.quota_series, resp.quota_points);
        const seriesMeta = rawSeries.map((item, index) => ({
          id: item.quota_key || `weekly_${index}`,
          label: formatWeeklySeriesLabel(item.quota_key ?? "", item.quota_label ?? "", t),
          color: WEEKLY_SERIES_COLORS[index % WEEKLY_SERIES_COLORS.length] ?? WEEKLY_SERIES_COLORS[0],
        }));
        const percentsBySeries = new Map<string, Map<string, number | null>>();
        rawSeries.forEach((item, index) => {
          const id = seriesMeta[index]?.id ?? `weekly_${index}`;
          const byDay = new Map(axis.map((day) => [day.date, null as number | null]));
          (item.points || []).forEach((point) => {
            if (!byDay.has(point.date)) return;
            const percent = point.percent;
            byDay.set(point.date, typeof percent === "number" && Number.isFinite(percent) ? percent : null);
          });
          percentsBySeries.set(id, byDay);
        });
        const points: GroupTrendPoint[] = axis.map((item) => {
          const weeklyPercents: Record<string, number | null> = {};
          seriesMeta.forEach((series) => {
            weeklyPercents[series.id] = percentsBySeries.get(series.id)?.get(item.date) ?? null;
          });
          return {
            date: item.date,
            label: item.label,
            calls: callsByDay.get(item.date) ?? 0,
            weeklyPercent: seriesMeta[0] ? (weeklyPercents[seriesMeta[0].id] ?? null) : null,
            weeklyPercents,
          };
        });

        if (groupTrendRequestRef.current === requestId) {
          setGroupTrendSeries(seriesMeta);
          setGroupTrendPoints(points);
        }
      } finally {
        if (groupTrendRequestRef.current === requestId) {
          setGroupTrendLoading(false);
        }
      }
    },
    [groupOverviewTab, t],
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
