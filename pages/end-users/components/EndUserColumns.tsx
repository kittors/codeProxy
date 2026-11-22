import {
  BarChart3,
  History,
  Key,
  KeyRound,
  Lock,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Trash2,
  Unlock,
  Wallet,
} from "lucide-react";
import type { AccessFreeze, ApiKeyPermissionProfile, EndUser } from "@code-proxy/api-client";
import {
  GRID_WIDTH,
  HUES,
  HUE_GLYPH,
  HUE_SOFT,
  HoverTooltip,
  GRID_ROW_ACTIONS_COLUMN,
  GridRowActions,
  cn,
  type DataGridColumn,
  type Hue,
} from "@code-proxy/ui";
import { maskSensitiveIdentity } from "@code-proxy/domain";
import { AccessFreezeChips } from "@features/access-freeze";
import { PolicyBadges, QuotaUsageCell, formatQuotaAmount, formatUsdAmount } from "@features/access-policy";
import { hasResettableQuota } from "../endUserForm";

type Translate = (key: string, options?: Record<string, unknown>) => string;

// 表格直接放在页面上（外壳内容区 canvas），冻结列的底色跟着它走；用 surface 的话深色下是一条亮一档的竖条。
const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-xs font-medium";
const NEUTRAL = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

/** 头像底色按账号 id 散列到一个稳定的色相，避开偏「危险 / 警告」的玫红与琥珀。 */
const AVATAR_HUES = HUES.filter((hue) => hue !== "rose" && hue !== "amber" && hue !== "orange");
const avatarHue = (id: string): Hue => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
};

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** 「3 天前」「2 小时前」：最近登录看的是新旧，不是精确到秒的时刻（悬停显示完整时间）。 */
const formatRelativeTime = (iso: string, locale: string): string => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "-";
  const seconds = Math.round((time - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, "minute");
};

function ExpiryTag({ expiresAt, t }: { expiresAt?: string | null; t: Translate }) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return null;
  const diff = ms - Date.now();
  const expired = diff <= 0;
  const soon = !expired && diff <= 3 * 24 * 3600 * 1000;
  const days = Math.max(1, Math.ceil(diff / (24 * 3600 * 1000)));
  return (
    <HoverTooltip content={new Date(ms).toLocaleString()}>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums",
          expired
            ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
            : soon
              ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
              : NEUTRAL,
        )}
      >
        {expired
          ? t("billing.expiry_expired")
          : t("billing.expiry_remaining_days", { days })}
      </span>
    </HoverTooltip>
  );
}

function AccountCell({ row, masked, t }: { row: EndUser; masked: boolean; t: Translate }) {
  const displayName = masked ? maskSensitiveIdentity(row.display_name) : row.display_name;
  const username = masked ? maskSensitiveIdentity(row.username) : row.username;
  const initial = (row.display_name || row.username || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          NEUTRAL,
          HUE_SOFT[avatarHue(row.id)],
        )}
      >
        {masked ? "•" : initial}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-ink">{displayName}</span>
          <span className="shrink-0 rounded-full bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium tabular-nums text-ink-2 dark:bg-white/[0.07]">
            {t("access_policy.key_count", { count: row.api_key_count ?? 0 })}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-ink-3">{username}</span>
          <ExpiryTag expiresAt={row.expires_at} t={t} />
        </div>
      </div>
    </div>
  );
}

function SourceCell({
  row,
  profileById,
  t,
}: {
  row: EndUser;
  profileById: ReadonlyMap<string, ApiKeyPermissionProfile>;
  t: Translate;
}) {
  const id = row["permission-profile-id"]?.trim() ?? "";
  if (!id) {
    return (
      <span className={cn(CHIP, NEUTRAL)}>
        <SlidersHorizontal size={12} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.indigo)} />
        {t("access_policy.source_custom_short")}
      </span>
    );
  }
  const profile = profileById.get(id);
  if (!profile) {
    return (
      <HoverTooltip content={id}>
        <span className={cn(CHIP, "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
          <ShieldAlert size={12} aria-hidden="true" />
          {t("access_policy.profile_missing")}
        </span>
      </HoverTooltip>
    );
  }
  return (
    <span className={cn(CHIP, NEUTRAL, HUE_SOFT.violet)} title={profile.name}>
      <ShieldCheck size={12} aria-hidden="true" className={cn("shrink-0 text-ink-3", HUE_GLYPH.violet)} />
      <span className="truncate">{profile.name}</span>
    </span>
  );
}

function RateCell({ row, t }: { row: EndUser; t: Translate }) {
  const parts = [
    row["concurrency-limit"] ? t("access_policy.rate_short.concurrency", { value: row["concurrency-limit"] }) : null,
    row["rpm-limit"] ? t("access_policy.rate_short.rpm", { value: row["rpm-limit"].toLocaleString() }) : null,
    row["tpm-limit"]
      ? t("access_policy.rate_short.tpm", { value: formatQuotaAmount("tokens", row["tpm-limit"], { compact: true }) })
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return <span className="text-xs text-ink-4">{t("access_policy.unlimited_short")}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((part) => (
        <span key={part} className={cn("rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums", NEUTRAL)}>
          {part}
        </span>
      ))}
    </div>
  );
}

