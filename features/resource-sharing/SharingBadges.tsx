import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import type { ResourceSharing, TenantRef } from "@code-proxy/api-client";
import { HoverTooltip } from "@code-proxy/ui";
import { resolveTenantNames } from "./sharingTenants";

export type SharingBadgeTone = "info" | "warning";

/**
 * 标签只用淡底、不描边（097 规则）：共享状态是说明性质，用天蓝；副本、覆盖、重复这类
 * 「需要处理」的提示用琥珀。
 */
const TONE_CLASS: Record<SharingBadgeTone, string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
};

const INTERACTIVE_TONE_CLASS: Record<SharingBadgeTone, string> = {
  info: "hover:bg-sky-500/15",
  warning: "hover:bg-amber-500/20 dark:hover:bg-amber-400/25",
};

const BADGE_CLASS =
  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold outline-none focus-visible:shadow-control-focus [&_svg]:shrink-0";

/** 多行提示：一句说明 + 逐行列出租户。 */
export const tenantListTooltip = (lead: string, names: readonly string[]): string =>
  [lead, ...names.map((name) => `· ${name}`)].join("\n");

export function SharingNoticeBadge({
  label,
  tooltip,
  tone = "info",
  icon,
  onClick,
  ariaLabel,
  testId,
  className,
}: {
  label: ReactNode;
  tooltip: string;
  tone?: SharingBadgeTone;
  icon?: ReactNode;
  /** 有操作时渲染成按钮（例如「让它们改用共享版本」），否则是可聚焦的说明标签。 */
  onClick?: () => void;
  ariaLabel?: string;
  testId?: string;
  className?: string;
}) {
  const classes = [
    BADGE_CLASS,
    TONE_CLASS[tone],
    onClick ? INTERACTIVE_TONE_CLASS[tone] : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
  return (
    <HoverTooltip content={tooltip} className="max-w-full" placement="top">
      {onClick ? (
        <button
          type="button"
          className={classes}
          onClick={onClick}
          aria-label={ariaLabel}
          data-testid={testId}
        >
          {content}
        </button>
      ) : (
        // 可聚焦：键盘用户也要能读到悬停才出现的租户列表（HoverTooltip 在聚焦时同样展开）。
        <span tabIndex={0} className={classes} aria-label={ariaLabel} data-testid={testId}>
          {content}
        </span>
      )}
    </HoverTooltip>
  );
}

/** 共享状态：未共享不显示；「全部租户」或「N 个租户」，悬停列出租户名。 */
export function SharingStatusBadge({
  sharing,
  tenantNames,
  className,
}: {
  sharing: ResourceSharing | null;
  tenantNames?: ReadonlyMap<string, string>;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!sharing) return null;
  if (sharing.all) {
    return (
      <SharingNoticeBadge
        label={t("resource_sharing.badge_all")}
        tooltip={t("resource_sharing.badge_all_tooltip")}
        icon={<Share2 size={11} aria-hidden="true" />}
        testId="resource-sharing-badge"
        className={className}
      />
    );
  }
  const names = resolveTenantNames(sharing.tenantIds, tenantNames);
  return (
    <SharingNoticeBadge
      label={t("resource_sharing.badge_tenants", { count: names.length })}
      tooltip={tenantListTooltip(t("resource_sharing.badge_tenants_tooltip"), names)}
      icon={<Share2 size={11} aria-hidden="true" />}
      testId="resource-sharing-badge"
      className={className}
    />
  );
}

/** 点名一组租户的琥珀色提示（持有账号副本、仍用自有同 ID 代理……），悬停列出租户名。 */
export function TenantRefsBadge({
  tenants,
  label,
  lead,
  icon,
  onClick,
  ariaLabel,
  testId,
}: {
  tenants: readonly TenantRef[];
  label: ReactNode;
  lead: string;
  icon?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  testId?: string;
}) {
  if (tenants.length === 0) return null;
  return (
    <SharingNoticeBadge
      tone="warning"
      label={label}
      tooltip={tenantListTooltip(
        lead,
        tenants.map((tenant) => tenant.name || tenant.id),
      )}
      icon={icon}
      onClick={onClick}
      ariaLabel={ariaLabel}
      testId={testId}
    />
  );
}
