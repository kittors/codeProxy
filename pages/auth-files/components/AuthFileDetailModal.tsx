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
import { VendorIcon } from "@code-proxy/assets";
import {
  Button,
  Checkbox,
  COLUMN_WIDTH,
  confirmDialog,
  DataTable,
  DateTimePicker,
  EmptyState,
  Modal,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextInput,
  ToggleSwitch,
  type DataTableColumn,
} from "@code-proxy/ui";
import { CodexImageGenerationBridgePanel } from "./CodexImageGenerationBridgePanel";
import { AuthFilePlanBadge } from "./AuthFilePlanBadge";
import { buildDetailTrendChartOption } from "./detailTrendChartOption";
import { TrendSummaryGrid } from "./TrendSummaryGrid";
import { EChart, useTheme } from "@code-proxy/ui";
import { ProxyPoolSelect, ProxyUrlInput, useProxyPoolChecks } from "@features/proxy-pool";
import { ModerationProfileSelect } from "@features/content-moderation";
import { useModerationPermissions } from "@app/providers/useModerationPermissions";
import {
  canRenameAuthFileChannel,
  downloadTextAsFile,
  formatPlanBadgeLabel,
  getActiveCacheTenantId,
  matchesModelPattern,
  normalizeProviderKey,
  parseAdditionalQuotaWindowLabel,
  readAuthFileChannelName,
  readAuthFilesDataCache,
  resolveClaudeOAuthHealth,
  resolveAuthFileDisplayName,
  resolveAuthFileDisplayPlanType,
  resolveAuthFilePlanType,
  resolveFileType,
  shouldShowAuthFilePlanBadge,
  translateParameterizedQuotaLabel,
  type AuthFileModelItem,
  type AuthFileModelOwnerGroup,
  type ChannelEditorState,
  type ClaudeOAuthHealthWindow,
  type CodexImageGenerationBridgeEditorState,
  type CodexOAuthAdmissionEditorState,
  type XAIEndpointEditorState,
  type PrefixProxyEditorState,
} from "@code-proxy/domain";
import type { QuotaState } from "@features/quota-preview/quota-helpers";
import {
  formatLocalDateKey,
  formatLocalHourKey,
  parseBucketKeyMs,
  resolveNearestBucketKey,
} from "./trendBuckets";
import {
  formatCurrency,
  toQuotaUsedPercent,
  FIVE_HOUR_WINDOW_SECONDS,
  WEEK_WINDOW_SECONDS,
} from "../hooks/trendQuotaSummary";
import { VIEWED_PROFILE_CLASS, identitySourceBadgeClass } from "../hooks/presentationStyles";

type DetailTab = "usage" | "identity" | "fields" | "models";
type DetailTrendWindow = "5h" | "week";
type IdentityFingerprintFieldSection = "effective" | "learned" | "observed";

interface IdentityFingerprintFieldRow {
  id: string;
  section: IdentityFingerprintFieldSection;
  field: string;
  value: string;
  source: IdentityFingerprintFieldSource;
}

const TREND_CHART_ANIMATION_MS = 680;
const TREND_CHART_ANIMATION_GUARD_MS = TREND_CHART_ANIMATION_MS + 120;
const IDENTITY_FINGERPRINT_SOURCE_ORDER: IdentityFingerprintFieldSource[] = [
  "learned",
  "preset",
  "builtin_default",
];
const IDENTITY_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