export interface EndUserColumnsParams {
  t: Translate;
  /** 相对时间（「3 天前」）用的语言。 */
  locale: string;
  can: (permission: string) => boolean;
  canWrite: boolean;
  busy: boolean;
  masked: boolean;
  profileById: ReadonlyMap<string, ApiKeyPermissionProfile>;
  /** 传入时显示多选列（批量绑定模板）。 */
  /**
   * 门户账号 id → 它名下生效中的上游冻结（后端声明 access-freezes 能力时才传）。账号状态的「已冻结」
   * 是整个账号停用，和这里按上游的冻结是两回事：前者在状态徽章上，后者是下面一枚枚「Codex 已冻结」。
   */
  accessFreezes?: ReadonlyMap<string, readonly AccessFreeze[]>;
  /** 打开某个账号的上游冻结详情；不传时没有这个入口。 */
  onViewAccessFreezes?: (user: EndUser) => void;
  onConfigureBilling?: (user: EndUser) => void;
  onViewUsage: (user: EndUser) => void;
  onManageKeys: (user: EndUser) => void;
  onEdit: (user: EndUser) => void;
  onToggleFrozen: (user: EndUser) => void;
  onResetQuota: (user: EndUser) => void;
  onViewResetHistory: (user: EndUser) => void;
  onResetPassword: (user: EndUser) => void;
  onDelete: (user: EndUser) => void;
}

/**
 * 账号列表的列：账号 · 状态（含最近登录）· 权限来源 · 额度（只列配了的格子，按用量占比排序）·
 * 模型策略 · 消费 · 速率。以前每种限额各占一列，大多数格子写着「不限制」，表格宽到 1720px；
 * 现在一行读得出「它按什么模板、哪项快用完、模型有没有被单独限住」。
 */
