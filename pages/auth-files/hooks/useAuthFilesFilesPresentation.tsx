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
import { AuthFileSuccessRateCell } from "../components/AuthFileSuccessRateCell";
import { AuthFilePlanBadge } from "../components/AuthFilePlanBadge";
import { ProviderTag, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { GRID_ROW_ACTIONS_COLUMN, GRID_WIDTH, GridRowActions, HoverTooltip } from "@code-proxy/ui";
import { ToggleSwitch, type DataGridColumn } from "@code-proxy/ui";
import {
  type FilesViewMode,
  type UsageIndex,
  formatModified,
  resolveClaudeOAuthHealthBadges,
  isRuntimeOnlyAuthFile,
  maskSensitiveIdentity,
  normalizeAuthIndexValue,
  parseAdditionalQuotaWindowLabel,
  resolveAuthFileDisplayName,
  resolveAuthFilePlanType,
  resolveAuthFileSupplementalTags,
  resolveAuthFileStats,
  resolveAuthFileStatusBar,
  resolveAuthFileSubscriptionStatus,
  resolveFileType,
  shouldShowAuthFileDisplayTag,
  shouldShowAuthFilePlanBadge,
  translateParameterizedQuotaLabel,
  translateXaiQuotaLabel,
  type AuthFileCycleBudgetStats,
} from "@code-proxy/domain";
import { resolveQuotaProvider, type QuotaProvider } from "@features/quota-preview/quota-fetch";
import { quotaMetaHasMoney, resolveDisplayableQuotaMeta } from "@features/quota-preview/quota-meta";
import { useStickyDisplayPlans } from "./useStickyDisplayPlans";
import { useAuthFileRestrictionBadges } from "./useAuthFileRestrictionBadges";
import { AuthFileQuotaCell } from "../components/AuthFileQuotaCell";
import { useQuotaBarRenderer } from "./quotaBar";
import type { QuotaItem, QuotaState } from "@features/quota-preview/quota-helpers";
import {
  CLAUDE_OAUTH_HEALTH_TONE_CLASSES,
  KNOWN_QUOTA_TEXT_KEYS,
  RESTRICTION_TONE_CLASSES,
  SUBSCRIPTION_TONE_CLASSES,
} from "./presentationStyles";

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
  refreshFilesForItems: (files: AuthFileItem[]) => Promise<AuthFileItem[]>;
  requestResetCredit: (file: AuthFileItem) => void;
  resettingCreditFileName: string | null;
  openDetail: (file: AuthFileItem) => Promise<void>;
  downloadAuthFile: (file: AuthFileItem) => Promise<void>;
  openTagsEditor: (file: AuthFileItem) => void;
  statusUpdating: Record<string, boolean>;
  setFileEnabled: (file: AuthFileItem, enabled: boolean) => Promise<void>;
  usageIndex: UsageIndex;
  masked?: boolean;
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
  refreshFilesForItems,
  requestResetCredit,
  resettingCreditFileName,
  openDetail,
  downloadAuthFile,
  openTagsEditor,
  statusUpdating,
  setFileEnabled,
  usageIndex,
  masked = false,
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

  const { renderRestrictionBadges } = useAuthFileRestrictionBadges({
    nowMs,
    quotaByFileName,
    refreshFilesForItems,
  });

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
                  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
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
              "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold tabular-nums",
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

  const composeQuotaItemDetailText = useCallback(
    (item: QuotaItem | null | undefined, reset: string | null) => {
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
    [t, translateQuotaText],
  );

  /** Full countdown, down to the second. For tooltips and hover titles. */
  const formatQuotaItemDetailText = useCallback(
    (item: QuotaItem | null | undefined) =>
      composeQuotaItemDetailText(item, formatQuotaResetTextCompact(item?.resetAtMs)),
    [composeQuotaItemDetailText, formatQuotaResetTextCompact],
  );

  /**
   * Two largest units only ("7天22小时"), for the bar itself.
   *
   * A bar prints label, countdown and percentage on one line, and a card four
   * columns wide has no room for "7天22小时35分57秒" as well: the countdown ran
   * under the percentage and was clipped mid-word. Seconds on a window that
   * resets days from now were never worth that space; the full value is still
   * one hover away.
   */
  const formatQuotaItemDetailTextShort = useCallback(
    (item: QuotaItem | null | undefined) =>
      composeQuotaItemDetailText(item, formatQuotaResetTextChip(item?.resetAtMs)),
    [composeQuotaItemDetailText, formatQuotaResetTextChip],
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
              "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
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

  const renderQuotaBar = useQuotaBarRenderer(
    translateQuotaText,
    formatQuotaItemDetailText,
    formatQuotaItemDetailTextShort,
  );

  const fileColumns = useMemo<DataGridColumn<AuthFileItem>[]>(() => {
    return [
      {
        // 勾选列自己画：运行时虚拟账号没有文件、不能批量操作，那一行没有勾选框；
        // 表头勾选框只管当前页可勾选的行（DataGrid 的 selectable 还不支持逐行禁用）。
        id: "select",
        header: t("auth_files.select_current_page"),
        hideHeaderLabel: true,
        pin: "start",
        align: "center",
        width: 44,
        minWidth: 44,
        maxWidth: 44,
        resizable: false,
        hideable: false,
        overflowTooltip: false,
        skeleton: "box",
        headerAccessory: (
          <input
            type="checkbox"
            aria-label={t("auth_files.select_current_page")}
            checked={allPageSelected}
            disabled={selectablePageNames.length === 0}
            ref={(node) => {
              if (node) node.indeterminate = somePageSelected;
            }}
            onChange={(event) => selectCurrentPage(event.currentTarget.checked)}
            className="h-4 w-4 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
          />
        ),
        cell: (file) => {
          if (isRuntimeOnlyAuthFile(file)) {
            return <span className="text-xs text-ink-3">--</span>;
          }
          return (
            <input
              type="checkbox"
              aria-label={t("auth_files.select_file", {
                name: resolveAuthFileDisplayName(file) || file.name,
              })}
              checked={selectedFileNameSet.has(file.name)}
              onChange={(event) => toggleFileSelection(file.name, event.currentTarget.checked)}
              className="h-4 w-4 accent-accent"
            />
          );
        },
      },
      {
        id: "name",
        header: t("auth_files.col_name"),
        width: GRID_WIDTH.nameStacked,
        cell: (file) => {
          const supplementalTags = resolveAuthFileSupplementalTags(
            file,
            quotaByFileName[file.name],
          );
          const restrictionBadges = renderRestrictionBadges(file);
          const claudeOAuthHealthBadges = renderClaudeOAuthHealthBadges(file);
          const rawName = resolveAuthFileDisplayName(file) || "--";
          const displayName = masked && rawName !== "--" ? maskSensitiveIdentity(rawName) : rawName;
          return (
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-slate-900 dark:text-white">
                {displayName}
              </p>
              {supplementalTags.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {supplementalTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-semibold text-ink-2 dark:bg-white/[0.07] colorful:bg-sky-50 colorful:text-sky-700 colorful:dark:bg-sky-500/15 colorful:dark:text-sky-200"
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
        id: "type",
        header: t("auth_files.col_type"),
        width: GRID_WIDTH.badgeStacked,
        cell: (file) => {
          const typeKey = resolveFileType(file);
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
                  <ProviderTag vendor={typeKey} withLogo className="h-5">
                    {typeKey}
                  </ProviderTag>
                ) : null}
                {showPlanBadge && planType ? (
                  <AuthFilePlanBadge provider={typeKey} planType={planType} className="h-5" />
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
        id: "subscription",
        header: t("auth_files.col_subscription"),
        width: GRID_WIDTH.metric,
        cell: (file) =>
          renderSubscriptionBadge(file) ?? (
            <span className="text-xs text-slate-400 dark:text-white/40">--</span>
          ),
      },
      {
        id: "modified",
        header: t("auth_files.file_modified"),
        width: GRID_WIDTH.metric,
        cell: (file) => (
          <span className="text-xs tabular-nums text-slate-700 dark:text-white/70">
            {formatModified(file)}
          </span>
        ),
      },
      {
        id: "connectivity",
        header: t("auth_files.col_connectivity"),
        width: GRID_WIDTH.metric,
        cell: (file) => {
          const state = connectivityState.get(file.name);
          return (
            <button
              type="button"
              disabled={state?.loading}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-1 text-xs tabular-nums text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent-ink disabled:cursor-default disabled:opacity-40 dark:bg-white/[0.07] colorful:hover:bg-blue-50 colorful:hover:text-blue-700 colorful:dark:hover:bg-blue-950 colorful:dark:hover:text-blue-300"
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
        id: "cycle_calls",
        header: t("auth_files.col_cycle_calls"),
        width: GRID_WIDTH.numericWide,
        align: "end",
        cell: (file) => {
          const authIndex = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
          const calls = authIndex ? cycleCallsByAuthIndex[authIndex] : undefined;
          return (
            <span className="inline-flex items-center justify-end gap-1 text-xs font-semibold tabular-nums text-ink-2">
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
        id: "success",
        header: t("common.success"),
        width: GRID_WIDTH.numeric,
        align: "end",
        cell: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          const hasUsage = stats.success + stats.failure > 0;
          return (
            <span className="text-xs font-semibold tabular-nums text-ink-2 colorful:text-emerald-700 colorful:dark:text-emerald-200">
              {statusUsageReady || hasUsage ? stats.success : "--"}
            </span>
          );
        },
      },
      {
        id: "failure",
        header: t("common.failure"),
        width: GRID_WIDTH.numeric,
        align: "end",
        cell: (file) => {
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
        id: "rate",
        header: t("common.success_rate"),
        width: GRID_WIDTH.metric,
        cell: (file) => (
          <AuthFileSuccessRateCell
            data={resolveAuthFileStatusBar(file, usageIndex)}
            ready={statusUsageReady}
            loading={statusUsageLoading}
          />
        ),
      },
      {
        id: "quota",
        header: t("auth_files.col_quota"),
        width: GRID_WIDTH.composite, // chips 两列排布约 290px 够用；36rem 是旧进度条布局的尺寸
        minWidth: 288,
        maxWidth: 640,
        overflowTooltip: false,
        cell: (file) => (
          <AuthFileQuotaCell
            provider={resolveQuotaProvider(file)}
            state={quotaByFileName[file.name] ?? { status: "idle", items: [] }}
            pageProbing={statusUsageLoading}
            resolveSlots={resolveQuotaCardSlots}
            renderErrorBadge={renderQuotaErrorBadge}
            resolveMetaText={resolveQuotaItemMetaText}
            resolveResetText={(item) => formatQuotaResetTextChip(item?.resetAtMs)}
            resolvePercentText={(item, tone) =>
              (item?.value ? translateQuotaText(item.value) : undefined) ??
              (tone.normalized === null ? "--" : `${Math.round(tone.normalized)}%`)
            }
            errorText={t("common.error")}
          />
        ),
      },
      {
        id: "enabled",
        header: t("auth_files.enable"),
        width: GRID_WIDTH.toggle,
        align: "center",
        cell: (file) => {
          if (isRuntimeOnlyAuthFile(file)) {
            return <span className="text-xs text-ink-3">--</span>;
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
        id: "actions",
        header: t("common.action"),
        ...GRID_ROW_ACTIONS_COLUMN,
        cell: (file) => {
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
            <GridRowActions
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
    masked,
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