const useIdentityDesktopLayout = () => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(IDENTITY_DESKTOP_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(IDENTITY_DESKTOP_MEDIA_QUERY);
    const updateMatches = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener("change", updateMatches);
    return () => media.removeEventListener("change", updateMatches);
  }, []);

  return matches;
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
  identityFingerprintSaving: boolean;
  identityFingerprintError: string | null;
  selectIdentityFingerprintProfile: (profileKey: string) => Promise<void>;
  useIdentityFingerprintCLIPreferred: () => Promise<void>;
  deleteIdentityFingerprintProfile: (profileKey: string) => Promise<void>;
  refreshDetailTrend: (file?: AuthFileItem | null, options?: { silent?: boolean }) => Promise<void>;
  loadModelsForDetail: (file: AuthFileItem, options?: { force?: boolean }) => Promise<void>;
  loadModelOwnerGroups: (options?: { silent?: boolean }) => Promise<void>;
  modelsLoading: boolean;
  modelsError: string | null;
  modelsList: AuthFileModelItem[];
  modelsFileType: string;
  modelOwnerGroupsLoading: boolean;
  mappedModelOwnerGroup: AuthFileModelOwnerGroup | null;
  mappedModelOwnerValue: string;
  excluded: Record<string, string[]>;
  quotaState?: QuotaState | null;
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
  codexImageGenerationBridgeEditor: CodexImageGenerationBridgeEditorState;
  setCodexImageGenerationBridgeEditor: Dispatch<
    SetStateAction<CodexImageGenerationBridgeEditorState>
  >;
  codexImageGenerationBridgeDirty: boolean;
  saveCodexImageGenerationBridge: () => Promise<boolean>;
  xaiEndpointEditor: XAIEndpointEditorState;
  setXAIEndpointEditor: Dispatch<SetStateAction<XAIEndpointEditorState>>;
  xaiEndpointDirty: boolean;
  saveXAIEndpoint: () => Promise<boolean>;
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
  identityFingerprintSaving,
  identityFingerprintError,
  selectIdentityFingerprintProfile,
  useIdentityFingerprintCLIPreferred,
  deleteIdentityFingerprintProfile,
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
  quotaState = null,
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
  codexImageGenerationBridgeEditor,
  setCodexImageGenerationBridgeEditor,
  codexImageGenerationBridgeDirty,
  saveCodexImageGenerationBridge,
  xaiEndpointEditor,
  setXAIEndpointEditor,
  xaiEndpointDirty,
  saveXAIEndpoint,
}: AuthFileDetailModalProps) {
  const { t, i18n } = useTranslation();
  const { state: { mode: themeMode } } = useTheme();
  const moderationPerms = useModerationPermissions();
  const isIdentityDesktopLayout = useIdentityDesktopLayout();
  const [viewedIdentityProfileKey, setViewedIdentityProfileKey] = useState("");
  const proxyCheckState = useProxyPoolChecks(proxyPoolEntries, open && detailTab === "fields");
  const usesMappedModelOwner = Boolean(mappedModelOwnerValue);
  const visibleModelsList = usesMappedModelOwner
    ? (mappedModelOwnerGroup?.models ?? [])
    : modelsList;
  const visibleModelsLoading = usesMappedModelOwner ? modelOwnerGroupsLoading : modelsLoading;
  const visibleModelsError = usesMappedModelOwner ? null : modelsError;
  const providerKey = normalizeProviderKey(modelsFileType);
  const detailProviderKey = detailFile ? normalizeProviderKey(resolveFileType(detailFile)) : "";
  const supportsUsageTrend = ["kimi", "codex", "xai", "claude", "anthropic", "antigravity"].includes(
    detailProviderKey,
  );
  const hasIdentityFingerprint = Boolean(detailFile?.identity_fingerprint_summary);
  useEffect(() => {
    const profiles = identityFingerprintDetail?.profiles ?? [];
    if (profiles.length === 0) {
      setViewedIdentityProfileKey("");
      return;
    }
    setViewedIdentityProfileKey(
      identityFingerprintDetail?.selected_profile_key ?? profiles[0]?.summary.profile_key ?? "",
    );
  }, [identityFingerprintDetail?.summary.account_key, identityFingerprintDetail?.summary.provider]);
  const openedDetailFileRef = useRef<string | null>(null);
  const detailOpenCounterRef = useRef(0);
  const [detailOpenKey, setDetailOpenKey] = useState("");
  const [animatedTrendKey, setAnimatedTrendKey] = useState("");
  const detailTitle = detailFile
    ? resolveAuthFileDisplayName(detailFile) || String(detailFile.name || "")
    : t("auth_files.view_auth_file");
  const claudeOAuthHealth = detailFile ? resolveClaudeOAuthHealth(detailFile) : null;
  // Same membership chip as cards/table: display tier + solid gradient, not soft amber title pill.
  const detailBasePlanType = detailFile ? resolveAuthFilePlanType(detailFile, quotaState) : null;
  const detailPlanType = useMemo(() => {
    if (!detailFile) return null;
    const cachedPlan =
      readAuthFilesDataCache(getActiveCacheTenantId())?.displayPlanByFileName?.[detailFile.name] ??
      null;
    return resolveAuthFileDisplayPlanType(
      detailFile,
      quotaState,
      {
        cycleCostTotal: detailTrend?.cycle_cost_total ?? null,
        weeklyQuotaUsedPercent: detailTrend?.weekly_quota_used_percent ?? null,
      },
      cachedPlan ?? detailBasePlanType,
    );
  }, [
    detailBasePlanType,
    detailFile,
    detailTrend?.cycle_cost_total,
    detailTrend?.weekly_quota_used_percent,
    quotaState,
  ]);
  const detailPlanLabel = detailPlanType ? formatPlanBadgeLabel(detailPlanType) : "";
  const showDetailPlanBadge = detailFile
    ? shouldShowAuthFilePlanBadge(detailFile, detailBasePlanType)
    : false;
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
    codexImageGenerationBridgeEditor.saving ||
    xaiEndpointEditor.saving ||
    !(
      (prefixProxyDirty && prefixProxyEditor.json) ||
      channelDirty ||
      codexOAuthAdmissionDirty ||
      codexImageGenerationBridgeDirty ||
      xaiEndpointDirty
    );
  const translateQuotaLabel = useMemo(
    () => (label: string) => {
      if (!label) return label;
      if (label.startsWith("m_quota.")) return t(label);
      if (label.startsWith("claude_quota.")) return translateParameterizedQuotaLabel(t, label);
      const additionalQuota = parseAdditionalQuotaWindowLabel(label);
      if (additionalQuota) {
        return t(`m_quota.additional_${additionalQuota.window}`, { name: additionalQuota.name });
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
      setViewedIdentityProfileKey("");
      return;
    }
    if (openedDetailFileRef.current === fileName) return;
    openedDetailFileRef.current = fileName;
    setViewedIdentityProfileKey("");
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

    const bucketKeys = Array.from(xKeys);
    const bucketMsByKey = new Map(bucketKeys.map((key) => [key, parseBucketKeyMs(key)]));
    const bucketToleranceMs = detailTrendWindow === "5h" ? 3_600_000 : 86_400_000;
    const quotaBySeries = activeQuotaSeries.map((series) => {
      const values = new Map<string, number | null>();
      series.points.forEach((point) => {
        if (!point.timestamp) return;
        const localKey =
          detailTrendWindow === "5h"
            ? formatLocalHourKey(point.timestamp)
            : formatLocalDateKey(point.timestamp);
        const key =
          localKey && xKeys.has(localKey)
            ? localKey
            : resolveNearestBucketKey(point.timestamp, bucketKeys, bucketMsByKey, bucketToleranceMs);
        if (!key) return;
        values.set(key, toQuotaUsedPercent(point.percent));
      });
      return { series, values };
    });

    const sortedKeys = Array.from(xKeys).sort();
    const compactQuotaLegendLabel = (label: string) => {
      const translated = translateQuotaLabel(label).trim();
      if (translated.length <= 14) return translated;
      const colonIndex = Math.max(translated.lastIndexOf(":"), translated.lastIndexOf("："));
      const suffix = colonIndex >= 0 ? translated.slice(colonIndex + 1).trim() : "";
      if (suffix) return suffix.length > 14 ? `${suffix.slice(0, 14)}...` : suffix;
      return `${translated.slice(0, 14)}...`;
    };

    return buildDetailTrendChartOption({
      isDark: themeMode === "dark",
      categories: sortedKeys.map((key) => key.slice(5)),
      requests: sortedKeys.map((key) => requestByKey.get(key) ?? 0),
      cost: sortedKeys.map((key) => costByKey.get(key) ?? 0),
      quotaSeries: quotaBySeries.map(({ series, values }) => ({
        name: `${compactQuotaLegendLabel(series.quota_label)} ${t("auth_files.trend_quota_used_suffix")}`,
        values: sortedKeys.map((key) => values.get(key) ?? null),
      })),
      labels: { requests: t("auth_files.trend_requests"), cost: t("auth_files.trend_cost") },
      animate: shouldAnimateTrend,
      animationMs: TREND_CHART_ANIMATION_MS,
      formatCurrency,
    });
  }, [
    activeQuotaSeries,
    detailTrend,
    detailTrendWindow,
    shouldAnimateTrend,
    t,
    themeMode,
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
    if (codexImageGenerationBridgeDirty) {
      const saved = await saveCodexImageGenerationBridge();
      if (!saved) return;
    }
    if (xaiEndpointDirty) {
      const saved = await saveXAIEndpoint();
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
      <p className="text-xs font-medium text-ink-3">
        {label}
      </p>
      <p className="mt-1 min-w-0 break-words font-mono text-xs text-ink">
        {value}
      </p>
    </div>
  );

  const renderHealthWindow = (label: string, window: ClaudeOAuthHealthWindow | undefined) => (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-ink">{label}</p>
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

  // 来源只是分类，靠文字区分学习、预设还是内置：基础是中性标签，多彩风格下叠回来源色
  // （学习绿、预设蓝），类名见 presentationStyles。
  const renderIdentitySourceBadge = (source: IdentityFingerprintFieldSource) => (
    <span className={identitySourceBadgeClass(source)}>{formatIdentitySource(source)}</span>
  );

  const identityFieldSectionLabel = (section: IdentityFingerprintFieldSection) => {
    if (section === "effective") return t("auth_files.identity_fingerprint_effective_fields");
    if (section === "learned") return t("auth_files.identity_fingerprint_learned_fields");
    return t("auth_files.identity_fingerprint_observed_headers");
  };

  const renderIdentitySummaryItem = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-3">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words text-sm font-semibold text-ink">
        {value}
      </dd>
    </div>
  );

  const identityFieldColumns: DataTableColumn<IdentityFingerprintFieldRow>[] = [
    {
      key: "section",
      label: t("auth_files.identity_fingerprint_table_section"),
      width: COLUMN_WIDTH.badgeStacked,
      resizable: false,
      reorderable: false,
      overflowTooltip: (row) => identityFieldSectionLabel(row.section),
      render: (row) => (
        <span className="block truncate text-xs font-semibold text-ink-2">
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
        <code className="block truncate font-mono text-xs font-semibold text-ink">
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
        <span className="block truncate font-mono text-xs text-ink-2">
          {row.value}
        </span>
      ),
    },
    {
      key: "source",
      label: t("auth_files.identity_fingerprint_table_source"),
      width: COLUMN_WIDTH.toggle,
      resizable: false,
      reorderable: false,
      overflowTooltip: (row) => formatIdentitySource(row.source),
      render: (row) => renderIdentitySourceBadge(row.source),
    },
  ];

  const renderIdentityFingerprint = () => {
    const accountSummary =
      identityFingerprintDetail?.summary ?? detailFile?.identity_fingerprint_summary;
    if (!accountSummary) {
      return (
        <EmptyState
          title={t("auth_files.identity_fingerprint_empty")}
          description={t("auth_files.identity_fingerprint_empty_desc")}
        />
      );
    }

    const profiles = identityFingerprintDetail?.profiles ?? [];
    const hasCodexProfiles = accountSummary.provider === "codex" && profiles.length > 0;
    const viewedProfile = hasCodexProfiles
      ? (profiles.find((profile) => profile.summary.profile_key === viewedIdentityProfileKey) ??
        profiles.find(
          (profile) =>
            profile.summary.profile_key === identityFingerprintDetail?.selected_profile_key,
        ) ??
        profiles[0])
      : null;
    const summary = viewedProfile?.summary ?? accountSummary;
    const effective = viewedProfile?.effective ?? identityFingerprintDetail?.effective;
    const learned = viewedProfile?.learned ?? identityFingerprintDetail?.learned;
    const clientLabel =
      [summary.client_product, summary.client_variant].filter(Boolean).join(" / ") ||
      summary.profile_key ||
      "--";
    const hasMeaningfulValue = (value: unknown): boolean =>
      typeof value === "string" ? value.trim().length > 0 : value != null && value !== "";
    const effectiveRows = Object.entries(effective?.fields ?? {})
      .map(
        ([key, field]): IdentityFingerprintFieldRow => ({
          id: `effective:${key}`,
          section: "effective",
          field: key,
          value: field.value,
          source: field.source,
        }),
      )
      .filter((row) => hasMeaningfulValue(row.value))
      .sort((left, right) => left.field.localeCompare(right.field));
    const learnedRows = Object.entries(learned?.fields ?? {})
      .map(
        ([key, value]): IdentityFingerprintFieldRow => ({
          id: `learned:${key}`,
          section: "learned",
          field: key,
          value,
          source: "learned",
        }),
      )
      .filter((row) => hasMeaningfulValue(row.value))
      .sort((left, right) => left.field.localeCompare(right.field));
    const observedHeaderRows = Object.entries(learned?.observed_headers ?? {})
      .map(
        ([key, value]): IdentityFingerprintFieldRow => ({
          id: `observed:${key}`,
          section: "observed",
          field: key,
          value,
          source: "learned",
        }),
      )
      .filter((row) => hasMeaningfulValue(row.value))
      .sort((left, right) => left.field.localeCompare(right.field));
    const identityFieldRows = [...effectiveRows, ...learnedRows, ...observedHeaderRows];
    const selectedProfileKey = identityFingerprintDetail?.selected_profile_key ?? "";
    const outboundProfile = profiles.find(
      (profile) => profile.summary.profile_key === selectedProfileKey,
    );
    const outboundLabel = outboundProfile
      ? [outboundProfile.summary.client_product, outboundProfile.summary.client_variant]
          .filter(Boolean)
          .join(" / ") ||
        outboundProfile.summary.profile_key ||
        "--"
      : [accountSummary.client_product, accountSummary.client_variant]
          .filter(Boolean)
          .join(" / ") ||
        accountSummary.profile_key ||
        "--";
    const viewedProfileSelectable = viewedProfile?.selectable !== false;
    const isViewedProfileSelected =
      Boolean(summary.profile_key) && summary.profile_key === selectedProfileKey;
    const selectionReason = identityFingerprintDetail?.selection_reason
      ? t(`auth_files.identity_selection_reason_${identityFingerprintDetail.selection_reason}`)
      : "--";

    const deleteViewedProfile = async () => {
      const profileKey = summary.profile_key;
      if (!profileKey) return;
      const confirmed = await confirmDialog({
        title: t("auth_files.identity_profile_delete_title"),
        description: t("auth_files.identity_profile_delete_confirm", { profile: clientLabel }),
        confirmText: t("common.delete"),
      });
      if (confirmed) await deleteIdentityFingerprintProfile(profileKey);
    };

    return (
      <div
        className="min-h-0 lg:flex lg:h-full lg:flex-col lg:overflow-hidden"
        data-testid="auth-file-identity-fingerprint"
      >
        <div className="grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden">
          <aside
            className="min-w-0 rounded-lg bg-subtle px-4 py-4 lg:min-h-0 lg:overflow-y-auto"
            data-testid="auth-file-identity-summary"
          >
            {hasCodexProfiles ? (
              <div className="space-y-4" data-testid="auth-file-identity-profiles">
                <div>
                  <p className="text-xs font-semibold text-ink-3">
                    {t("auth_files.identity_outbound_strategy")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      variant={
                        identityFingerprintDetail?.policy?.strategy === "cli_preferred"
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      disabled={identityFingerprintSaving}
                      onClick={() => void useIdentityFingerprintCLIPreferred()}
                    >
                      {t("auth_files.identity_strategy_cli_preferred")}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-3">
                    {t("auth_files.identity_current_outbound")}: {formatOptionalText(outboundLabel)}
                    <br />
                    {t("auth_files.identity_selection_reason")}: {selectionReason}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-ink-3">
                    {t("auth_files.identity_profiles")}
                  </p>
                  <div className="space-y-2">
                    {profiles.map((profile) => {
                      const profileKey = profile.summary.profile_key ?? "";
                      const outbound = profileKey !== "" && profileKey === selectedProfileKey;
                      const viewed = profileKey !== "" && profileKey === summary.profile_key;
                      const label =
                        [profile.summary.client_product, profile.summary.client_variant]
                          .filter(Boolean)
                          .join(" / ") ||
                        profileKey ||
                        "--";
                      return (
                        <button
                          key={profileKey || label}
                          type="button"
                          className={[
                            "w-full rounded-lg px-3 py-3 text-left transition-colors",
                            viewed ? VIEWED_PROFILE_CLASS : "hover:bg-hover",
                          ].join(" ")}
                          onClick={() => setViewedIdentityProfileKey(profileKey)}
                          data-testid={`identity-profile-${profileKey}`}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-ink">
                                {label}
                              </p>
                              <p className="mt-1 break-all font-mono text-xs text-ink-3">
                                {profileKey}
                              </p>
                            </div>
                            {outbound ? (
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                {t("auth_files.identity_outbound_active")}
                              </span>
                            ) : profile.selectable === false ? (
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                {t("auth_files.identity_profile_observe_only")}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-3">
                            <span>{formatOptionalText(profile.summary.version)}</span>
                            <span>{formatOptionalDate(profile.summary.last_seen_at)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={isViewedProfileSelected ? "secondary" : "primary"}
                    size="sm"
                    disabled={
                      identityFingerprintSaving ||
                      isViewedProfileSelected ||
                      !viewedProfileSelectable ||
                      !summary.profile_key
                    }
                    onClick={() =>
                      summary.profile_key
                        ? void selectIdentityFingerprintProfile(summary.profile_key)
                        : undefined
                    }
                  >
                    {isViewedProfileSelected
                      ? t("auth_files.identity_outbound_active")
                      : t("auth_files.identity_set_outbound")}
                  </Button>
                  <Button
                    variant="secondary-danger"
                    size="sm"
                    disabled={identityFingerprintSaving || !summary.profile_key}
                    onClick={() => void deleteViewedProfile()}
                  >
                    {t("auth_files.identity_clear_profile")}
                  </Button>
                </div>
              </div>
            ) : null}

            <div
              className={
                hasCodexProfiles ? "mt-7" : ""
              }
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="min-w-0 break-words text-sm font-semibold text-ink">
                    {clientLabel}
                  </p>
                  <p className="mt-1 min-w-0 break-words text-xs text-ink-3">
                    {formatOptionalText(summary.provider)} ·{" "}
                    {formatOptionalText(summary.account_key)}
                  </p>
                </div>
                <div className="shrink-0">{renderIdentitySourceBadge(summary.primary_source)}</div>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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
                <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                  {t("auth_files.identity_fingerprint_effective_count")}: {summary.effective_fields}
                </span>
                <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                  {t("auth_files.identity_fingerprint_learned_count")}: {summary.learned_fields}
                </span>
                {IDENTITY_FINGERPRINT_SOURCE_ORDER.map((source) => (
                  <span
                    key={source}
                    className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]"
                  >
                    {formatIdentitySource(source)}: {summary.source_counts?.[source] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          <section
            className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-hidden"
            data-testid="auth-file-identity-fields"
          >
            {identityFingerprintLoading && !identityFingerprintDetail ? (
              <div
                className="grid gap-2 rounded-lg bg-subtle px-3 py-3"
                data-testid="auth-file-identity-loading"
              >
                <div className="h-3 w-36 animate-pulse rounded bg-track" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-track" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-track" />
              </div>
            ) : null}

            {identityFingerprintError ? (
              <EmptyState
                title={t("auth_files.identity_fingerprint_loading_failed")}
                description={identityFingerprintError}
              />
            ) : null}

            {identityFingerprintDetail ? (
              <>
                <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">
                    {t("auth_files.identity_fingerprint_title")}
                  </p>
                  <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                    {t("auth_files.count_items", {
                      count: identityFieldRows.length,
                    })}
                  </span>
                </div>
                {isIdentityDesktopLayout ? (
                  <div
                    className="min-h-0 flex-1 overflow-hidden"
                    data-testid="auth-file-identity-table-desktop"
                  >
                    <DataTable<IdentityFingerprintFieldRow>
                      rows={identityFieldRows}
                      columns={identityFieldColumns}
                      rowKey={(row) => row.id}
                      rowHeight={48}
                      minWidth="min-w-[920px]"
                      minHeight="min-h-0"
                      height="h-full"
                      caption={t("auth_files.identity_fingerprint_title")}
                      emptyText={t("auth_files.identity_fingerprint_no_fields")}
                      showAllLoadedMessage={false}
                      columnReorderable={false}
                      persistColumnOrder={false}
                    />
                  </div>
                ) : (
                  <div
                    className="min-w-0 overflow-x-auto overscroll-x-contain rounded-xl"
                    data-testid="auth-file-identity-table-mobile"
                  >
                    <DataTable<IdentityFingerprintFieldRow>
                      rows={identityFieldRows}
                      columns={identityFieldColumns}
                      rowKey={(row) => row.id}
                      rowHeight={48}
                      minWidth="min-w-[920px]"
                      minHeight="min-h-0"
                      height="h-auto"
                      caption={t("auth_files.identity_fingerprint_title")}
                      emptyText={t("auth_files.identity_fingerprint_no_fields")}
                      showAllLoadedMessage={false}
                      naturalFlow
                      columnReorderable={false}
                      persistColumnOrder={false}
                    />
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      </div>
    );
  };

  const renderUsageTrend = () => {
    const isCodex = detailProviderKey === "codex";
    const isClaude = detailProviderKey === "claude" || detailProviderKey === "anthropic";
    const isAnti = detailProviderKey === "antigravity";
    const fiveHourQuotaKey = isCodex ? "code_5h" : isClaude ? "five_hour" : isAnti ? "antigravity:gemini_5h" : null;
    const weeklyQuotaKey = isCodex ? "code_week" : isClaude ? "seven_day" : isAnti ? "antigravity:gemini_weekly" : "weekly_limit";
    const showPredictedWeeklyQuota = isCodex || isClaude || isAnti || detailProviderKey === "xai";
    const summaryGridClassName =
      "grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]";
    const summarySkeletonCount = showPredictedWeeklyQuota ? 7 : 6;

    if (detailTrendLoading && !detailTrend) {
      const skeletonClass = "animate-pulse rounded-lg bg-subtle";

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

    return (
      <div className="space-y-4">
        <TrendSummaryGrid
          trend={detailTrend}
          fiveHourQuotaKey={fiveHourQuotaKey}
          weeklyQuotaKey={weeklyQuotaKey}
          showPredictedWeeklyQuota={showPredictedWeeklyQuota}
          hideLast7DaysRequests={isCodex}
          className={summaryGridClassName}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">
              {t("auth_files.trend_window_title")}
            </p>
            <p className="mt-1 text-xs text-ink-3">
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

        {/* 图表直接放在弹窗上：灰底会把整张图压灰，白底卡片又是弹窗里的第二层框。 */}
        <div className="min-w-0">
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
        // 与卡片、列表同一个会员徽章：厂商品牌色 × 会员档位。
        showDetailPlanBadge && detailPlanType && detailPlanLabel ? (
          <AuthFilePlanBadge provider={detailProviderKey} planType={detailPlanType} />
        ) : undefined
      }
      // 图标用账号所属厂商的 logo，描述是文件名：一眼知道打开的是哪个账号的哪份凭证。
      icon={detailFile ? <VendorIcon modelId={String(detailFile.type ?? "")} size={20} /> : undefined}
      description={detailFile && detailFile.name !== detailTitle ? detailFile.name : undefined}
      size="2xl"
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
                  void loadModelOwnerGroups({ silent: true });
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
              // 左右各留 4px（再用负边距拉回对齐）：输入框的阴影描边和聚焦光晕画在框外，贴着滚动区的边会被裁掉。
              className={[
                "-mx-1 mt-4 min-h-0 flex-1 px-1",
                detailTab === "identity"
                  ? "overflow-x-hidden overflow-y-auto overscroll-contain lg:overflow-hidden"
                  : "overflow-y-auto overscroll-contain",
              ].join(" ")}
              data-testid="auth-file-detail-scroll"
            >
              {supportsUsageTrend ? (
                <TabsContent value="usage" className="pb-1">
                  {renderUsageTrend()}
                </TabsContent>
              ) : null}

              {hasIdentityFingerprint ? (
                <TabsContent value="identity" className="min-h-0 pb-1 lg:h-full lg:pb-0">
                  {renderIdentityFingerprint()}
                </TabsContent>
              ) : null}

              <TabsContent value="fields" className="pb-1">
                {prefixProxyEditor.loading ? (
                  <div className="text-sm text-ink-2">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : (
                  <div
                    className="grid max-w-none items-start gap-x-10 gap-y-5 lg:grid-cols-2"
                    data-testid="auth-file-fields-grid"
                  >
                    <div className="min-w-0 rounded-lg bg-subtle px-4 py-4 lg:col-span-2">
                      <ModerationProfileSelect
        canRead={moderationPerms.canRead}
        canWrite={moderationPerms.canWrite}
                        channelType="auth_file"
                        channelId={String(detailFile?.id ?? "")}
                        label={t("content_moderation.auth_file_profile_label")}
                        hint={t("content_moderation.auth_file_profile_hint")}
                      />
                    </div>
                    {claudeOAuthHealth ? (
                      <div
                        className="min-w-0 space-y-4 rounded-lg bg-subtle px-4 py-4 lg:col-span-2"
                        data-testid="claude-oauth-health-panel"
                      >
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {t("auth_files.claude_oauth_health_title")}
                            </p>
                            <p className="mt-1 text-xs text-ink-3">
                              {t("auth_files.claude_oauth_health_desc")}
                            </p>
                          </div>
                          {claudeOAuthHealth.status ? (
                            <span className="inline-flex max-w-full items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
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

                    {xaiEndpointEditor.supported ? (
                      <div
                        className="min-w-0 space-y-4 rounded-lg bg-subtle px-4 py-4 lg:col-span-2"
                        data-testid="xai-endpoint-panel"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {t("auth_files.xai_endpoint_title")}
                            </p>
                            <p className="mt-1 text-xs text-ink-3">
                              {t("auth_files.xai_endpoint_desc")}
                            </p>
                          </div>
                          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                            {xaiEndpointEditor.usingApi
                              ? t("auth_files.xai_endpoint_api")
                              : t("auth_files.xai_endpoint_build")}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-ink-3">
                            {t("auth_files.xai_endpoint_mode")}
                          </p>
                          <Select
                            value={xaiEndpointEditor.usingApi ? "api" : "build"}
                            onChange={(value) =>
                              setXAIEndpointEditor((prev) => ({
                                ...prev,
                                usingApi: value === "api",
                                error: null,
                              }))
                            }
                            options={[
                              {
                                value: "build",
                                label: t("auth_files.xai_endpoint_build"),
                              },
                              {
                                value: "api",
                                label: t("auth_files.xai_endpoint_api"),
                              },
                            ]}
                            aria-label={t("auth_files.xai_endpoint_mode")}
                            disabled={xaiEndpointEditor.saving}
                          />
                          <p className="text-xs text-ink-2">
                            {t(
                              xaiEndpointEditor.usingApi
                                ? "auth_files.xai_endpoint_api_hint"
                                : "auth_files.xai_endpoint_build_hint",
                            )}
                          </p>
                        </div>

                        {xaiEndpointEditor.error ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {xaiEndpointEditor.error}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <CodexImageGenerationBridgePanel
                      editor={codexImageGenerationBridgeEditor}
                      setEditor={setCodexImageGenerationBridgeEditor}
                    />

                    {codexOAuthAdmissionEditor.supported ? (
                      <div
                        className="min-w-0 space-y-4 rounded-lg bg-subtle px-4 py-4 lg:col-span-2"
                        data-testid="codex-oauth-admission-panel"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {t("auth_files.codex_oauth_admission_title")}
                            </p>
                            <p className="mt-1 text-xs text-ink-3">
                              {t("auth_files.codex_oauth_admission_desc")}
                            </p>
                          </div>
                          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                            {codexOAuthAdmissionEditor.enabled
                              ? t("auth_files.enabled")
                              : t("auth_files.disabled")}
                          </span>
                        </div>

                        <div data-testid="codex-oauth-admission-toggle">
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

                        <div>
                          <p className="text-xs font-semibold text-ink-2">
                            {t("auth_files.codex_oauth_admission_allowed_clients")}
                          </p>
                          <p className="mt-1 text-xs text-ink-3">
                            {t("auth_files.codex_oauth_admission_allowed_clients_hint")}
                          </p>
                          {codexOAuthAdmissionEditor.availableAllowedClients.length ? (
                            <div className="mt-3 grid gap-2">
                              {codexOAuthAdmissionEditor.availableAllowedClients.map((preset) => (
                                <label
                                  key={preset.id}
                                  className="-mx-3 grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-hover"
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
                                    <span className="block text-sm font-semibold text-ink">
                                      {preset.label}
                                    </span>
                                    {preset.description ? (
                                      <span className="mt-1 block text-xs leading-5 text-ink-3">
                                        {preset.description}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-ink-3">
                              {t("auth_files.codex_oauth_admission_no_allowed_clients")}
                            </p>
                          )}
                        </div>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <p className="text-xs leading-5 text-ink-3">
                            {t("auth_files.codex_oauth_admission_auto_learning")}
                          </p>
                          <p className="text-xs leading-5 text-ink-3">
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
                            <p className="text-xs font-semibold text-ink-2">
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
                              <p className="text-xs text-ink-3">
                                {t("auth_files.channel_name_hint")}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {prefixProxyEditor.json ? (
                          <>
                            <div className="grid gap-2">
                              <p className="text-xs font-semibold text-ink-2">
                                {t("auth_files.prefix_label")}
                              </p>
                              <TextInput
                                value={prefixProxyEditor.prefix}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  setPrefixProxyEditor((prev) => ({
                                    ...prev,
                                    prefix: value,
                                  }));
                                }}
                                placeholder={t("auth_files.prefix_placeholder")}
                              />
                              <p className="text-xs text-ink-3">
                                {t("auth_files.leave_empty_prefix")}
                              </p>
                            </div>

                            <div className="grid gap-2">
                              <p className="text-xs font-semibold text-ink-2">
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
                              <p className="text-xs text-ink-3">
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
                              setPrefixProxyEditor((prev) => ({
                                ...prev,
                                proxyId: value,
                              }))
                            }
                            label={t("auth_files.proxy_id_label")}
                            hint={t("auth_files.leave_empty_proxy_id")}
                            ariaLabel={t("auth_files.proxy_id_label")}
                            checkState={proxyCheckState}
                            showDetails
                          />
                        </div>

                        <ProxyUrlInput
                          collapsible
                          label={t("auth_files.proxy_url_title")}
                          description={t("auth_files.proxy_url_fallback_hint")}
                          value={prefixProxyEditor.proxyUrl}
                          onChange={(proxyUrl) =>
                            setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl }))
                          }
                        />
                        <div className="grid gap-2">
                          <p className="text-xs font-semibold text-ink-2">
                            {t("auth_files.concurrency_limit_label")}
                          </p>
                          <TextInput
                            type="number"
                            min="0"
                            step="1"
                            value={prefixProxyEditor.concurrencyLimit}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setPrefixProxyEditor((prev) => ({
                                ...prev,
                                concurrencyLimit: value,
                              }));
                            }}
                            placeholder={t("auth_files.concurrency_limit_placeholder")}
                            aria-label={t("auth_files.concurrency_limit_label")}
                          />
                          <p className="text-xs text-ink-3">
                            {t("auth_files.concurrency_limit_hint")}
                          </p>
                        </div>

                        {normalizeProviderKey(resolveFileType(detailFile)) === "codex" ? (
                          <>
                            <div className="grid gap-2">
                              <p className="text-xs font-semibold text-ink-2">
                                {t("auth_files.codex_convergence_mode_label")}
                              </p>
                              <Select
                                value={prefixProxyEditor.codexConvergenceMode}
                                onChange={(value) =>
                                  setPrefixProxyEditor((prev) => ({
                                    ...prev,
                                    codexConvergenceMode: value,
                                  }))
                                }
                                options={[
                                  {
                                    value: "",
                                    label: t("auth_files.codex_convergence_mode_inherited"),
                                  },
                                  {
                                    value: "device",
                                    label: t("auth_files.codex_convergence_mode_device"),
                                  },
                                  {
                                    value: "off",
                                    label: t("auth_files.codex_convergence_mode_off"),
                                  },
                                  {
                                    value: "session",
                                    label: t("auth_files.codex_convergence_mode_session"),
                                  },
                                  {
                                    value: "full",
                                    label: t("auth_files.codex_convergence_mode_full"),
                                  },
                                ]}
                                aria-label={t("auth_files.codex_convergence_mode_label")}
                              />
                              <p className="text-xs text-ink-3">
                                {t("auth_files.codex_convergence_mode_hint")}
                              </p>
                            </div>

                            <div className="grid gap-2">
                              <p className="text-xs font-semibold text-ink-2">
                                {t("auth_files.codex_service_tier_label")}
                              </p>
                              <Select
                                value={prefixProxyEditor.codexServiceTier}
                                onChange={(value) =>
                                  setPrefixProxyEditor((prev) => ({
                                    ...prev,
                                    codexServiceTier: value,
                                  }))
                                }
                                options={[
                                  {
                                    value: "",
                                    label: t("auth_files.codex_service_tier_default"),
                                  },
                                  {
                                    value: "pass",
                                    label: t("auth_files.codex_service_tier_pass"),
                                  },
                                  {
                                    value: "priority",
                                    label: t("auth_files.codex_service_tier_priority"),
                                  },
                                  {
                                    value: "flex",
                                    label: t("auth_files.codex_service_tier_flex"),
                                  },
                                  {
                                    value: "drop",
                                    label: t("auth_files.codex_service_tier_drop"),
                                  },
                                ]}
                                aria-label={t("auth_files.codex_service_tier_label")}
                              />
                              <p className="text-xs text-ink-3">
                                {t("auth_files.codex_service_tier_hint")}
                              </p>
                            </div>
                          </>
                        ) : null}
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
                    <p className="text-sm font-semibold text-ink">
                      {t("auth_files.detail_tab_models")}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {t("auth_files.detail_tab_models_desc")}
                    </p>
                  </div>
                  {!visibleModelsLoading && visibleModelsError !== "unsupported" ? (
                    <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                      {t("auth_files.count_items", {
                        count: visibleModelsList.length,
                      })}
                    </span>
                  ) : null}
                </div>

                {usesMappedModelOwner ? (
                  <div className="rounded-lg bg-subtle px-3 py-2 text-xs text-ink-2">
                    {mappedModelOwnerGroup
                      ? t("auth_files.model_owner_group_source_desc", {
                          owner: mappedModelOwnerGroup.label,
                          count: mappedModelOwnerGroup.models.length,
                        })
                      : t("auth_files.model_owner_group_unavailable")}
                  </div>
                ) : null}

                {visibleModelsLoading ? (
                  <div className="text-sm text-ink-2">
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
                        className="grid gap-2 rounded-lg bg-subtle px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-semibold text-ink">
                            {model.id}
                          </p>
                          {model.display_name ? (
                            <p className="mt-1 truncate text-xs text-ink-3">
                              {model.display_name}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                          {model.owned_by ? (
                            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                              {model.owned_by}
                            </span>
                          ) : null}
                          {excludedModels.some((pattern) =>
                            matchesModelPattern(model.id, pattern),
                          ) ? (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
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
