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
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { COLUMN_WIDTH, HoverTooltip } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { TABLE_ROW_ACTIONS_COLUMN, TableRowActions, type DataTableColumn } from "@code-proxy/ui";
import {
  type FilesViewMode,
  type UsageIndex,
  TYPE_BADGE_CLASSES,
  formatAuthFileRestrictionRemaining,
  formatModified,
  formatPlanBadgeLabel,
  resolveClaudeOAuthHealthBadges,
  isRuntimeOnlyAuthFile,
  normalizeAuthIndexValue,
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
  resolvePlanBadgeClass,
  shouldShowAuthFileDisplayTag,
  shouldShowAuthFilePlanBadge,
  translateParameterizedQuotaLabel,
  translateXaiQuotaLabel,
  type AuthFileCycleBudgetStats,
} from "@code-proxy/domain";
import { resolveQuotaProvider, type QuotaProvider } from "@features/quota-preview/quota-fetch";
import { quotaMetaHasMoney, resolveDisplayableQuotaMeta } from "@features/quota-preview/quota-meta";
import { useStickyDisplayPlans } from "./useStickyDisplayPlans";
import { QuotaMetricChips } from "../components/QuotaMetricChips";
import { renderQuotaBarNode } from "./quotaBar";
import {
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
    "border-slate-900/8 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-white/70",
} as const;

const CLAUDE_OAUTH_HEALTH_TONE_CLASSES = {
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
} as const;

const STICKY_ACTIONS_HEADER_CLASS =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const STICKY_ACTIONS_CELL_CLASS = "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950";

interface UseAuthFilesFilesPresentationOptions {
  filesViewMode: FilesViewMode;
  setFilesViewMode: (value: FilesViewMode) => void;
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
  resolveQuotaCardSlots: (
    provider: QuotaProvider,
    items: QuotaItem[],
  ) => { id: string; label: string; item: QuotaItem | null }[];
  cycleCallsByAuthIndex: Record<string, number>;
  cycleBudgetByAuthIndex: Record<string, AuthFileCycleBudgetStats>;
  statusUsageReady: boolean;
  statusUsageLoading: boolean;
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
  resolveQuotaCardSlots,
  cycleCallsByAuthIndex,
  cycleBudgetByAuthIndex,
  statusUsageReady,
  statusUsageLoading,
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
  const resolveStickyDisplayPlanType = useStickyDisplayPlans();
  const { t } = useTranslation();

  const translateQuotaText = useCallback(
    (text: string) => {
      if (!text) return text;
      if (text.startsWith("xai_quota.")) return translateXaiQuotaLabel(t, text);
      if (text.startsWith("m_quota.")) return t(text);
      if (text.startsWith("auth_files.")) return t(text);
      if (text.startsWith("common.")) return t(text);
      if (text.startsWith("claude_quota.")) return translateParameterizedQuotaLabel(t, text);
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

  const formatPlanTypeLabel = useCallback((planType: string) => formatPlanBadgeLabel(planType), []);

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
              "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-semibold tabular-nums",
              SUBSCRIPTION_TONE_CLASSES[status.tone],
            ].join(" ")}
          >
            <CalendarClock size={11} className="shrink-0" />
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

