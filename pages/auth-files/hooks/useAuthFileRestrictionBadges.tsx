import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import type { AuthFileItem } from "@code-proxy/api-client";
import { HoverTooltip } from "@code-proxy/ui";
import {
  formatAuthFileRestrictionRemaining,
  formatCooldownRemaining,
  normalizeAuthIndexValue,
  resolveAuthFileModelCooldowns,
  resolveAuthFileRestrictionBadges,
  resolveAuthFileWeeklyQuotaResetAtMs,
  type AuthFileCooldownReason,
  type AuthFileRestrictionBadge,
} from "@code-proxy/domain";
import type { QuotaState } from "@features/quota-preview/quota-helpers";
import { AuthFileModelCooldownMenu } from "../components/AuthFileModelCooldownMenu";
import { RESTRICTION_TONE_CLASSES } from "./presentationStyles";
import { modelCooldownKey, useAuthFileModelCooldownActions } from "./useAuthFileModelCooldownActions";

/**
 * 账号卡片和表格行上的「为什么这个账号被限制」：每条限制一个徽章，再加一个「冷却中的模型」菜单。
 *
 * 徽章在后端给了原因码（`cooldown_reason`）时写成「原因 · 剩余时间」，没有时（旧后端、或这条限制
 * 不是冷却）仍是原来的「429 错误」「额度受限」。菜单只在列表带了 `model_cooldowns` 时出现，
 * 所以旧后端上没有「立即重试」。
 *
 * 从 useAuthFilesFilesPresentation 原样搬出（页面文件在行数棘轮基线上只能变小），
 * 在此基础上加了原因和菜单。
 */
export function useAuthFileRestrictionBadges({
  nowMs,
  quotaByFileName,
  refreshFilesForItems,
}: {
  nowMs: number;
  quotaByFileName: Record<string, QuotaState>;
  refreshFilesForItems: (files: AuthFileItem[]) => Promise<AuthFileItem[]>;
}) {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  // 重试走 auth_files.write；没有这个权限的运维只看得到列表。没有登录上下文时（独立渲染）不拦。
  const canRetry = auth?.can("auth_files.write") ?? true;
  const { retrying, retryModel } = useAuthFileModelCooldownActions({ refreshFilesForItems });

  const restrictionUnitLabels = useMemo(
    () => ({
      day: t("auth_files.restriction_duration_day"),
      hour: t("auth_files.restriction_duration_hour"),
      minute: t("auth_files.restriction_duration_minute"),
      second: t("auth_files.restriction_duration_second"),
    }),
    [t],
  );

  const formatCooldownReason = useCallback(
    (reason: AuthFileCooldownReason | null) =>
      reason ? t(`auth_files.cooldown_reason.${reason}`) : "",
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

  const formatBadgeText = useCallback(
    (badge: AuthFileRestrictionBadge) => {
      if (!badge.cooldownReason) return formatRestrictionBadgeLabel(badge.label);
      const reason = formatCooldownReason(badge.cooldownReason);
      if (!badge.recoverAtMs) return reason;
      return t("auth_files.cooldown_badge", {
        reason,
        time: formatCooldownRemaining(badge.recoverAtMs, nowMs, restrictionUnitLabels),
      });
    },
    [formatCooldownReason, formatRestrictionBadgeLabel, nowMs, restrictionUnitLabels, t],
  );

  const formatRestrictionQuotaWindowLabel = useCallback(
    (badge: AuthFileRestrictionBadge) => {
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
    (badge: AuthFileRestrictionBadge) => {
      const quotaWindow = formatRestrictionQuotaWindowLabel(badge);
      // Always surface the upstream reason (parsed status_message / quota reason).
      // Hiding it for quota-limited badges left 429 chips without any error detail.
      // ponytail: multi-line string; HoverTooltip already uses whitespace-pre-line.
      const reason =
        badge.reason === "quota" ? t("auth_files.restriction_quota_label") : badge.reason;
      const parts = [
        badge.cooldownReason
          ? t("auth_files.cooldown_cause", { reason: formatCooldownReason(badge.cooldownReason) })
          : "",
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
    [formatCooldownReason, formatRestrictionQuotaWindowLabel, nowMs, restrictionUnitLabels, t],
  );

  const renderRestrictionBadges = useCallback(
    (file: AuthFileItem): ReactNode | null => {
      // xAI week restriction recovery is the account weekly_limit reset, not probe cooldown.
      const weeklyResetAtMs = resolveAuthFileWeeklyQuotaResetAtMs(
        quotaByFileName[file.name]?.items,
      );
      const badges = resolveAuthFileRestrictionBadges(file, nowMs, weeklyResetAtMs);
      // 平台共享给本租户的账号是只读摘要，重试走的是本租户自己的账号，对它没有意义。
      // 没有 auth_index 的条目后端也找不到。
      const cooldowns =
        file.shared !== true && normalizeAuthIndexValue(file.auth_index ?? file.authIndex)
          ? resolveAuthFileModelCooldowns(file, nowMs)
          : [];
      if (badges.length === 0 && cooldowns.length === 0) return null;
      return (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {badges.map((badge) => (
            <HoverTooltip key={badge.key} content={formatRestrictionTooltip(badge)} placement="top">
              <span
                data-testid="auth-file-restriction-badge"
                className={[
                  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
                  RESTRICTION_TONE_CLASSES[badge.tone],
                ].join(" ")}
              >
                <AlertTriangle size={11} className="shrink-0" />
                <span className="min-w-0 truncate">{formatBadgeText(badge)}</span>
              </span>
            </HoverTooltip>
          ))}
          {cooldowns.length > 0 ? (
            <AuthFileModelCooldownMenu
              cooldowns={cooldowns}
              nowMs={nowMs}
              canRetry={canRetry}
              isRetrying={(model) => retrying.has(modelCooldownKey(file.name, model))}
              onRetry={(model) => void retryModel(file, model)}
              formatReason={formatCooldownReason}
              durationLabels={restrictionUnitLabels}
            />
          ) : null}
        </div>
      );
    },
    [
      canRetry,
      formatBadgeText,
      formatCooldownReason,
      formatRestrictionTooltip,
      nowMs,
      quotaByFileName,
      restrictionUnitLabels,
      retryModel,
      retrying,
    ],
  );

  return { renderRestrictionBadges };
}
