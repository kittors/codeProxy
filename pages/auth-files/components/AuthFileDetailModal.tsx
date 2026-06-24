import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import type { AuthFileTrendResponse } from "@code-proxy/api-client/endpoints/usage";
import type {
  AuthFileItem,
  AuthFileSubscriptionPeriod,
  IdentityFingerprintAccountDetail,
  IdentityFingerprintFieldSource,
} from "@code-proxy/api-client";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
import { Button } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { DateTimePicker } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Select } from "@code-proxy/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { EChart } from "@code-proxy/ui";
import { ProxyPoolSelect } from "@features/proxy-pool";
import { useProxyPoolChecks } from "@features/proxy-pool";
import {
  canRenameAuthFileChannel,
  downloadTextAsFile,
  matchesModelPattern,
  normalizeProviderKey,
  parseAdditionalQuotaWindowLabel,
  readAuthFileChannelName,
  resolveClaudeOAuthHealth,
  resolveAuthFileDisplayName,
  resolveAuthFilePlanType,
  resolveFileType,
  type AuthFileModelItem,
  type AuthFileModelOwnerGroup,
  type ChannelEditorState,
  type ClaudeOAuthHealthWindow,
  type CodexOAuthAdmissionEditorState,
  type PrefixProxyEditorState,
} from "@code-proxy/domain";

type DetailTab = "usage" | "identity" | "fields" | "models";
type DetailTrendWindow = "5h" | "week";
type TrendQuotaSeries = AuthFileTrendResponse["quota_series"][number];
type TrendUsagePoint = AuthFileTrendResponse["hourly_usage"][number];
type IdentityFingerprintFieldSection = "effective" | "learned" | "observed";

interface IdentityFingerprintFieldRow {
  id: string;
  section: IdentityFingerprintFieldSection;
  field: string;
  value: string;
  source: IdentityFingerprintFieldSource;
}

const FIVE_HOUR_WINDOW_SECONDS = 18000;
const WEEK_WINDOW_SECONDS = 604800;
const TREND_CHART_ANIMATION_MS = 680;
const TREND_CHART_ANIMATION_GUARD_MS = TREND_CHART_ANIMATION_MS + 120;
const SUMMARY_CARD_CLASS_NAME = "min-w-0 rounded-lg bg-slate-50/80 px-3 py-3 dark:bg-white/[0.04]";
const SUMMARY_LABEL_CLASS_NAME = "text-xs font-semibold text-slate-500 dark:text-white/55";
const SUMMARY_VALUE_CLASS_NAME =
  "mt-2 min-w-0 break-words text-2xl font-semibold leading-tight text-slate-950 dark:text-white";
const IDENTITY_FINGERPRINT_SOURCE_ORDER: IdentityFingerprintFieldSource[] = [
  "learned",
  "preset",
  "builtin_default",
];

const padTwo = (value: number) => String(value).padStart(2, "0");

const formatLocalDateKey = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

const formatLocalHourKey = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatLocalDateKey(timestamp)} ${padTwo(date.getHours())}:00`;
};

const formatCurrency = (value: number) => `$${(Number.isFinite(value) ? value : 0).toFixed(4)}`;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const toQuotaUsedPercent = (remainingPercent: number | null | undefined) => {
  if (typeof remainingPercent !== "number" || !Number.isFinite(remainingPercent)) return null;
  return clampPercent(100 - clampPercent(remainingPercent));
};

const formatPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(clampPercent(value))}%`;
};

const sumUsageCost = (points: TrendUsagePoint[]) =>
  points.reduce((total, point) => {
    const cost = typeof point.cost === "number" && Number.isFinite(point.cost) ? point.cost : 0;
    return total + Math.max(0, cost);
  }, 0);

const latestQuotaUsedPercent = (
  seriesList: TrendQuotaSeries[],
  quotaKey: string,
  matchesWindow: (windowSeconds: number) => boolean,
) => {
  let latestTimestamp = -Infinity;
  let latestUsedPercent: number | null = null;

  seriesList.forEach((series) => {
    if (!matchesWindow(series.window_seconds) || series.quota_key !== quotaKey) return;

    series.points.forEach((point) => {
      const usedPercent = toQuotaUsedPercent(point.percent);
      if (usedPercent === null) return;
      const timestamp = Date.parse(point.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < latestTimestamp) return;
      latestTimestamp = timestamp;
      latestUsedPercent = usedPercent;
    });
  });

  return latestUsedPercent;
};

const estimateQuotaBudget = (cost: number, usedPercent: number | null | undefined) => {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) return 0;
  const normalizedUsedPercent = clampPercent(usedPercent);
  if (normalizedUsedPercent <= 0) return 0;
  return cost / (normalizedUsedPercent / 100);
};

interface AuthFileDetailModalProps {
  open: boolean;
  detailFile: AuthFileItem | null;
  detailLoading: boolean;
  detailText: string;
  detailTab: DetailTab;
  setDetailOpen: Dispatch<SetStateAction<boolean>>;
  setDetailTab: Dispatch<SetStateAction<DetailTab>>;
  detailTrendWindow: DetailTrendWindow;
  setDetailTrendWindow: Dispatch<SetStateAction<DetailTrendWindow>>;
  detailTrend: AuthFileTrendResponse | null;
  detailTrendLoading: boolean;
  detailTrendError: string | null;
  identityFingerprintDetail: IdentityFingerprintAccountDetail | null;
  identityFingerprintLoading: boolean;
  identityFingerprintError: string | null;
  refreshDetailTrend: (file?: AuthFileItem | null, options?: { silent?: boolean }) => Promise<void>;
  loadModelsForDetail: (file: AuthFileItem, options?: { force?: boolean }) => Promise<void>;
  loadModelOwnerGroups: () => Promise<void>;
  modelsLoading: boolean;
  modelsError: string | null;
  modelsList: AuthFileModelItem[];
  modelsFileType: string;
  modelOwnerGroupsLoading: boolean;
  mappedModelOwnerGroup: AuthFileModelOwnerGroup | null;
  mappedModelOwnerValue: string;
  excluded: Record<string, string[]>;
  prefixProxyEditor: PrefixProxyEditorState;
  setPrefixProxyEditor: Dispatch<SetStateAction<PrefixProxyEditorState>>;
  prefixProxyDirty: boolean;
  savePrefixProxy: () => Promise<void>;
  proxyPoolEntries: ProxyPoolEntry[];
  channelEditor: ChannelEditorState;
  setChannelEditor: Dispatch<SetStateAction<ChannelEditorState>>;
  saveChannelEditor: () => Promise<boolean>;
  codexOAuthAdmissionEditor: CodexOAuthAdmissionEditorState;
  setCodexOAuthAdmissionEditor: Dispatch<SetStateAction<CodexOAuthAdmissionEditorState>>;
  codexOAuthAdmissionDirty: boolean;
  saveCodexOAuthAdmission: () => Promise<boolean>;
}