export function getEndUserColumns({
  t,
  locale,
  can,
  canWrite,
  busy,
  masked,
  profileById,
  accessFreezes,
  onViewAccessFreezes,
  onConfigureBilling,
  onViewUsage,
  onManageKeys,
  onEdit,
  onToggleFrozen,
  onResetQuota,
  onViewResetHistory,
  onResetPassword,
  onDelete,
}: EndUserColumnsParams): DataGridColumn<EndUser>[] {
  const columns: DataGridColumn<EndUser>[] = [];
  columns.push(
    {
      id: "account",
      header: t("end_users.username"),
      width: 240,
      minWidth: 180,
      maxWidth: 480,
      pin: "start",
      cell: (row) => <AccountCell row={row} masked={masked} t={t} />,
    },
    {
      id: "status",
      header: t("end_users.status"),
      width: GRID_WIDTH.badgeStacked,
      align: "center",
      cell: (row) => {
        const active = row.status === "active";
        const upstreamFreezes = accessFreezes?.get(row.id) ?? [];
        return (
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                active
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
              )}
            >
              {active ? t("end_users.status_active") : t("end_users.status_frozen")}
            </span>
            {onViewAccessFreezes ? (
              <AccessFreezeChips freezes={upstreamFreezes} onOpen={() => onViewAccessFreezes(row)} />
            ) : null}
            <span
              className="text-2xs text-ink-3"
              title={row.last_login_at ? new Date(row.last_login_at).toLocaleString() : undefined}
            >
              {row.last_login_at
                ? t("access_policy.last_login_at", { time: formatRelativeTime(row.last_login_at, locale) })
                : t("access_policy.never_logged_in")}
            </span>
          </div>
        );
      },
    },
    {
      id: "source",
      header: t("access_policy.col_source"),
      width: 176,
      cell: (row) => <SourceCell row={row} profileById={profileById} t={t} />,
    },
    {
      id: "quota",
      header: t("access_policy.col_quota"),
      // 额度条带多段文字，放不进语义令牌的刻度：22rem（352 设计像素），最窄 18rem。
      width: 352,
      minWidth: 288,
      overflowTooltip: false,
      cell: (row) => (
        <QuotaUsageCell
          limits={row["quota-limits"]}
          usage={row["quota-usage"]?.total}
          inFlight={row["quota-usage"]?.["in-flight"]}
        />
      ),
    },
    {
      id: "models",
      header: t("access_policy.col_model_policy"),
      width: 176,
      overflowTooltip: false,
      cell: (row) => (
        <PolicyBadges rules={row["model-rules"]} routes={row["model-routes"]} usage={row["quota-usage"]} />
      ),
    },
    {
      id: "spend",
      header: t("access_policy.col_spend"),
      width: GRID_WIDTH.numericWide,
      className: "whitespace-nowrap tabular-nums",
      cell: (row) => (
        <div className="leading-tight">
          <div className="text-xs text-ink-2">
            <span className="mr-1 text-ink-3">{t("access_policy.spend_today")}</span>
            {formatUsdAmount(row["daily-spending-used"])}
          </div>
          <div className="mt-0.5 text-xs text-ink-2">
            <span className="mr-1 text-ink-3">{t("access_policy.spend_lifetime")}</span>
            {formatUsdAmount(row["lifetime-spending-used"])}
          </div>
        </div>
      ),
    },
    {
      id: "rate",
      header: t("access_policy.col_rate"),
      width: 160,
      cell: (row) => <RateCell row={row} t={t} />,
    },
    {
      id: "actions",
      header: t("common.action"),
      ...GRID_ROW_ACTIONS_COLUMN,
      cell: (row) => {
        const resettable = hasResettableQuota(row);
        const resets = row["daily-spending-reset-count"] ?? 0;
        const upstreamFreezeCount = accessFreezes?.get(row.id)?.length ?? 0;
        return (
          <GridRowActions
            moreLabel={t("common.more_actions")}
            actions={[
              {
                key: "usage",
                label: t("end_users.view_usage"),
                icon: <BarChart3 className="h-4 w-4" />,
                onClick: () => onViewUsage(row),
              },
              {
                key: "keys",
                label: t("end_users.manage_keys"),
                icon: <Key className="h-4 w-4" />,
                visible: can("api_keys.read"),
                onClick: () => onManageKeys(row),
              },
              {
                key: "edit",
                label: t("end_users.edit"),
                icon: <Pencil className="h-4 w-4" />,
                visible: canWrite,
                onClick: () => onEdit(row),
              },
              {
                key: "status",
                label: row.status === "active" ? t("end_users.freeze") : t("end_users.activate"),
                icon:
                  row.status === "active" ? <Snowflake className="h-4 w-4" /> : <Unlock className="h-4 w-4" />,
                visible: canWrite,
                disabled: busy,
                onClick: () => onToggleFrozen(row),
              },
              {
                key: "reset-spending",
                label: resettable
                  ? t("end_users.reset_period_spending")
                  : t("end_users.reset_period_spending_disabled"),
                icon: <RotateCcw className="h-4 w-4" />,
                visible: canWrite,
                disabled: busy || !resettable,
                onClick: () => onResetQuota(row),
              },
              {
                key: "reset-history",
                label: t("access_policy.reset_history_count", { count: resets }),
                icon: <History className="h-4 w-4" />,
                unavailable: resets === 0,
                onClick: () => onViewResetHistory(row),
              },
              {
                key: "access-freezes",
                label:
                  upstreamFreezeCount > 0
                    ? t("access_freeze.row_action_active", { count: upstreamFreezeCount })
                    : t("access_freeze.row_action"),
                icon: <Lock className="h-4 w-4" />,
                visible: Boolean(onViewAccessFreezes),
                onClick: () => onViewAccessFreezes?.(row),
              },
              {
                key: "billing",
                label: t("billing_admin.configure_billing"),
                icon: <Wallet className="h-4 w-4" />,
                visible: Boolean(onConfigureBilling),
                onClick: () => onConfigureBilling?.(row),
              },
              {
                key: "reset-password",
                label: t("end_users.reset_password"),
                icon: <KeyRound className="h-4 w-4" />,
                visible: canWrite,
                onClick: () => onResetPassword(row),
              },
              {
                key: "delete",
                label: t("common.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                visible: canWrite,
                destructive: true,
                onClick: () => onDelete(row),
              },
            ]}
          />
        );
      },
    },
  );
  return columns;
}
