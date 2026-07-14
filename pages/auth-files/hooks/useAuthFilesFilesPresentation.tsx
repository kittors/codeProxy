import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Eye,
  Gauge,
  Loader2,
  RefreshCw,
  Tags,
  Zap,
} from "lucide-react";
import type { AuthFileItem } from "@code-proxy/api-client";
import { formatLatency } from "@features/provider-latency";
import { ProviderStatusBar } from "@features/provider-latency";
import { Button } from "@code-proxy/ui";
import { Select } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { HoverTooltip } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import type { DataTableColumn } from "@code-proxy/ui";
import {
  pickQuotaPreviewItem,
  type FilesViewMode,
  type QuotaPreviewMode,
  type UsageIndex,
  TYPE_BADGE_CLASSES,
  formatAuthFileRestrictionRemaining,
  formatFileSize,
  formatModified,
  resolveClaudeOAuthHealthBadges,
  isRuntimeOnlyAuthFile,
  parseAdditionalQuotaWindowLabel,
  resolveAuthFileDisplayName,
  resolveAuthFilePlanType,
  resolveAuthFileRestrictionBadges,
  resolveAuthFileWeeklyQuotaResetAtMs,
  resolveAuthFileSupplementalTags,
  resolveAuthFileStats,
  resolveAuthFileStatusBar,
  resolveAuthFileSubscriptionStatus,
  resolveFileType,
  shouldShowAuthFileDisplayTag,
  shouldShowAuthFilePlanBadge,
} from "@code-proxy/domain";
import { resolveQuotaProvider, type QuotaProvider } from "@features/quota-preview/quota-fetch";
import {
  clampPercent,
  filterAntigravityQuotaItems,
  type QuotaItem,
  type QuotaState,
} from "@features/quota-preview/quota-helpers";

const KNOWN_QUOTA_TEXT_KEYS = new Set([
  "missing_auth_index",
  "no_model_quota",
  "request_failed",
  "missing_account_id",
  "parse_codex_failed",
  "parse_xai_failed",
  "empty_data",
  "missing_project_id",
  "parse_kiro_failed",
]);

const SUBSCRIPTION_TONE_CLASSES = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
  urgent:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  expired:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
} as const;

const RESTRICTION_TONE_CLASSES = {
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
  neutral:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-white/70",
} as const;

const CLAUDE_OAUTH_HEALTH_TONE_CLASSES = {
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
} as const;

type QuotaVisualTone = {
  normalized: number | null;
  fillClass: string;
  percentClass: string;
  fillHex: string;
};

const resolveQuotaVisualTone = (percent: number | null | undefined): QuotaVisualTone => {
  const normalized = percent === null || percent == null ? null : clampPercent(percent);

  if (normalized === null) {
    return {
      normalized,
      fillClass: "bg-slate-300/50 dark:bg-white/10",
      percentClass: "text-slate-900 dark:text-white",
      fillHex: "#cbd5e1",
    };
  }

  if (normalized >= 60) {
    return {
      normalized,
      fillClass: "bg-emerald-500",
      percentClass: "text-emerald-700 dark:text-emerald-200",
      fillHex: "#10b981",
    };
  }

  if (normalized >= 20) {
    return {
      normalized,
      fillClass: "bg-amber-500",
      percentClass: "text-amber-700 dark:text-amber-200",
      fillHex: "#f59e0b",
    };
  }

  return {
    normalized,
    fillClass: "bg-rose-500",
    percentClass: "text-rose-700 dark:text-rose-200",
    fillHex: "#f43f5e",
  };
};

interface UseAuthFilesFilesPresentationOptions {
  filesViewMode: FilesViewMode;
  setFilesViewMode: (value: FilesViewMode) => void;
  quotaPreviewMode: QuotaPreviewMode;
  setQuotaPreviewMode: (value: QuotaPreviewMode) => void;
  nowMs: number;
  allPageSelected: boolean;
  somePageSelected: boolean;
  selectCurrentPage: (checked: boolean) => void;
  selectablePageNames: string[];
  selectedFileNameSet: Set<string>;
  toggleFileSelection: (name: string, checked: boolean) => void;
  connectivityState: Map<string, { loading: boolean; latencyMs: number | null; error: boolean }>;
  checkAuthFileConnectivity: (name: string) => Promise<void>;
  quotaByFileName: Record<string, QuotaState>;
  refreshQuota: (file: AuthFileItem, provider: QuotaProvider) => Promise<void>;
  requestResetCredit: (file: AuthFileItem) => void;
  resettingCreditFileName: string | null;
  openDetail: (file: AuthFileItem) => Promise<void>;
  downloadAuthFile: (file: AuthFileItem) => Promise<void>;
  openTagsEditor: (file: AuthFileItem) => void;
  statusUpdating: Record<string, boolean>;
  setFileEnabled: (file: AuthFileItem, enabled: boolean) => Promise<void>;
  usageIndex: UsageIndex;
}