export function AuthFileDetailModal({
  open,
  detailFile,
  detailLoading,
  detailText,
  detailTab,
  setDetailOpen,
  setDetailTab,
  detailTrendWindow,
  setDetailTrendWindow,
  detailTrend,
  detailTrendLoading,
  detailTrendError,
  identityFingerprintDetail,
  identityFingerprintLoading,
  identityFingerprintError,
  refreshDetailTrend,
  loadModelsForDetail,
  loadModelOwnerGroups,
  modelsLoading,
  modelsError,
  modelsList,
  modelsFileType,
  modelOwnerGroupsLoading,
  mappedModelOwnerGroup,
  mappedModelOwnerValue,
  excluded,
  prefixProxyEditor,
  setPrefixProxyEditor,
  prefixProxyDirty,
  savePrefixProxy,
  proxyPoolEntries,
  channelEditor,
  setChannelEditor,
  saveChannelEditor,
  codexOAuthAdmissionEditor,
  setCodexOAuthAdmissionEditor,
  codexOAuthAdmissionDirty,
  saveCodexOAuthAdmission,
}: AuthFileDetailModalProps) {
  const { t, i18n } = useTranslation();
  const proxyCheckState = useProxyPoolChecks(proxyPoolEntries, open && detailTab === "fields");
  const usesMappedModelOwner = Boolean(mappedModelOwnerValue);
  const visibleModelsList = usesMappedModelOwner
    ? (mappedModelOwnerGroup?.models ?? [])
    : modelsList;
  const visibleModelsLoading = usesMappedModelOwner ? modelOwnerGroupsLoading : modelsLoading;
  const visibleModelsError = usesMappedModelOwner ? null : modelsError;
  const providerKey = normalizeProviderKey(modelsFileType);
  const detailProviderKey = detailFile ? normalizeProviderKey(resolveFileType(detailFile)) : "";
  const supportsUsageTrend = detailProviderKey === "kimi" || detailProviderKey === "codex";
  const hasIdentityFingerprint = Boolean(detailFile?.identity_fingerprint_summary);
  const openedDetailFileRef = useRef<string | null>(null);
  const detailOpenCounterRef = useRef(0);
  const [detailOpenKey, setDetailOpenKey] = useState("");
  const [animatedTrendKey, setAnimatedTrendKey] = useState("");
  const detailTitle = detailFile
    ? resolveAuthFileDisplayName(detailFile) || String(detailFile.name || "")
    : t("auth_files.view_auth_file");
  const claudeOAuthHealth = detailFile ? resolveClaudeOAuthHealth(detailFile) : null;
  const detailPlanType = detailFile ? resolveAuthFilePlanType(detailFile) : null;
  const detailPlanLabel = useMemo(() => {
    if (!detailPlanType) return "";
    const normalized = detailPlanType.trim().toLowerCase();
    if (!normalized) return "";
    if (normalized === "plus" || normalized === "team" || normalized === "free") {
      return t(`codex_quota.plan_${normalized}`);
    }
    return normalized;
  }, [detailPlanType, t]);
  const excludedModels = excluded[providerKey] ?? [];
  const canRenameChannel = detailFile ? canRenameAuthFileChannel(detailFile) : false;
  const channelBaseline = detailFile ? readAuthFileChannelName(detailFile) : "";
  const channelEditorMatchesFile = Boolean(
    detailFile && channelEditor.fileName === detailFile.name,
  );
  const channelLabelValue =
    canRenameChannel && channelEditorMatchesFile ? channelEditor.label : channelBaseline;
  const channelDirty =
    canRenameChannel && channelEditorMatchesFile && channelEditor.label.trim() !== channelBaseline;
  const saveFieldsDisabled =
    prefixProxyEditor.loading ||
    prefixProxyEditor.saving ||
    channelEditor.saving ||
    codexOAuthAdmissionEditor.saving ||
    !((prefixProxyDirty && prefixProxyEditor.json) || channelDirty || codexOAuthAdmissionDirty);
  const translateQuotaLabel = useMemo(
    () => (label: string) => {
      if (!label) return label;
      if (label.startsWith("m_quota.")) return t(label);
      const additionalQuota = parseAdditionalQuotaWindowLabel(label);
      if (additionalQuota) {
        return t(`m_quota.additional_${additionalQuota.window}`, {
          name: additionalQuota.name,
        });
      }
      return label;
    },
    [t],
  );
  const activeQuotaSeries = useMemo(() => {
    const series = detailTrend?.quota_series ?? [];
    return series.filter((item) =>
      detailTrendWindow === "5h"
        ? item.window_seconds === FIVE_HOUR_WINDOW_SECONDS
        : item.window_seconds >= WEEK_WINDOW_SECONDS,
    );
  }, [detailTrend, detailTrendWindow]);
  useLayoutEffect(() => {
    const fileName = open && detailFile ? detailFile.name : "";
    if (!fileName) {
      openedDetailFileRef.current = null;
      setDetailOpenKey("");
      return;
    }
    if (openedDetailFileRef.current === fileName) return;
    openedDetailFileRef.current = fileName;
    detailOpenCounterRef.current += 1;
    setDetailOpenKey(`${fileName}:${detailOpenCounterRef.current}`);
  }, [detailFile?.name, open]);
  const trendAnimationKey =
    detailFile && detailTrend && detailOpenKey ? `${detailOpenKey}:${detailTrend.auth_index}` : "";
  const shouldAnimateTrend = Boolean(trendAnimationKey && animatedTrendKey !== trendAnimationKey);
  const markTrendAnimationDone = useCallback(() => {
    if (!trendAnimationKey) return;
    setAnimatedTrendKey((current) => (current === trendAnimationKey ? current : trendAnimationKey));
  }, [trendAnimationKey]);
  useEffect(() => {
    if (!shouldAnimateTrend) return;
    const timer = window.setTimeout(markTrendAnimationDone, 900);
    return () => window.clearTimeout(timer);
  }, [markTrendAnimationDone, shouldAnimateTrend]);
  const trendChartEvents = useMemo(
    () => (shouldAnimateTrend ? { finished: markTrendAnimationDone } : undefined),
    [markTrendAnimationDone, shouldAnimateTrend],
  );
  const trendChartOption = useMemo(() => {
    const usagePoints =
      detailTrendWindow === "5h"
        ? (detailTrend?.hourly_usage ?? [])
        : (detailTrend?.daily_usage ?? []);
    const xKeys = new Set<string>();
    const requestByKey = new Map<string, number>();
    const costByKey = new Map<string, number>();

    usagePoints.forEach((point) => {
      const key = detailTrendWindow === "5h" ? point.hour : point.date;
      if (!key) return;
      xKeys.add(key);
      requestByKey.set(key, point.requests ?? 0);
      costByKey.set(key, point.cost ?? 0);
    });

    const quotaBySeries = activeQuotaSeries.map((series) => {
      const values = new Map<string, number | null>();
      series.points.forEach((point) => {
        if (!point.timestamp) return;
        const key =
          detailTrendWindow === "5h"
            ? formatLocalHourKey(point.timestamp)
            : formatLocalDateKey(point.timestamp);
        if (!key || !xKeys.has(key)) return;
        values.set(key, toQuotaUsedPercent(point.percent));
      });
      return { series, values };
    });

    const sortedKeys = Array.from(xKeys).sort();
    const formatAxisLabel = (key: string) =>
      detailTrendWindow === "5h" ? key.slice(5) : key.slice(5);
    const compactQuotaLegendLabel = (label: string) => {
      const translated = translateQuotaLabel(label).trim();
      if (translated.length <= 14) return translated;
      const colonIndex = Math.max(translated.lastIndexOf(":"), translated.lastIndexOf("："));
      const suffix = colonIndex >= 0 ? translated.slice(colonIndex + 1).trim() : "";
      if (suffix) return suffix.length > 14 ? `${suffix.slice(0, 14)}...` : suffix;
      return `${translated.slice(0, 14)}...`;
    };
    const palette = ["#2563eb", "#db2777", "#16a34a", "#9333ea", "#0f766e", "#dc2626"];

    return {
      animation: shouldAnimateTrend,
      animationDuration: shouldAnimateTrend ? TREND_CHART_ANIMATION_MS : 0,
      animationDurationUpdate: 0,
      animationEasing: "cubicOut" as const,
      grid: { left: 46, right: 108, top: 74, bottom: 38 },
      tooltip: { trigger: "axis", confine: true },
      legend: {
        top: 8,
        left: 8,
        right: 8,
        type: "scroll",
        itemGap: 14,
        pageButtonPosition: "end",
        pageIconColor: "#64748b",
        pageIconInactiveColor: "#cbd5e1",
        pageTextStyle: { color: "#64748b" },
        textStyle: {
          color: "#64748b",
          width: 154,
          overflow: "truncate",
        },
      },
      xAxis: {
        type: "category",
        data: sortedKeys.map(formatAxisLabel),
        axisLabel: { color: "#64748b", hideOverlap: true },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          axisLabel: { color: "#64748b", hideOverlap: true },
          splitLine: { lineStyle: { color: "#e2e8f0" } },
        },
        {
          type: "value",
          min: 0,
          max: 100,
          offset: 46,
          axisLabel: { color: "#64748b", formatter: "{value}%", hideOverlap: true },
          splitLine: { show: false },
        },
        {
          type: "value",
          min: 0,
          axisLabel: {
            color: "#64748b",
            hideOverlap: true,
            formatter: (value: number) => {
              if (!Number.isFinite(value)) return "$0";
              if (Math.abs(value) < 1) return `$${value.toFixed(3)}`;
              return `$${value.toFixed(1)}`;
            },
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t("auth_files.trend_requests"),
          type: "bar",
          yAxisIndex: 0,
          animation: shouldAnimateTrend,
          animationDuration: shouldAnimateTrend ? TREND_CHART_ANIMATION_MS : 0,
          animationDurationUpdate: 0,
          barMaxWidth: 24,
          itemStyle: { color: "#2563eb", borderRadius: [4, 4, 0, 0] },
          data: sortedKeys.map((key) => requestByKey.get(key) ?? 0),
        },
        {
          name: t("auth_files.trend_cost"),
          type: "line",
          yAxisIndex: 2,
          animation: shouldAnimateTrend,
          animationDuration: shouldAnimateTrend ? TREND_CHART_ANIMATION_MS : 0,
          animationDurationUpdate: 0,
          connectNulls: true,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2.2, color: "#db2777" },
          itemStyle: { color: "#db2777" },
          areaStyle: { color: "rgba(219, 39, 119, 0.08)" },
          tooltip: {
            valueFormatter: (value: number) => formatCurrency(Number(value)),
          },
          data: sortedKeys.map((key) => costByKey.get(key) ?? 0),
        },
        ...quotaBySeries.map(({ series, values }, index) => ({
          name: `${compactQuotaLegendLabel(series.quota_label)} ${t(
            "auth_files.trend_quota_used_suffix",
          )}`,
          type: "line",
          yAxisIndex: 1,
          animation: shouldAnimateTrend,
          animationDuration: shouldAnimateTrend ? TREND_CHART_ANIMATION_MS : 0,
          animationDurationUpdate: 0,
          connectNulls: true,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: palette[(index + 2) % palette.length] },
          itemStyle: { color: palette[(index + 2) % palette.length] },
          tooltip: {
            valueFormatter: (value: number) =>
              typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "--",
          },
          data: sortedKeys.map((key) => values.get(key) ?? null),
        })),
      ],
    };
  }, [
    activeQuotaSeries,
    detailTrend,
    detailTrendWindow,
    shouldAnimateTrend,
    t,
    translateQuotaLabel,
  ]);

  const closeModal = () => {
    setDetailOpen(false);
    setDetailTab("fields");
  };

  const saveFields = async () => {
    if (channelDirty) {
      const saved = await saveChannelEditor();
      if (!saved) return;
    }
    if (codexOAuthAdmissionDirty) {
      const saved = await saveCodexOAuthAdmission();
      if (!saved) return;
    }
    if (prefixProxyDirty) {
      await savePrefixProxy();
    }
  };

  const updateCodexAllowedClient = (clientId: string, checked: boolean) => {
    const normalizedId = clientId.trim().toLowerCase();
    if (!normalizedId) return;
    setCodexOAuthAdmissionEditor((prev) => {
      const current = new Set(prev.allowedClients.map((id) => id.trim().toLowerCase()));
      if (checked) {
        current.add(normalizedId);
      } else {
        current.delete(normalizedId);
      }
      const ordered = prev.availableAllowedClients
        .map((preset) => preset.id.trim().toLowerCase())
        .filter((id) => id && current.has(id));
      return { ...prev, allowedClients: ordered, error: null };
    });
  };

  const formatOptionalText = (value: unknown): string => {
    if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim()) return value.trim();
    return "--";
  };

  const formatOptionalDate = (value: unknown): string => {
    const raw = typeof value === "number" ? value : typeof value === "string" ? value.trim() : "";
    if (!raw) return "--";
    const numberValue = Number(raw);
    const date =
      Number.isFinite(numberValue) && numberValue > 0
        ? new Date(numberValue < 1e12 ? numberValue * 1000 : numberValue)
        : new Date(String(raw));
    return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleString();
  };

  const formatHealthUtilization = (value: unknown): string => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "--";
    return `${Math.round(value * 100)}%`;
  };

  const renderHealthValue = (label: string, value: string) => (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.02em] text-slate-500 dark:text-white/45">
        {label}
      </p>
      <p className="mt-1 min-w-0 break-words font-mono text-xs text-slate-900 dark:text-white/85">
        {value}
      </p>
    </div>
  );

  const renderHealthWindow = (label: string, window: ClaudeOAuthHealthWindow | undefined) => (
    <div className="min-w-0 rounded-lg bg-white px-3 py-3 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:ring-white/10">
      <p className="text-xs font-semibold text-slate-900 dark:text-white">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {renderHealthValue(
          t("auth_files.claude_oauth_health_window_status"),
          formatOptionalText(window?.status),
        )}
        {renderHealthValue(
          t("auth_files.claude_oauth_health_window_reset"),
          formatOptionalDate(window?.reset_at),
        )}
        {renderHealthValue(
          t("auth_files.claude_oauth_health_window_utilization"),
          formatHealthUtilization(window?.utilization),
        )}
        {renderHealthValue(
          t("auth_files.claude_oauth_health_window_exceeded"),
          formatOptionalText(window?.exceeded),
        )}
      </div>
    </div>
  );

  const formatIdentitySource = (source: IdentityFingerprintFieldSource): string =>
    t(`auth_files.identity_fingerprint_source_${source}`);

  const renderIdentitySourceBadge = (source: IdentityFingerprintFieldSource) => {
    const className =
      source === "learned"
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
        : source === "preset"
          ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
          : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/65";

    return (
      <span
        className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      >
        {formatIdentitySource(source)}
      </span>
    );
  };

  const identityFieldSectionLabel = (section: IdentityFingerprintFieldSection) => {
    if (section === "effective") return t("auth_files.identity_fingerprint_effective_fields");
    if (section === "learned") return t("auth_files.identity_fingerprint_learned_fields");
    return t("auth_files.identity_fingerprint_observed_headers");
  };

  const renderIdentitySummaryItem = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.02em] text-slate-500 dark:text-white/45">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words text-sm font-semibold text-slate-950 dark:text-white">
        {value}
      </dd>
    </div>
  );

  const identityFieldColumns: DataTableColumn<IdentityFingerprintFieldRow>[] = [
    {
      key: "section",
      label: t("auth_files.identity_fingerprint_table_section"),
      width: "w-40",
      resizable: false,
      reorderable: false,
      overflowTooltip: (row) => identityFieldSectionLabel(row.section),
      render: (row) => (
        <span className="block truncate text-xs font-semibold text-slate-700 dark:text-white/70">
          {identityFieldSectionLabel(row.section)}
        </span>
      ),
    },
    {
      key: "field",
      label: t("auth_files.identity_fingerprint_table_field"),
      width: "w-60",
      resizable: false,
      reorderable: false,
      overflowTooltip: (row) => row.field,
      render: (row) => (
        <code className="block truncate font-mono text-xs font-semibold text-slate-800 dark:text-white/85">
          {row.field}
        </code>
      ),
    },
    {
      key: "value",
      label: t("auth_files.identity_fingerprint_table_value"),
      width: "w-[32rem]",
      resizable: false,
      reorderable: false,
      overflowTooltip: (row) => row.value,
      render: (row) => (
        <span className="block truncate font-mono text-xs text-slate-700 dark:text-white/70">
          {row.value}
        </span>
      ),
    },
    {
      key: "source",
      label: t("auth_files.identity_fingerprint_table_source"),
      width: "w-36",
      resizable: false,
      reorderable: false,
      overflowTooltip: (row) => formatIdentitySource(row.source),
      render: (row) => renderIdentitySourceBadge(row.source),
    },
  ];

  const renderIdentityFingerprint = () => {
    const summary = identityFingerprintDetail?.summary ?? detailFile?.identity_fingerprint_summary;
    if (!summary) {
      return (
        <EmptyState
          title={t("auth_files.identity_fingerprint_empty")}
          description={t("auth_files.identity_fingerprint_empty_desc")}
        />
      );
    }

    const clientLabel =
      [summary.client_product, summary.client_variant].filter(Boolean).join(" / ") || "--";
    const effectiveRows = Object.entries(identityFingerprintDetail?.effective.fields ?? {})
      .map(
        ([key, field]): IdentityFingerprintFieldRow => ({
          id: `effective:${key}`,
          section: "effective",
          field: key,
          value: field.value,
          source: field.source,
        }),
      )
      .sort((left, right) => left.field.localeCompare(right.field));
    const learnedRows = Object.entries(identityFingerprintDetail?.learned?.fields ?? {})
      .map(
        ([key, value]): IdentityFingerprintFieldRow => ({
          id: `learned:${key}`,
          section: "learned",
          field: key,
          value,
          source: "learned",
        }),
      )
      .sort((left, right) => left.field.localeCompare(right.field));
    const observedHeaderRows = Object.entries(
      identityFingerprintDetail?.learned?.observed_headers ?? {},
    )
      .map(
        ([key, value]): IdentityFingerprintFieldRow => ({
          id: `observed:${key}`,
          section: "observed",
          field: key,
          value,
          source: "learned",
        }),
      )
      .sort((left, right) => left.field.localeCompare(right.field));
    const identityFieldRows = [...effectiveRows, ...learnedRows, ...observedHeaderRows];

    return (
      <div className="space-y-4" data-testid="auth-file-identity-fingerprint">
        <div className="rounded-lg bg-slate-50/80 px-4 py-4 dark:bg-white/[0.04]">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="min-w-0 break-words text-sm font-semibold text-slate-950 dark:text-white">
                {clientLabel}
              </p>
              <p className="mt-1 min-w-0 break-words text-xs text-slate-500 dark:text-white/55">
                {formatOptionalText(summary.provider)} · {formatOptionalText(summary.account_key)}
              </p>
            </div>
            <div className="shrink-0">{renderIdentitySourceBadge(summary.primary_source)}</div>
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {renderIdentitySummaryItem(
              t("auth_files.identity_fingerprint_auth_subject"),
              formatOptionalText(summary.auth_subject_id),
            )}
            {renderIdentitySummaryItem(
              t("auth_files.identity_fingerprint_version"),
              formatOptionalText(summary.version),
            )}
            {renderIdentitySummaryItem(
              t("auth_files.identity_fingerprint_updated_at"),
              formatOptionalDate(summary.updated_at),
            )}
            {renderIdentitySummaryItem(
              t("auth_files.identity_fingerprint_last_seen_at"),
              formatOptionalDate(summary.last_seen_at),
            )}
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:text-white/65 dark:ring-white/10">
              {t("auth_files.identity_fingerprint_effective_count")}: {summary.effective_fields}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:text-white/65 dark:ring-white/10">
              {t("auth_files.identity_fingerprint_learned_count")}: {summary.learned_fields}
            </span>
            {IDENTITY_FINGERPRINT_SOURCE_ORDER.map((source) => (
              <span
                key={source}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:text-white/65 dark:ring-white/10"
              >
                {formatIdentitySource(source)}: {summary.source_counts?.[source] ?? 0}
              </span>
            ))}
          </div>
        </div>

        {identityFingerprintLoading && !identityFingerprintDetail ? (
          <div
            className="grid gap-2 rounded-lg bg-slate-50/80 px-3 py-3 dark:bg-white/[0.04]"
            data-testid="auth-file-identity-loading"
          >
            <div className="h-3 w-36 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          </div>
        ) : null}

        {identityFingerprintError ? (
          <EmptyState
            title={t("auth_files.identity_fingerprint_loading_failed")}
            description={identityFingerprintError}
          />
        ) : null}

        {identityFingerprintDetail ? (
          <section className="min-w-0 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("auth_files.identity_fingerprint_title")}
              </p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                {t("auth_files.count_items", { count: identityFieldRows.length })}
              </span>
            </div>
            <DataTable<IdentityFingerprintFieldRow>
              rows={identityFieldRows}
              columns={identityFieldColumns}
              rowKey={(row) => row.id}
              rowHeight={48}
              minWidth="min-w-[980px]"
              minHeight="min-h-0"
              height="h-auto"
              naturalFlow
              caption={t("auth_files.identity_fingerprint_title")}
              emptyText={t("auth_files.identity_fingerprint_no_fields")}
              showAllLoadedMessage={false}
              columnReorderable={false}
              persistColumnOrder={false}
            />
          </section>
        ) : null}
      </div>
    );
  };

  const renderUsageTrend = () => {
    const isCodexDetail = detailProviderKey === "codex";
    const summaryGridClassName = isCodexDetail
      ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
      : "grid gap-3 sm:grid-cols-2 xl:grid-cols-5";
    const summarySkeletonCount = isCodexDetail ? 6 : 5;

    if (detailTrendLoading && !detailTrend) {
      const skeletonClass = "animate-pulse rounded-lg bg-slate-100/80 dark:bg-white/[0.06]";

      return (
        <div className="space-y-4" data-testid="auth-file-trend-loading" aria-hidden="true">
          <div className={summaryGridClassName}>
            {Array.from({ length: summarySkeletonCount }).map((_, index) => (
              <div key={index} className={`${skeletonClass} h-20`} />
            ))}
          </div>
          <div className="space-y-2">
            <div className={`${skeletonClass} h-4 w-32`} />
            <div className={`${skeletonClass} h-3 w-56 max-w-full`} />
          </div>
          <div className={`${skeletonClass} h-80 min-w-0`} />
        </div>
      );
    }

    if (detailTrendError) {
      return (
        <EmptyState title={t("auth_files.trend_load_failed")} description={detailTrendError} />
      );
    }

    if (!detailTrend) {
      return (
        <EmptyState
          title={t("auth_files.trend_empty")}
          description={t("auth_files.trend_empty_desc")}
        />
      );
    }

    const formatCount = (value: number) =>
      Number.isFinite(value) ? Math.round(value).toLocaleString() : "0";
    const cycleStart = detailTrend.cycle_start
      ? new Date(detailTrend.cycle_start).toLocaleString()
      : "--";
    const weeklyQuotaUsed = formatPercent(detailTrend.weekly_quota_used_percent);
    const fiveHourQuotaUsedPercent = isCodexDetail
      ? latestQuotaUsedPercent(
          detailTrend.quota_series,
          "code_5h",
          (windowSeconds) => windowSeconds === FIVE_HOUR_WINDOW_SECONDS,
        )
      : null;
    const weeklyQuotaUsedPercent =
      detailTrend.weekly_quota_used_percent ??
      (isCodexDetail
        ? latestQuotaUsedPercent(
            detailTrend.quota_series,
            "code_week",
            (windowSeconds) => windowSeconds >= WEEK_WINDOW_SECONDS,
          )
        : null);
    const estimatedFiveHourQuota = estimateQuotaBudget(
      sumUsageCost(detailTrend.hourly_usage),
      fiveHourQuotaUsedPercent,
    );
    const estimatedWeeklyQuota = estimateQuotaBudget(
      detailTrend.cycle_cost_total,
      weeklyQuotaUsedPercent,
    );

    return (
      <div className="space-y-4">
        <div className={summaryGridClassName}>
          {!isCodexDetail ? (
            <div className={SUMMARY_CARD_CLASS_NAME}>
              <p className={SUMMARY_LABEL_CLASS_NAME}>
                {t("auth_files.trend_last_7_days_requests")}
              </p>
              <p className={SUMMARY_VALUE_CLASS_NAME}>{formatCount(detailTrend.request_total)}</p>
            </div>
          ) : null}
          <div className={SUMMARY_CARD_CLASS_NAME}>
            <p className={SUMMARY_LABEL_CLASS_NAME}>{t("auth_files.trend_current_weekly_cycle")}</p>
            <p className={SUMMARY_VALUE_CLASS_NAME}>
              {formatCount(detailTrend.cycle_request_total)}
            </p>
          </div>
          <div className={SUMMARY_CARD_CLASS_NAME}>
            <p className={SUMMARY_LABEL_CLASS_NAME}>{t("auth_files.trend_current_cycle_cost")}</p>
            <p className={SUMMARY_VALUE_CLASS_NAME}>
              {formatCurrency(detailTrend.cycle_cost_total)}
            </p>
          </div>
          {isCodexDetail ? (
            <>
              <div className={SUMMARY_CARD_CLASS_NAME}>
                <p className={SUMMARY_LABEL_CLASS_NAME}>
                  {t("auth_files.trend_predicted_5h_window_quota")}
                </p>
                <p className={SUMMARY_VALUE_CLASS_NAME}>{formatCurrency(estimatedFiveHourQuota)}</p>
              </div>
              <div className={SUMMARY_CARD_CLASS_NAME}>
                <p className={SUMMARY_LABEL_CLASS_NAME}>
                  {t("auth_files.trend_predicted_week_window_quota")}
                </p>
                <p className={SUMMARY_VALUE_CLASS_NAME}>{formatCurrency(estimatedWeeklyQuota)}</p>
              </div>
            </>
          ) : null}
          <div className={SUMMARY_CARD_CLASS_NAME}>
            <p className={SUMMARY_LABEL_CLASS_NAME}>{t("auth_files.trend_weekly_quota_used")}</p>
            <p className={SUMMARY_VALUE_CLASS_NAME}>{weeklyQuotaUsed}</p>
          </div>
          <div className={SUMMARY_CARD_CLASS_NAME}>
            <p className={SUMMARY_LABEL_CLASS_NAME}>{t("auth_files.trend_cycle_start")}</p>
            <p className="mt-2 truncate text-sm font-semibold text-slate-800 dark:text-white/85">
              {cycleStart}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("auth_files.trend_window_title")}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
              {detailTrendWindow === "5h"
                ? t("auth_files.trend_window_5h_desc")
                : t("auth_files.trend_window_week_desc")}
            </p>
          </div>
          <Tabs
            value={detailTrendWindow}
            onValueChange={(next) => setDetailTrendWindow(next as DetailTrendWindow)}
            size="sm"
          >
            <TabsList>
              <TabsTrigger value="5h">{t("auth_files.trend_window_5h")}</TabsTrigger>
              <TabsTrigger value="week">{t("auth_files.trend_window_week")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="min-w-0 rounded-lg bg-slate-50/70 p-3 dark:bg-white/[0.04]">
          <EChart
            option={trendChartOption}
            className="h-80 min-w-0"
            onEvents={trendChartEvents}
            replaceMerge="series"
            initialAnimationGuardMs={shouldAnimateTrend ? TREND_CHART_ANIMATION_GUARD_MS : 0}
          />
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      title={detailTitle}
      titleAccessory={
        detailPlanLabel ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            {detailPlanLabel}
          </span>
        ) : undefined
      }
      maxWidth="max-w-6xl"
      bodyHeightClassName="h-[70vh]"
      bodyClassName="flex flex-col !overflow-hidden"
      bodyTestId="auth-file-detail-body"
      onClose={closeModal}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {detailTab === "models" && detailFile ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (usesMappedModelOwner) {
                  void loadModelOwnerGroups();
                } else {
                  void loadModelsForDetail(detailFile, { force: true });
                }
              }}
              disabled={visibleModelsLoading}
            >
              <RefreshCw size={14} className={visibleModelsLoading ? "animate-spin" : ""} />
              {t("auth_files.detail_models_refresh")}
            </Button>
          ) : null}

          {detailTab === "usage" && detailFile && supportsUsageTrend ? (
            <Button
              variant="secondary"
              onClick={() => void refreshDetailTrend(detailFile)}
              disabled={detailTrendLoading}
            >
              <RefreshCw size={14} />
              {t("auth_files.trend_refresh")}
            </Button>
          ) : null}

          {detailFile ? (
            <Button
              variant="secondary"
              onClick={() => downloadTextAsFile(detailText, detailFile.name)}
              disabled={detailLoading}
            >
              <Download size={14} />
              {t("auth_files.download")}
            </Button>
          ) : null}

          {detailTab === "fields" ? (
            <Button
              variant="primary"
              onClick={() => void saveFields()}
              disabled={saveFieldsDisabled}
            >
              <ShieldCheck size={14} />
              {t("auth_files.save")}
            </Button>
          ) : null}

          <Button variant="secondary" onClick={closeModal}>
            {t("auth_files.close")}
          </Button>
        </div>
      }
    >
      {!detailFile ? (
        <EmptyState title={t("auth_files.view_auth_file")} description="--" />
      ) : (
        <Tabs value={detailTab} onValueChange={(next) => setDetailTab(next as DetailTab)} size="sm">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0">
              <TabsList>
                {supportsUsageTrend ? (
                  <TabsTrigger value="usage">{t("auth_files.detail_tab_usage")}</TabsTrigger>
                ) : null}
                {hasIdentityFingerprint ? (
                  <TabsTrigger value="identity">{t("auth_files.detail_tab_identity")}</TabsTrigger>
                ) : null}
                <TabsTrigger value="fields">{t("auth_files.detail_tab_fields")}</TabsTrigger>
                <TabsTrigger value="models">{t("auth_files.detail_tab_models")}</TabsTrigger>
              </TabsList>
            </div>

            <div
              className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
              data-testid="auth-file-detail-scroll"
            >
              {supportsUsageTrend ? (
                <TabsContent value="usage" className="pb-1">
                  {renderUsageTrend()}
                </TabsContent>
              ) : null}

              {hasIdentityFingerprint ? (
                <TabsContent value="identity" className="pb-1">
                  {renderIdentityFingerprint()}
                </TabsContent>
              ) : null}

              <TabsContent value="fields" className="pb-1">
                {prefixProxyEditor.loading ? (
                  <div className="text-sm text-slate-600 dark:text-white/65">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : (
                  <div
                    className="grid max-w-none items-start gap-x-10 gap-y-5 lg:grid-cols-2"
                    data-testid="auth-file-fields-grid"
                  >
                    {claudeOAuthHealth ? (
                      <div
                        className="min-w-0 space-y-4 rounded-lg bg-slate-50/80 px-4 py-4 lg:col-span-2 dark:bg-white/[0.04]"
                        data-testid="claude-oauth-health-panel"
                      >
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {t("auth_files.claude_oauth_health_title")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                              {t("auth_files.claude_oauth_health_desc")}
                            </p>
                          </div>
                          {claudeOAuthHealth.status ? (
                            <span className="inline-flex max-w-full items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                              {claudeOAuthHealth.status}
                            </span>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_status_label"),
                            formatOptionalText(claudeOAuthHealth.status),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_refresh_available"),
                            formatOptionalText(claudeOAuthHealth.refresh_available),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_last_runtime"),
                            [
                              formatOptionalText(claudeOAuthHealth.last_runtime_status),
                              formatOptionalDate(claudeOAuthHealth.last_runtime_at),
                            ]
                              .filter((value) => value !== "--")
                              .join(" · ") || "--",
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_last_refresh"),
                            formatOptionalDate(claudeOAuthHealth.last_refresh_at),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_temporary_until"),
                            formatOptionalDate(claudeOAuthHealth.temporary_unschedulable_until),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_temporary_reason"),
                            formatOptionalText(claudeOAuthHealth.temporary_unschedulable_reason),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_last_401"),
                            [
                              formatOptionalDate(claudeOAuthHealth.last_401_at),
                              formatOptionalText(claudeOAuthHealth.last_401_message),
                            ]
                              .filter((value) => value !== "--")
                              .join(" · ") || "--",
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_egress"),
                            formatOptionalText(claudeOAuthHealth.runtime_profile?.egress),
                          )}
                        </div>

                        <div className="grid gap-3 xl:grid-cols-2">
                          {renderHealthWindow(
                            t("auth_files.claude_oauth_health_window_5h"),
                            claudeOAuthHealth.windows?.five_hour,
                          )}
                          {renderHealthWindow(
                            t("auth_files.claude_oauth_health_window_7d"),
                            claudeOAuthHealth.windows?.seven_day,
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_runtime_name"),
                            formatOptionalText(claudeOAuthHealth.runtime_profile?.name),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_runtime_identity"),
                            formatOptionalText(
                              claudeOAuthHealth.runtime_profile?.identity_fingerprint,
                            ),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_runtime_transport"),
                            formatOptionalText(claudeOAuthHealth.runtime_profile?.transport),
                          )}
                          {renderHealthValue(
                            t("auth_files.claude_oauth_health_updated_at"),
                            formatOptionalDate(claudeOAuthHealth.updated_at),
                          )}
                        </div>
                      </div>
                    ) : null}

                    {codexOAuthAdmissionEditor.supported ? (
                      <div
                        className="min-w-0 space-y-4 rounded-lg bg-slate-50/80 px-4 py-4 lg:col-span-2 dark:bg-white/[0.04]"
                        data-testid="codex-oauth-admission-panel"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {t("auth_files.codex_oauth_admission_title")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                              {t("auth_files.codex_oauth_admission_desc")}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                            {codexOAuthAdmissionEditor.enabled
                              ? t("auth_files.enabled")
                              : t("auth_files.disabled")}
                          </span>
                        </div>

                        <div
                          className="rounded-lg bg-white px-3 py-3 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:ring-white/10"
                          data-testid="codex-oauth-admission-toggle"
                        >
                          <ToggleSwitch
                            checked={codexOAuthAdmissionEditor.enabled}
                            onCheckedChange={(checked) =>
                              setCodexOAuthAdmissionEditor((prev) => ({
                                ...prev,
                                enabled: checked,
                                error: null,
                              }))
                            }
                            disabled={codexOAuthAdmissionEditor.saving}
                            label={t("auth_files.codex_oauth_admission_toggle")}
                            description={t("auth_files.codex_oauth_admission_toggle_hint")}
                          />
                        </div>

                        <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:ring-white/10">
                          <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                            {t("auth_files.codex_oauth_admission_allowed_clients")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                            {t("auth_files.codex_oauth_admission_allowed_clients_hint")}
                          </p>
                          {codexOAuthAdmissionEditor.availableAllowedClients.length ? (
                            <div className="mt-3 grid gap-2">
                              {codexOAuthAdmissionEditor.availableAllowedClients.map((preset) => (
                                <label
                                  key={preset.id}
                                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10"
                                >
                                  <Checkbox
                                    checked={codexOAuthAdmissionEditor.allowedClients.includes(
                                      preset.id,
                                    )}
                                    disabled={codexOAuthAdmissionEditor.saving}
                                    onCheckedChange={(checked) =>
                                      updateCodexAllowedClient(preset.id, checked)
                                    }
                                    data-testid={`codex-oauth-admission-preset-${preset.id}`}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                                      {preset.label}
                                    </span>
                                    {preset.description ? (
                                      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-white/55">
                                        {preset.description}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-slate-500 dark:text-white/55">
                              {t("auth_files.codex_oauth_admission_no_allowed_clients")}
                            </p>
                          )}
                        </div>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <p className="rounded-lg bg-white px-3 py-2.5 text-xs leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:text-white/60 dark:ring-white/10">
                            {t("auth_files.codex_oauth_admission_auto_learning")}
                          </p>
                          <p className="rounded-lg bg-white px-3 py-2.5 text-xs leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950/40 dark:text-white/60 dark:ring-white/10">
                            {t("auth_files.codex_oauth_admission_fixed_presets")}
                          </p>
                        </div>

                        {codexOAuthAdmissionEditor.error ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {codexOAuthAdmissionEditor.error}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {canRenameChannel || prefixProxyEditor.json ? (
                      <div className="min-w-0 space-y-5">
                        {canRenameChannel ? (
                          <div className="grid gap-2">
                            <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                              {t("auth_files.channel_name_label")}
                            </p>
                            <TextInput
                              value={channelLabelValue}
                              onChange={(e) => {
                                const value = e.currentTarget.value;
                                setChannelEditor((prev) => ({
                                  ...prev,
                                  fileName: detailFile.name,
                                  label: value,
                                  error: null,
                                }));
                              }}
                              placeholder={t("auth_files.channel_name_placeholder")}
                            />
                            {channelEditor.error ? (
                              <p className="text-sm text-rose-600 dark:text-rose-300">
                                {channelEditor.error}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-white/55">
                                {t("auth_files.channel_name_hint")}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {prefixProxyEditor.json ? (
                          <>
                            <div className="grid gap-2">
                              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                                {t("auth_files.prefix_label")}
                              </p>
                              <TextInput
                                value={prefixProxyEditor.prefix}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  setPrefixProxyEditor((prev) => ({ ...prev, prefix: value }));
                                }}
                                placeholder={t("auth_files.prefix_placeholder")}
                              />
                              <p className="text-xs text-slate-500 dark:text-white/55">
                                {t("auth_files.leave_empty_prefix")}
                              </p>
                            </div>

                            <div className="grid gap-2">
                              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                                {t("auth_files.subscription_started_at_label")}
                              </p>
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                                <DateTimePicker
                                  value={prefixProxyEditor.subscriptionStartedAt}
                                  onChange={(value) => {
                                    setPrefixProxyEditor((prev) => ({
                                      ...prev,
                                      subscriptionStartedAt: value,
                                    }));
                                  }}
                                  aria-label={t("auth_files.subscription_started_at_label")}
                                  locale={i18n.language}
                                  labels={{
                                    picker: t("auth_files.subscription_date_picker"),
                                    open: t("auth_files.subscription_date_picker_open"),
                                    previousMonth: t(
                                      "auth_files.subscription_date_picker_previous_month",
                                    ),
                                    nextMonth: t("auth_files.subscription_date_picker_next_month"),
                                    today: t("auth_files.subscription_date_picker_today"),
                                    clear: t("auth_files.subscription_date_picker_clear"),
                                    hour: t("auth_files.subscription_date_picker_hour"),
                                    minute: t("auth_files.subscription_date_picker_minute"),
                                  }}
                                />
                                <Select
                                  value={prefixProxyEditor.subscriptionPeriod}
                                  onChange={(value) =>
                                    setPrefixProxyEditor((prev) => ({
                                      ...prev,
                                      subscriptionPeriod: value as AuthFileSubscriptionPeriod,
                                    }))
                                  }
                                  options={[
                                    {
                                      value: "monthly",
                                      label: t("auth_files.subscription_period_monthly"),
                                    },
                                    {
                                      value: "yearly",
                                      label: t("auth_files.subscription_period_yearly"),
                                    },
                                  ]}
                                  aria-label={t("auth_files.subscription_period_label")}
                                />
                              </div>
                              <p className="text-xs text-slate-500 dark:text-white/55">
                                {t("auth_files.subscription_started_at_hint")}
                              </p>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {prefixProxyEditor.json ? (
                      <div className="min-w-0 space-y-5">
                        <div className="grid gap-2">
                          <ProxyPoolSelect
                            value={prefixProxyEditor.proxyId}
                            entries={proxyPoolEntries}
                            onChange={(value) =>
                              setPrefixProxyEditor((prev) => ({ ...prev, proxyId: value }))
                            }
                            label={t("auth_files.proxy_id_label")}
                            hint={t("auth_files.leave_empty_proxy_id")}
                            ariaLabel={t("auth_files.proxy_id_label")}
                            checkState={proxyCheckState}
                            showDetails
                          />
                        </div>

                        <div className="grid gap-2">
                          <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                            {t("auth_files.proxy_url_label")}
                          </p>
                          <TextInput
                            value={prefixProxyEditor.proxyUrl}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl: value }));
                            }}
                            placeholder={t("auth_files.proxy_url_placeholder")}
                          />
                          <p className="text-xs text-slate-500 dark:text-white/55">
                            {t("auth_files.leave_empty_proxy")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className={canRenameChannel ? "min-w-0" : "min-w-0 lg:col-span-2"}>
                        <EmptyState
                          title={t("auth_files_page.cannot_edit")}
                          description={prefixProxyEditor.error || t("auth_files.unknown_error")}
                        />
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="models" className="space-y-3 pb-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("auth_files.detail_tab_models")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                      {t("auth_files.detail_tab_models_desc")}
                    </p>
                  </div>
                  {!visibleModelsLoading && visibleModelsError !== "unsupported" ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                      {t("auth_files.count_items", { count: visibleModelsList.length })}
                    </span>
                  ) : null}
                </div>

                {usesMappedModelOwner ? (
                  <div className="rounded-lg bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-white/60">
                    {mappedModelOwnerGroup
                      ? t("auth_files.model_owner_group_source_desc", {
                          owner: mappedModelOwnerGroup.label,
                          count: mappedModelOwnerGroup.models.length,
                        })
                      : t("auth_files.model_owner_group_unavailable")}
                  </div>
                ) : null}

                {visibleModelsLoading ? (
                  <div className="text-sm text-slate-600 dark:text-white/65">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : visibleModelsError === "unsupported" ? (
                  <EmptyState
                    title={t("auth_files.api_not_supported")}
                    description={t("auth_files.no_models_api")}
                  />
                ) : visibleModelsList.length === 0 ? (
                  <EmptyState
                    title={t("common.no_model_data")}
                    description={
                      usesMappedModelOwner
                        ? t("auth_files.no_owner_group_models")
                        : t("auth_files_page.models_hint")
                    }
                  />
                ) : (
                  <div className="grid gap-2" data-testid="auth-file-models-list">
                    {visibleModelsList.map((model) => (
                      <div
                        key={model.id}
                        className="grid gap-2 rounded-lg bg-slate-50/80 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:bg-white/[0.04]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                            {model.id}
                          </p>
                          {model.display_name ? (
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/55">
                              {model.display_name}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                          {model.owned_by ? (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                              {model.owned_by}
                            </span>
                          ) : null}
                          {excludedModels.some((pattern) =>
                            matchesModelPattern(model.id, pattern),
                          ) ? (
                            <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                              {t("auth_files.oauth_excluded")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </div>
        </Tabs>
      )}
    </Modal>
  );
}