  // Chips keep only the two largest units ("2d19h") so the countdown never
  // squeezes the percent out of a half-width chip.
  const formatQuotaResetTextChip = useCallback(
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

      const units = [
        days ? t("m_quota.duration_day_compact", { count: days }) : "",
        hours ? t("m_quota.duration_hour_compact", { count: hours }) : "",
        minutes ? t("m_quota.duration_minute_compact", { count: minutes }) : "",
        seconds ? t("m_quota.duration_second_compact", { count: seconds }) : "",
      ];
      const firstIndex = units.findIndex(Boolean);
      if (firstIndex < 0) return t("m_quota.duration_second_compact", { count: 0 });
      return units
        .slice(firstIndex, firstIndex + 2)
        .filter(Boolean)
        .join("");
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

  const formatQuotaItemDetailText = useCallback(
    (item: QuotaItem | null | undefined) => {
      const reset = formatQuotaResetTextCompact(item?.resetAtMs);
      const resetLabel =
        reset && item?.label.startsWith("xai_quota.")
          ? t("xai_quota.reset_at", { time: reset })
          : reset;
      const meta = resolveDisplayableQuotaMeta(item?.meta ? translateQuotaText(item.meta) : null);
      if (resetLabel && meta) {
        // Keep money remaining ("$40 / $50") next to reset; skip other period labels.
        return quotaMetaHasMoney(meta) ? `${meta} · ${resetLabel}` : resetLabel;
      }
      return resetLabel ?? meta ?? null;
    },
    [formatQuotaResetTextCompact, t, translateQuotaText],
  );

  // Chips render meta and countdown in separate slots, so the meta half is
  // resolved on its own instead of the merged "meta · reset" detail string.
  const resolveQuotaItemMetaText = useCallback(
    (item: QuotaItem | null | undefined) => {
      const meta = resolveDisplayableQuotaMeta(item?.meta ? translateQuotaText(item.meta) : null);
      if (!meta) return null;
      const hasReset = typeof item?.resetAtMs === "number" && Number.isFinite(item.resetAtMs);
      // Non-money meta only restates the period the countdown already shows.
      if (hasReset && !quotaMetaHasMoney(meta)) return null;
      return meta;
    },
    [translateQuotaText],
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

  const renderQuotaBar = useCallback(
    (label: string, item: QuotaItem | null, compact = false): ReactNode =>
      renderQuotaBarNode(label, item, compact, {
        translateQuotaText,
        formatQuotaItemDetailText,
      }),
    [formatQuotaItemDetailText, translateQuotaText],
  );

  const fileColumns = useMemo<DataTableColumn<AuthFileItem>[]>(() => {
    return [
      {
        key: "select",
        label: "",
        width: COLUMN_WIDTH.checkbox,
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
        width: COLUMN_WIDTH.nameStacked,
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
        width: COLUMN_WIDTH.badgeStacked,
        render: (file) => {
          const typeKey = resolveFileType(file);
          const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
          const authIndex = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
          const basePlanType = resolveAuthFilePlanType(file, quotaByFileName[file.name]);
          const planType = resolveStickyDisplayPlanType(
            file,
            quotaByFileName[file.name],
            authIndex ? cycleBudgetByAuthIndex[authIndex] : null,
          );
          const runtimeOnly = isRuntimeOnlyAuthFile(file);
          const showTypeBadge = shouldShowAuthFileDisplayTag(file, typeKey);
          const showPlanBadge = shouldShowAuthFilePlanBadge(file, basePlanType);

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
                  <span
                    data-testid="auth-file-plan-badge"
                    className={[
                      "inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-bold tracking-wide",
                      resolvePlanBadgeClass(planType),
                    ].join(" ")}
                  >
                    {formatPlanTypeLabel(planType)}
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
        width: COLUMN_WIDTH.metric,
        render: (file) =>
          renderSubscriptionBadge(file) ?? (
            <span className="text-xs text-slate-400 dark:text-white/40">--</span>
          ),
      },
      {
        key: "modified",
        label: t("auth_files.file_modified"),
        width: COLUMN_WIDTH.metric,
        render: (file) => (
          <span className="text-xs tabular-nums text-slate-700 dark:text-white/70">
            {formatModified(file)}
          </span>
        ),
      },
      {
        key: "connectivity",
        label: t("auth_files.col_connectivity"),
        width: COLUMN_WIDTH.metric,
        render: (file) => {
          const state = connectivityState.get(file.name);
          return (
            <button
              type="button"
              disabled={state?.loading}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-900/8 bg-slate-50 px-2 py-1 text-xs tabular-nums text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-default disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/60 dark:hover:border-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300"
              onClick={() => void checkAuthFileConnectivity(file.name)}
              title={t("auth_files.check_connectivity")}
              aria-label={t("auth_files.check_connectivity")}
            >
              {state?.error ? (
                <span className="font-bold text-rose-500">✕</span>
              ) : state?.latencyMs != null ? (
                <span className="font-medium">{formatLatency(state.latencyMs)}</span>
              ) : state?.loading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Zap size={10} />
              )}
            </button>
          );
        },
      },
      {
        key: "cycle_calls",
        label: t("auth_files.col_cycle_calls"),
        width: COLUMN_WIDTH.numericWide,
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const authIndex = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
          const calls = authIndex ? cycleCallsByAuthIndex[authIndex] : undefined;
          return (
            <span className="inline-flex items-center justify-end gap-1 text-xs font-semibold tabular-nums text-slate-700 dark:text-white/70">
              {typeof calls === "number" ? (
                calls
              ) : !statusUsageReady && statusUsageLoading ? (
                <Loader2 size={12} className="animate-spin" aria-label={t("common.loading")} />
              ) : (
                "--"
              )}
            </span>
          );
        },
      },
      {
        key: "success",
        label: t("common.success"),
        width: COLUMN_WIDTH.numeric,
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          const hasUsage = stats.success + stats.failure > 0;
          return (
            <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-200">
              {statusUsageReady || hasUsage ? stats.success : "--"}
            </span>
          );
        },
      },
      {
        key: "failure",
        label: t("common.failure"),
        width: COLUMN_WIDTH.numeric,
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          const hasUsage = stats.success + stats.failure > 0;
          return (
            <span className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-200">
              {statusUsageReady || hasUsage ? stats.failure : "--"}
            </span>
          );
        },
      },
      {
        key: "rate",
        label: t("common.success_rate"),
        width: COLUMN_WIDTH.metric,
        render: (file) => {
          const statusData = resolveAuthFileStatusBar(file, usageIndex);
          const hasUsage = statusData.totalSuccess + statusData.totalFailure > 0;
          if (!statusUsageReady && !hasUsage) {
            return statusUsageLoading ? (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-white/45">
                <Loader2 size={12} className="animate-spin" />
                {t("common.loading")}
              </span>
            ) : (
              <span className="text-xs text-slate-400 dark:text-white/40">--</span>
            );
          }
          return <ProviderStatusBar data={statusData} compact />;
        },
      },
      {
        key: "quota",
        label: t("auth_files.col_quota"),
        width: COLUMN_WIDTH.composite, // chips 两列排布约 290px 够用；36rem 是旧进度条布局的尺寸
        minWidthPx: 288,
        maxWidthPx: 640,
        overflowTooltip: false,
        headerClassName: "text-center",
        render: (file) => {
          const provider = resolveQuotaProvider(file);
          if (!provider) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }

          const state = quotaByFileName[file.name] ?? { status: "idle", items: [] };
          const rawItems = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
          const items =
            provider === "antigravity" ? filterAntigravityQuotaItems(rawItems) : rawItems;
          const slots = resolveQuotaCardSlots(provider, items);
          const hasError = state.status === "error" || Boolean(state.error);

          if (hasError && slots.length === 0) {
            return renderQuotaErrorBadge(state.error ?? t("common.error"));
          }

          if (slots.length === 0) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }

          return (
            <QuotaMetricChips
              slots={slots}
              errorBadge={
                hasError ? renderQuotaErrorBadge(state.error ?? t("common.error")) : undefined
              }
              resolveMetaText={resolveQuotaItemMetaText}
              resolveResetText={(item) => formatQuotaResetTextChip(item?.resetAtMs)}
              resolvePercentText={(item, tone) =>
                (item?.value ? translateQuotaText(item.value) : undefined) ??
                (tone.normalized === null ? "--" : `${Math.round(tone.normalized)}%`)
              }
            />
          );
        },
      },
      {
        key: "enabled",
        label: t("auth_files.enable"),
        width: COLUMN_WIDTH.toggle,
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
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        headerClassName: STICKY_ACTIONS_HEADER_CLASS,
        cellClassName: STICKY_ACTIONS_CELL_CLASS,
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
            <TableRowActions
              moreLabel={t("common.more_actions")}
              actions={[
                // Keep high-frequency open/edit actions inline; overflow rarer ops.
                {
                  key: "detail",
                  label: t("auth_files.detail"),
                  icon: <Eye size={16} />,
                  onClick: () => void openDetail(file),
                },
                {
                  key: "tags",
                  label: t("auth_files.edit_tags"),
                  icon: <Tags size={16} />,
                  onClick: () => openTagsEditor(file),
                },
                {
                  key: "refresh",
                  label: t("common.refresh"),
                  icon: <RefreshCw size={16} className={quotaRefreshing ? "animate-spin" : ""} />,
                  visible: Boolean(quotaProvider),
                  onClick: () => {
                    if (quotaProvider) void refreshQuota(file, quotaProvider);
                  },
                },
                {
                  key: "reset-credit",
                  label: resetCreditTitle,
                  icon: resetCreditBusy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Gauge size={16} />
                  ),
                  visible: quotaProvider === "codex",
                  disabled: resetCreditDisabled,
                  onClick: () => requestResetCredit(file),
                },
                {
                  key: "download",
                  label: t("auth_files.download"),
                  icon: <Download size={16} />,
                  onClick: () => void downloadAuthFile(file),
                },
              ]}
            />
          );
        },
      },
    ];
  }, [
    allPageSelected,
    checkAuthFileConnectivity,
    connectivityState,
    cycleBudgetByAuthIndex,
    cycleCallsByAuthIndex,
    statusUsageLoading,
    statusUsageReady,
    downloadAuthFile,
    formatQuotaResetTextChip,
    formatPlanTypeLabel,
    openDetail,
    openTagsEditor,
    quotaByFileName,
    resolveQuotaItemMetaText,
    resolveQuotaCardSlots,
    refreshQuota,
    requestResetCredit,
    resolveStickyDisplayPlanType,
    renderQuotaErrorBadge,
    renderRestrictionBadges,
    renderClaudeOAuthHealthBadges,
    renderSubscriptionBadge,
    resettingCreditFileName,
    selectCurrentPage,
    selectablePageNames.length,
    selectedFileNameSet,
    setFileEnabled,
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
    resolveStickyDisplayPlanType,
    renderRestrictionBadges,
    renderClaudeOAuthHealthBadges,
    renderSubscriptionBadge,
    renderQuotaBar,
    renderQuotaErrorBadge,
    renderFilesViewModeTabs,
    fileColumns,
  };
}
