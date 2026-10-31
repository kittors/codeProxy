import {
  BarChart3,
  History,
  Key,
  KeyRound,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Trash2,
  Unlock,
} from "lucide-react";
import type { ApiKeyPermissionProfile, EndUser } from "@code-proxy/api-client";
import {
  COLUMN_WIDTH,
  Checkbox,
  HUES,
  HUE_GLYPH,
  HUE_SOFT,
  HoverTooltip,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  cn,
  type DataTableColumn,
  type Hue,
} from "@code-proxy/ui";
import { maskSensitiveIdentity } from "@code-proxy/domain";
import { PolicyBadges, QuotaUsageCell, formatQuotaAmount, formatUsdAmount } from "@features/access-policy";
import { hasResettableQuota } from "../endUserForm";

type Translate = (key: string, options?: Record<string, unknown>) => string;

// 表格直接放在页面上（外壳内容区 canvas），冻结列的底色跟着它走；用 surface 的话深色下是一条亮一档的竖条。
const STICKY_HEADER = "md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const STICKY_CELL = "md:sticky md:z-30 md:bg-backdrop";
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
        <div className="truncate text-xs text-ink-3">{username}</div>
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
  selection?: {
    selected: ReadonlySet<string>;
    allSelected: boolean;
    someSelected: boolean;
    onSelectAll: (checked: boolean) => void;
    onSelect: (id: string, checked: boolean) => void;
  };
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
  selection,
  onViewUsage,
  onManageKeys,
  onEdit,
  onToggleFrozen,
  onResetQuota,
  onViewResetHistory,
  onResetPassword,
  onDelete,
}: EndUserColumnsParams): DataTableColumn<EndUser>[] {
  const columns: DataTableColumn<EndUser>[] = [];
  if (selection) {
    columns.push({
      key: "select",
      label: t("access_policy.select_all_accounts"),
      width: COLUMN_WIDTH.checkbox,
      lockOrder: "start",
      headerClassName: STICKY_HEADER,
      cellClassName: STICKY_CELL,
      headerRender: () => (
        <Checkbox
          checked={selection.allSelected}
          indeterminate={selection.someSelected}
          onCheckedChange={selection.onSelectAll}
          aria-label={t("access_policy.select_all_accounts")}
        />
      ),
      render: (row) => (
        <Checkbox
          checked={selection.selected.has(row.id)}
          onCheckedChange={(checked) => selection.onSelect(row.id, checked)}
          aria-label={t("access_policy.select_account", { name: row.display_name || row.username })}
        />
      ),
    });
  }
  columns.push(
    {
      key: "account",
      label: t("end_users.username"),
      width: "w-60 min-w-[15rem]",
      minWidthPx: 180,
      maxWidthPx: 480,
      lockOrder: "start",
      headerClassName: STICKY_HEADER,
      cellClassName: cn("text-left", STICKY_CELL),
      render: (row) => <AccountCell row={row} masked={masked} t={t} />,
    },
    {
      key: "status",
      label: t("end_users.status"),
      width: COLUMN_WIDTH.badgeStacked,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row) => {
        const active = row.status === "active";
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
      key: "source",
      label: t("access_policy.col_source"),
      width: "w-44 min-w-[9rem]",
      render: (row) => <SourceCell row={row} profileById={profileById} t={t} />,
    },
    {
      key: "quota",
      label: t("access_policy.col_quota"),
      width: "w-[22rem] min-w-[18rem]",
      overflowTooltip: false,
      render: (row) => (
        <QuotaUsageCell
          limits={row["quota-limits"]}
          usage={row["quota-usage"]?.total}
          inFlight={row["quota-usage"]?.["in-flight"]}
        />
      ),
    },
    {
      key: "models",
      label: t("access_policy.col_model_policy"),
      width: "w-44 min-w-[10rem]",
      overflowTooltip: false,
      render: (row) => (
        <PolicyBadges rules={row["model-rules"]} routes={row["model-routes"]} usage={row["quota-usage"]} />
      ),
    },
    {
      key: "spend",
      label: t("access_policy.col_spend"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName: "whitespace-nowrap tabular-nums",
      render: (row) => (
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
      key: "rate",
      label: t("access_policy.col_rate"),
      width: "w-40 min-w-[8rem]",
      render: (row) => <RateCell row={row} t={t} />,
    },
    {
      key: "actions",
      label: t("common.action"),
      ...TABLE_ROW_ACTIONS_COLUMN,
      lockOrder: "end",
      headerClassName: cn("text-center", STICKY_HEADER),
      cellClassName: STICKY_CELL,
      render: (row) => {
        const resettable = hasResettableQuota(row);
        const resets = row["daily-spending-reset-count"] ?? 0;
        return (
          <TableRowActions
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
                visible: resets > 0,
                onClick: () => onViewResetHistory(row),
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