export function useAuthFilesFilesPresentation({
  filesViewMode,
  setFilesViewMode,
  quotaPreviewMode,
  setQuotaPreviewMode,
  nowMs,
  allPageSelected,
  somePageSelected,
  selectCurrentPage,
  selectablePageNames,
  selectedFileNameSet,
  toggleFileSelection,
  connectivityState,
  checkAuthFileConnectivity,
  quotaByFileName,
  refreshQuota,
  requestResetCredit,
  resettingCreditFileName,
  openDetail,
  downloadAuthFile,
  openTagsEditor,
  statusUpdating,
  setFileEnabled,
  usageIndex,
}: UseAuthFilesFilesPresentationOptions) {
  const { t } = useTranslation();

  const translateQuotaText = useCallback(
    (text: string) => {
      if (!text) return text;
      if (text.startsWith("xai_quota.")) {
        const separatorIndex = text.indexOf("::");
        const key = separatorIndex >= 0 ? text.slice(0, separatorIndex) : text;
        const value = separatorIndex >= 0 ? text.slice(separatorIndex + 2) : "";
        if (key === "xai_quota.product_usage_named" && value) return t(key, { product: value });
        if (key === "xai_quota.used_percent" && value) return t(key, { percent: value });
        if (key === "xai_quota.remaining_percent" && value) return t(key, { percent: value });
        if (key === "xai_quota.reset_at" && value) return t(key, { time: value });
        return t(key);
      }
      if (text.startsWith("m_quota.")) return t(text);
      if (text.startsWith("auth_files.")) return t(text);
      if (text.startsWith("common.")) return t(text);
      if (text.startsWith("claude_quota.")) return t(text);
      if (text.startsWith("antigravity_quota.")) return t(text);
      if (KNOWN_QUOTA_TEXT_KEYS.has(text)) return t(`m_quota.${text}`);
      const additionalQuota = parseAdditionalQuotaWindowLabel(text);
      if (additionalQuota) {
        return t(`m_quota.additional_${additionalQuota.window}`, {
          name: additionalQuota.name,
        });
      }
      return text;
    },
    [t],
  );

  const formatPlanTypeLabel = useCallback(
    (planType: string) => {
      const normalized = planType.trim().toLowerCase();
      if (!normalized) return "";
      if (normalized === "plus" || normalized === "team" || normalized === "free") {
        return t(`codex_quota.plan_${normalized}`);
      }
      if (normalized === "supergrok") return t("xai_quota.plan_supergrok");
      if (
        normalized === "supergrok-heavy" ||
        normalized === "supergrok_heavy" ||
        normalized === "supergrokheavy"
      ) {
        return t("xai_quota.plan_supergrok_heavy");
      }
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    },
    [t],
  );

  const restrictionUnitLabels = useMemo(
    () => ({
      day: t("auth_files.restriction_duration_day"),
      hour: t("auth_files.restriction_duration_hour"),
      minute: t("auth_files.restriction_duration_minute"),
      second: t("auth_files.restriction_duration_second"),
    }),
    [t],
  );

  const formatRestrictionBadgeLabel = useCallback(
    (label: string) => {
      const status = label.match(/^(\d+)\s+Error$/i)?.[1];
      if (status) return t("auth_files.restriction_http_label", { status });
      if (label === "Quota Limited") return t("auth_files.restriction_quota_label");
      if (label === "Restricted") return t("auth_files.restriction_generic_label");
      return label;
    },
    [t],
  );

  const formatRestrictionQuotaWindowLabel = useCallback(
    (badge: ReturnType<typeof resolveAuthFileRestrictionBadges>[number]) => {
      if (badge.quotaWindow === "5h") return t("auth_files.restriction_window_5h");
      if (badge.quotaWindow === "week") return t("auth_files.restriction_window_week");
      if (badge.quotaWindow) return badge.quotaWindow;
      if (badge.quotaWindowMinutes) {
        return t("auth_files.restriction_window_minutes", { minutes: badge.quotaWindowMinutes });
      }
      return "";
    },
    [t],
  );

  const formatRestrictionTooltip = useCallback(
    (badge: ReturnType<typeof resolveAuthFileRestrictionBadges>[number]) => {
      const quotaWindow = formatRestrictionQuotaWindowLabel(badge);
      // Always surface the upstream reason (parsed status_message / quota reason).
      // Hiding it for quota-limited badges left 429 chips without any error detail.
      // ponytail: multi-line string; HoverTooltip already uses whitespace-pre-line.
      const reason =
        badge.reason === "quota" ? t("auth_files.restriction_quota_label") : badge.reason;
      const parts = [
        badge.quotaLimited ? t("auth_files.restriction_limited") : "",
        quotaWindow ? t("auth_files.restriction_window", { window: quotaWindow }) : "",
        badge.model ? t("auth_files.restriction_model", { model: badge.model }) : "",
        reason ? t("auth_files.restriction_reason", { reason }) : "",
      ].filter(Boolean);
      if (badge.recoverAtMs) {
        const remaining = formatAuthFileRestrictionRemaining(
          badge.recoverAtMs,
          nowMs,
          restrictionUnitLabels,
        );
        parts.push(
          t("auth_files.restriction_resets_at", {
            time: new Date(badge.recoverAtMs).toLocaleString(),
          }),
        );
        parts.push(t("auth_files.restriction_recovery_in", { time: remaining }));
      } else {
        parts.push(t("auth_files.restriction_recovery_unknown"));
      }
      return parts.join("\n");
    },
    [formatRestrictionQuotaWindowLabel, nowMs, restrictionUnitLabels, t],
  );

  const renderRestrictionBadges = useCallback(
    (file: AuthFileItem): ReactNode | null => {
      // xAI week restriction recovery is the account weekly_limit reset, not probe cooldown.
      const weeklyResetAtMs = resolveAuthFileWeeklyQuotaResetAtMs(
        quotaByFileName[file.name]?.items,
      );
      const badges = resolveAuthFileRestrictionBadges(file, nowMs, weeklyResetAtMs);
      if (badges.length === 0) return null;
      return (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {badges.map((badge) => (
            <HoverTooltip key={badge.key} content={formatRestrictionTooltip(badge)} placement="top">
              <span
                data-testid="auth-file-restriction-badge"
                className={[
                  "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold tabular-nums",
                  RESTRICTION_TONE_CLASSES[badge.tone],
                ].join(" ")}
              >
                <AlertTriangle size={11} className="shrink-0" />
                <span className="min-w-0 truncate">{formatRestrictionBadgeLabel(badge.label)}</span>
              </span>
            </HoverTooltip>
          ))}
        </div>
      );
    },
    [formatRestrictionBadgeLabel, formatRestrictionTooltip, nowMs, quotaByFileName],
  );

  const renderClaudeOAuthHealthBadges = useCallback(
    (file: AuthFileItem): ReactNode | null => {
      const badges = resolveClaudeOAuthHealthBadges(file, nowMs);
      if (badges.length === 0) return null;

      const formatBadgeLabel = (label: string) => {
        if (label === "OAuth refresh pending") {
          return t("auth_files.claude_oauth_health_badge_refresh_pending");
        }
        if (label === "5h limited") return t("auth_files.claude_oauth_health_badge_5h_limited");
        if (label === "7d limited") return t("auth_files.claude_oauth_health_badge_7d_limited");
        return label;
      };

      const formatBadgeTooltip = (
        badge: ReturnType<typeof resolveClaudeOAuthHealthBadges>[number],
      ) => {
        const parts = [
          formatBadgeLabel(badge.label),
          badge.status ? t("auth_files.claude_oauth_health_status", { status: badge.status }) : "",
          badge.reason ? t("auth_files.claude_oauth_health_reason", { reason: badge.reason }) : "",
          badge.resetAtMs
            ? t("auth_files.claude_oauth_health_reset", {
                time: new Date(badge.resetAtMs).toLocaleString(),
              })
            : "",
          typeof badge.utilization === "number" && Number.isFinite(badge.utilization)
            ? t("auth_files.claude_oauth_health_utilization", {
                value: `${Math.round(badge.utilization * 100)}%`,
              })
            : "",
        ].filter(Boolean);
        return parts.join("\n");
      };

      return (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {badges.map((badge) => (
            <HoverTooltip key={badge.key} content={formatBadgeTooltip(badge)} placement="top">
              <span
                className={[
                  "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold tabular-nums",
                  CLAUDE_OAUTH_HEALTH_TONE_CLASSES[badge.tone],
                ].join(" ")}
              >
                <AlertTriangle size={11} className="shrink-0" />
                <span className="min-w-0 truncate">{formatBadgeLabel(badge.label)}</span>
              </span>
            </HoverTooltip>
          ))}
        </div>
      );
    },
    [nowMs, t],
  );

  const renderSubscriptionBadge = useCallback(
    (file: AuthFileItem): ReactNode | null => {
      const status = resolveAuthFileSubscriptionStatus(file, nowMs);
      if (!status) return null;

      const days = Math.max(0, Math.abs(status.remainingDays));
      const label = status.expired
        ? t("auth_files.subscription_expired_short", { days })
        : status.expiresAtMs - nowMs < 24 * 60 * 60 * 1000
          ? t("auth_files.subscription_remaining_less_than_day")
          : t("auth_files.subscription_remaining_short", { days });
      const title = t("auth_files.subscription_expires_at_title", {
        start: status.startedAtText,
        date: status.expiresAtText,
        period: t(`auth_files.subscription_period_${status.period}`),
      });

      return (
        <HoverTooltip content={title}>
          <span
            className={[
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold tabular-nums",
              SUBSCRIPTION_TONE_CLASSES[status.tone],
            ].join(" ")}
          >
            <CalendarClock size={12} className="shrink-0" />
            <span className="min-w-0 truncate">{label}</span>
          </span>
        </HoverTooltip>
      );
    },
    [nowMs, t],
  );

  const formatQuotaResetTextCompact = useCallback(
    (resetAtMs?: number) => {
      if (typeof resetAtMs !== "number" || !Number.isFinite(resetAtMs)) return null;

      const diffMs = resetAtMs - nowMs;
      if (diffMs <= 0) return t("m_quota.refresh_due");

      let seconds = Math.max(1, Math.ceil(diffMs / 1000));
      const days = Math.floor(seconds / 86400);
      seconds -= days * 86400;
      const hours = Math.floor(seconds / 3600);
      seconds -= hours * 3600;
      const minutes = Math.floor(seconds / 60);
      seconds -= minutes * 60;

      const parts: string[] = [];
      if (days) parts.push(t("m_quota.duration_day_compact", { count: days }));
      if (hours) parts.push(t("m_quota.duration_hour_compact", { count: hours }));
      if (minutes) parts.push(t("m_quota.duration_minute_compact", { count: minutes }));
      parts.push(t("m_quota.duration_second_compact", { count: seconds }));
      return parts.join("");
    },
    [nowMs, t],
  );

  const renderFilesViewModeTabs = useMemo(() => {
    const options: { value: FilesViewMode; label: string }[] = [
      { value: "table", label: t("common.view_mode_list") },
      { value: "cards", label: t("common.view_mode_cards") },
    ];
    return (
      <Tabs
        value={filesViewMode}
        onValueChange={(next) => setFilesViewMode(next as FilesViewMode)}
        size="sm"
      >
        <TabsList>
          {options.map((opt) => {
            return (
              <TabsTrigger key={opt.value} value={opt.value}>
                {opt.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    );
  }, [filesViewMode, setFilesViewMode, t]);

  const quotaProgressCircle = useCallback((percent: number | null) => {
    const tone = resolveQuotaVisualTone(percent);
    const normalized = tone.normalized;
    const deg = normalized === null ? 0 : Math.max(0, Math.min(360, (normalized / 100) * 360));

    return (
      <span
        className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 rounded-full dark:hidden"
          style={{
            background: `conic-gradient(${tone.fillHex} ${deg}deg, rgba(148, 163, 184, 0.35) 0deg)`,
          }}
        />
        <span
          className="absolute inset-0 hidden rounded-full dark:block"
          style={{
            background: `conic-gradient(${tone.fillHex} ${deg}deg, rgba(255, 255, 255, 0.14) 0deg)`,
          }}
        />
        <span className="absolute inset-[2px] rounded-full bg-white dark:bg-neutral-950" />
      </span>
    );
  }, []);

  const formatQuotaItemDetailText = useCallback(
    (item: QuotaItem | null | undefined) => {
      const meta = item?.meta ? translateQuotaText(item.meta) : null;
      const reset = formatQuotaResetTextCompact(item?.resetAtMs);
      const resetLabel =
        reset && item?.label.startsWith("xai_quota.")
          ? t("xai_quota.reset_at", { time: reset })
          : reset;
      const parts = [meta, resetLabel].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : null;
    },
    [formatQuotaResetTextCompact, t, translateQuotaText],
  );

  const resolveQuotaErrorBadgeLabel = useCallback(
    (errorText: string) => {
      const translated = translateQuotaText(errorText);
      const statusMatch = translated.match(/^(\d{3})\b/);
      if (statusMatch) {
        return t("auth_files.restriction_http_label", { status: statusMatch[1] });
      }
      return t("common.error");
    },
    [t, translateQuotaText],
  );

  const renderQuotaErrorBadge = useCallback(
    (errorText: string): ReactNode => {
      const detail = translateQuotaText(errorText || t("common.error"));
      const label = resolveQuotaErrorBadgeLabel(detail);
      return (
        <HoverTooltip content={detail} placement="top" className="max-w-full">
          <span
            data-testid="auth-file-quota-error-badge"
            className={[
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold tabular-nums",
              RESTRICTION_TONE_CLASSES.danger,
            ].join(" ")}
          >
            <AlertTriangle size={11} className="shrink-0" />
            <span className="min-w-0 truncate">{label}</span>
          </span>
        </HoverTooltip>
      );
    },
    [resolveQuotaErrorBadgeLabel, t, translateQuotaText],
  );

  const renderQuotaHoverContent = useCallback(
    (state: QuotaState, options?: { suppressItemMeta?: boolean }) => {
      const items = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
      const hasError = state.status === "error";

      return (
        <div className="space-y-1">
          {hasError ? (
            <p className="max-w-80 whitespace-pre-wrap break-words text-xs font-semibold text-rose-700 dark:text-rose-200">
              {translateQuotaText(state.error ?? t("common.error"))}
            </p>
          ) : null}

          {items.length > 0 ? (
            <div className="quota-tooltip-grid grid w-[min(26rem,calc(100vw-2rem))] grid-cols-[minmax(0,1fr)_0.875rem_max-content_max-content] items-center gap-x-2 gap-y-1">
              {items.map((item) => {
                const tone = resolveQuotaVisualTone(item.percent);
                const percentText =
                  (item.value ? translateQuotaText(item.value) : undefined) ??
                  (tone.normalized === null ? "--" : `${Math.round(tone.normalized)}%`);
                const resetText = formatQuotaItemDetailText(item);
                const itemMeta =
                  options?.suppressItemMeta || resetText ? undefined : item.meta;
                return (
                  <div key={item.label} className="contents">
                    <span className="min-w-0 truncate text-2xs font-semibold text-slate-600 dark:text-white/70">
                      {translateQuotaText(item.label)}
                    </span>
                    <span className="flex items-center justify-center">
                      {quotaProgressCircle(item.percent)}
                    </span>
                    <span
                      className={[
                        "justify-self-end whitespace-nowrap text-2xs font-semibold tabular-nums",
                        tone.percentClass,
                      ].join(" ")}
                    >
                      {percentText}
                    </span>
                    <span className="whitespace-nowrap text-right text-2xs tabular-nums text-slate-500 dark:text-white/40">
                      {resetText ?? "--"}
                    </span>
                    {itemMeta ? (
                      <span className="col-span-4 truncate text-2xs text-slate-500 dark:text-white/55">
                        {itemMeta}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    },
    [formatQuotaItemDetailText, quotaProgressCircle, t, translateQuotaText],
  );

  const renderQuotaBar = useCallback(
    (label: string, item: QuotaItem | null): ReactNode => {
      const tone = resolveQuotaVisualTone(item?.percent);
      const normalized = tone.normalized;
      const percentText =
        (item?.value ? translateQuotaText(item.value) : undefined) ??
        (normalized === null ? "--" : `${Math.round(normalized)}%`);
      // Keep a fixed-height meta row so bars stay evenly spaced; hide "--" when empty.
      const detailText = formatQuotaItemDetailText(item);

      return (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-semibold text-slate-700 dark:text-white/80">
              {translateQuotaText(label)}
            </span>
            <span
              className={[
                "shrink-0 text-xs font-semibold tabular-nums",
                tone.percentClass,
              ].join(" ")}
            >
              {percentText}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
            <div
              className={["h-full rounded-full", tone.fillClass].join(" ")}
              style={{ width: `${normalized ?? 0}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="min-h-[14px] truncate text-2xs tabular-nums text-slate-500 dark:text-white/45">
            {detailText ?? "\u00A0"}
          </div>
        </div>
      );
    },
    [formatQuotaItemDetailText, translateQuotaText],
  );

  const fileColumns = useMemo<DataTableColumn<AuthFileItem>[]>(() => {
    return [
      {
        key: "select",
        label: "",
        width: "w-14",
        headerClassName: "text-center",
        cellClassName: "text-center",
        headerRender: () => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label={t("auth_files.select_current_page")}
              checked={allPageSelected}
              disabled={selectablePageNames.length === 0}
              ref={(node) => {
                if (node) node.indeterminate = somePageSelected;
              }}
              onChange={(event) => selectCurrentPage(event.currentTarget.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
            />
          </div>
        ),
        render: (file) => {
          if (isRuntimeOnlyAuthFile(file)) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }
          const checked = selectedFileNameSet.has(file.name);
          return (
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                aria-label={t("auth_files.select_file", {
                  name: resolveAuthFileDisplayName(file) || file.name,
                })}
                checked={checked}
                onChange={(event) => toggleFileSelection(file.name, event.currentTarget.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
              />
            </div>
          );
        },
      },
      {
        key: "name",
        label: t("auth_files.col_name"),
        width: "w-72",
        render: (file) => {
          const supplementalTags = resolveAuthFileSupplementalTags(
            file,
            quotaByFileName[file.name],
          );
          const restrictionBadges = renderRestrictionBadges(file);
          const claudeOAuthHealthBadges = renderClaudeOAuthHealthBadges(file);
          return (
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-slate-900 dark:text-white">
                {resolveAuthFileDisplayName(file) || "--"}
              </p>
              {supplementalTags.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {supplementalTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-2xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {restrictionBadges ? <div className="mt-1">{restrictionBadges}</div> : null}
              {claudeOAuthHealthBadges ? (
                <div className="mt-1">{claudeOAuthHealthBadges}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "type",
        label: t("auth_files.col_type"),
        width: "w-32",
        render: (file) => {
          const typeKey = resolveFileType(file);
          const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
          const planType = resolveAuthFilePlanType(file, quotaByFileName[file.name]);
          const runtimeOnly = isRuntimeOnlyAuthFile(file);
          const showTypeBadge = shouldShowAuthFileDisplayTag(file, typeKey);
          const showPlanBadge = shouldShowAuthFilePlanBadge(file, planType);

          return (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {showTypeBadge ? (
                  <span
                    className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${badgeClass}`}
                  >
                    {typeKey}
                  </span>
                ) : null}
                {showPlanBadge && planType ? (
                  <span className="inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                    {t("codex_quota.plan_label")} {formatPlanTypeLabel(planType)}
                  </span>
                ) : null}
              </div>
              {runtimeOnly ? (
                <span className="inline-flex w-fit rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
                  {t("auth_files.virtual_auth_file")}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "subscription",
        label: t("auth_files.col_subscription"),
        width: "w-40",
        render: (file) =>
          renderSubscriptionBadge(file) ?? (
            <span className="text-xs text-slate-400 dark:text-white/40">--</span>
          ),
      },
      {
        key: "size",
        label: t("auth_files.file_size"),
        width: "w-24",
        render: (file) => (
          <span className="text-xs tabular-nums text-slate-700 dark:text-white/70">
            {formatFileSize(file.size)}
          </span>
        ),
      },
      {
        key: "modified",
        label: t("auth_files.file_modified"),
        width: "w-36",
        render: (file) => (
          <span className="text-xs tabular-nums text-slate-700 dark:text-white/70">
            {formatModified(file)}
          </span>
        ),
      },
      {
        key: "connectivity",
        label: t("auth_files.col_connectivity"),
        width: "w-28",
        render: (file) => {
          const state = connectivityState.get(file.name);
          return (
            <button
              type="button"
              disabled={state?.loading}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs tabular-nums text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-default disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/60 dark:hover:border-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300"
              onClick={() => void checkAuthFileConnectivity(file.name)}
              title={t("auth_files.check_connectivity")}
              aria-label={t("auth_files.check_connectivity")}
            >
              {state?.loading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : state?.error ? (
                <span className="font-bold text-rose-500">✕</span>
              ) : state?.latencyMs != null ? (
                <span className="font-medium">{formatLatency(state.latencyMs)}</span>
              ) : (
                <Zap size={10} />
              )}
            </button>
          );
        },
      },
      {
        key: "success",
        label: t("common.success"),
        width: "w-20",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          return (
            <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-200">
              {stats.success}
            </span>
          );
        },
      },
      {
        key: "failure",
        label: t("common.failure"),
        width: "w-20",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          return (
            <span className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-200">
              {stats.failure}
            </span>
          );
        },
      },
      {
        key: "rate",
        label: t("common.success_rate"),
        width: "w-44",
        render: (file) => {
          const statusData = resolveAuthFileStatusBar(file, usageIndex);
          return <ProviderStatusBar data={statusData} compact />;
        },
      },
      {
        key: "quota",
        label: t("auth_files.col_quota"),
        width: "w-52",
        overflowTooltip: false,
        headerClassName: "text-center",
        headerRender: () => (
          <div className="flex items-center justify-center gap-2 normal-case">
            <span className="text-xs font-semibold text-slate-500 dark:text-white/60">
              {t("auth_files.col_quota")}
            </span>
            <Select
              value={quotaPreviewMode}
              onChange={(value) => setQuotaPreviewMode(value === "week" ? "week" : "5h")}
              options={[
                { value: "5h", label: t("auth_files.quota_preview_5h") },
                { value: "week", label: t("auth_files.quota_preview_week") },
              ]}
              aria-label={t("auth_files.col_quota")}
              className="w-[72px]"
              variant="chip"
            />
          </div>
        ),
        render: (file) => {
          const provider = resolveQuotaProvider(file);
          if (!provider) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }

          const state = quotaByFileName[file.name] ?? { status: "idle", items: [] };
          const rawItems = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
          const items =
            provider === "antigravity" ? filterAntigravityQuotaItems(rawItems) : rawItems;
          const displayState = items === rawItems ? state : { ...state, items };
          const hasError = state.status === "error";

          const renderQuotaLinePreview = (item: QuotaItem) => {
            const tone = resolveQuotaVisualTone(item.percent);
            const percentText =
              (item.value ? translateQuotaText(item.value) : undefined) ??
              (tone.normalized === null ? "--" : `${Math.round(tone.normalized)}%`);
            const detailText = formatQuotaItemDetailText(item) ?? "--";
            return (
              <div
                key={item.label}
                className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_0.875rem_auto_3.25rem] items-center gap-1"
              >
                <span className="min-w-0 truncate text-2xs font-semibold text-slate-600 dark:text-white/70">
                  {translateQuotaText(item.label)}
                </span>
                {quotaProgressCircle(item.percent)}
                <span
                  className={[
                    "justify-self-end text-2xs font-semibold tabular-nums",
                    tone.percentClass,
                  ].join(" ")}
                >
                  {percentText}
                </span>
                <span className="min-w-0 truncate whitespace-nowrap text-right text-2xs tabular-nums text-slate-500 dark:text-white/40">
                  {detailText}
                </span>
              </div>
            );
          };

          if (hasError && items.length === 0) {
            return renderQuotaErrorBadge(state.error ?? t("common.error"));
          }

          return (
            <HoverTooltip
              disabled={items.length === 0}
              className="w-full min-w-0"
              content={renderQuotaHoverContent(displayState, {
                suppressItemMeta: provider === "antigravity",
              })}
            >
              <div className="w-full min-w-0">
                {items.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-white/40">--</span>
                ) : (
                  renderQuotaLinePreview(pickQuotaPreviewItem(items, quotaPreviewMode) ?? items[0])
                )}
              </div>
            </HoverTooltip>
          );
        },
      },
      {
        key: "enabled",
        label: t("auth_files.enable"),
        width: "w-24",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (file) => {
          if (isRuntimeOnlyAuthFile(file)) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }
          return (
            <ToggleSwitch
              ariaLabel={t("auth_files.enable_disable")}
              checked={!file.disabled}
              onCheckedChange={(enabled) => void setFileEnabled(file, enabled)}
              disabled={Boolean(statusUpdating[file.name])}
            />
          );
        },
      },
      {
        key: "actions",
        label: t("common.action"),
        width: "w-48",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (file) => {
          if (isRuntimeOnlyAuthFile(file)) {
            return (
              <span className="text-xs text-slate-500 dark:text-white/55">
                {t("auth_files.virtual_hint")}
              </span>
            );
          }

          const quotaProvider = resolveQuotaProvider(file);
          const quotaRefreshing = quotaProvider
            ? quotaByFileName[file.name]?.status === "loading"
            : false;
          const resetCreditCount =
            quotaProvider === "codex" &&
            typeof quotaByFileName[file.name]?.resetCreditCount === "number"
              ? (quotaByFileName[file.name]?.resetCreditCount ?? 0)
              : 0;
          const resetCreditBusy = resettingCreditFileName === file.name;
          const resetCreditDisabled =
            quotaProvider !== "codex" ||
            quotaRefreshing ||
            resetCreditBusy ||
            resetCreditCount <= 0;
          const resetCreditTitle =
            resetCreditCount > 0
              ? t("auth_files.reset_credit_consume")
              : t("auth_files.reset_credit_no_credits");

          return (
            <div className="inline-flex min-w-max items-center justify-center gap-1 whitespace-nowrap">
              {quotaProvider ? (
                <HoverTooltip content={t("common.refresh")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshQuota(file, quotaProvider)}
                    title={t("common.refresh")}
                    aria-label={t("common.refresh")}
                  >
                    <RefreshCw size={16} className={quotaRefreshing ? "animate-spin" : ""} />
                  </Button>
                </HoverTooltip>
              ) : null}

              {quotaProvider === "codex" ? (
                <HoverTooltip content={resetCreditTitle}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={resetCreditDisabled}
                    onClick={() => requestResetCredit(file)}
                    title={resetCreditTitle}
                    aria-label={t("auth_files.reset_credit_consume")}
                  >
                    {resetCreditBusy ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Gauge size={16} />
                    )}
                  </Button>
                </HoverTooltip>
              ) : null}

              <HoverTooltip content={t("auth_files.edit_tags")}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openTagsEditor(file)}
                  title={t("auth_files.edit_tags")}
                  aria-label={t("auth_files.edit_tags")}
                >
                  <Tags size={16} />
                </Button>
              </HoverTooltip>

              <HoverTooltip content={t("auth_files.detail")}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openDetail(file)}
                  title={t("auth_files.detail")}
                  aria-label={t("auth_files.detail")}
                >
                  <Eye size={16} />
                </Button>
              </HoverTooltip>

              <HoverTooltip content={t("auth_files.download")}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void downloadAuthFile(file)}
                  title={t("auth_files.download")}
                  aria-label={t("auth_files.download")}
                >
                  <Download size={16} />
                </Button>
              </HoverTooltip>
            </div>
          );
        },
      },
    ];
  }, [
    allPageSelected,
    checkAuthFileConnectivity,
    connectivityState,
    downloadAuthFile,
    formatQuotaItemDetailText,
    formatPlanTypeLabel,
    openDetail,
    openTagsEditor,
    quotaByFileName,
    quotaPreviewMode,
    quotaProgressCircle,
    refreshQuota,
    requestResetCredit,
    renderQuotaErrorBadge,
    renderRestrictionBadges,
    renderClaudeOAuthHealthBadges,
    renderSubscriptionBadge,
    resettingCreditFileName,
    selectCurrentPage,
    selectablePageNames.length,
    selectedFileNameSet,
    setFileEnabled,
    setQuotaPreviewMode,
    somePageSelected,
    statusUpdating,
    t,
    toggleFileSelection,
    translateQuotaText,
    usageIndex,
  ]);

  return {
    translateQuotaText,
    formatPlanTypeLabel,
    renderRestrictionBadges,
    renderClaudeOAuthHealthBadges,
    renderSubscriptionBadge,
    renderQuotaBar,
    renderQuotaErrorBadge,
    renderFilesViewModeTabs,
    fileColumns,
  };
}
