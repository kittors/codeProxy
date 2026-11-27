import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AuthFileItem } from "@code-proxy/api-client";
import { VendorIcon } from "@code-proxy/assets";
import {
  authFilesSortCollator,
  maskSensitiveIdentity,
  resolveAuthFileDisplayName,
  resolveAuthFileDisplayTags,
  resolveAuthFilePlanType,
  resolveAuthFileSortKey,
  resolveFileType,
} from "@code-proxy/domain";
import {
  Callout,
  Card,
  DataGrid,
  GRID_WIDTH,
  ProviderTag,
  Tabs,
  TabsList,
  TabsTrigger,
  type DataGridColumn,
} from "@code-proxy/ui";
import { AuthFilePlanBadge } from "./AuthFilePlanBadge";

export type AuthFilesScope = "own" | "shared";

/**
 * 非系统租户在 AI 账号页顶部的切换：本租户自己的账号 / 平台共享给本租户的账号。只有确实有共享
 * 账号时才出现，所以没有共享的租户、旧后端上页面和以前一模一样。
 */
export function AuthFilesScopeTabs({
  value,
  onChange,
  ownCount,
  sharedCount,
}: {
  value: AuthFilesScope;
  onChange: (value: AuthFilesScope) => void;
  ownCount: number;
  sharedCount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex shrink-0">
      <Tabs value={value} onValueChange={(next) => onChange(next as AuthFilesScope)}>
        <TabsList aria-label={t("auth_files.scope_label")}>
          <TabsTrigger value="own">{t("auth_files.scope_own", { count: ownCount })}</TabsTrigger>
          <TabsTrigger value="shared">
            {t("auth_files.scope_shared", { count: sharedCount })}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

const STATUS_CLASS = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  neutral: "bg-sn-label/[0.05] text-sn-label2 dark:bg-white/[0.07]",
} as const;

/**
 * 平台共享给本租户的 AI 账号，只读。
 *
 * 后端只下发识别账号、读健康状态所需的摘要（没有文件路径、令牌），所以这里没有编辑、删除、
 * 下载、刷新、测试等任何操作：凭据只有一份、由平台管理员维护，额度与冷却全平台共用，
 * 本租户请求产生的用量计入本租户。
 */
export function SharedAuthFilesPanel({
  files,
  masked,
  renderRestrictionBadges,
  renderSubscriptionBadge,
}: {
  files: readonly AuthFileItem[];
  masked: boolean;
  renderRestrictionBadges: (file: AuthFileItem) => ReactNode | null;
  renderSubscriptionBadge: (file: AuthFileItem) => ReactNode | null;
}) {
  const { t } = useTranslation();
  const rows = useMemo(
    () =>
      [...files].sort((a, b) =>
        authFilesSortCollator.compare(resolveAuthFileSortKey(a), resolveAuthFileSortKey(b)),
      ),
    [files],
  );

  const columns = useMemo<DataGridColumn<AuthFileItem>[]>(() => {
    const mask = (value: string) => (masked ? maskSensitiveIdentity(value) : value);
    const renderStatus = (file: AuthFileItem) => {
      if (file.disabled === true) {
        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${STATUS_CLASS.neutral}`}
          >
            {t("auth_files.shared_status_disabled")}
          </span>
        );
      }
      // 限流 / 鉴权失败 / 冷却等与本租户自己的账号同一套徽标（悬停有原因和恢复时间）。
      const restrictions = renderRestrictionBadges(file);
      if (restrictions) return restrictions;
      if (file.unavailable === true) {
        return (
          <span
            title={typeof file.status_message === "string" ? file.status_message : undefined}
            className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${STATUS_CLASS.warning}`}
          >
            {t("auth_files.shared_status_unavailable")}
          </span>
        );
      }
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${STATUS_CLASS.ok}`}
        >
          {t("auth_files.shared_status_ok")}
        </span>
      );
    };

    return [
      {
        id: "account",
        header: t("auth_files.shared_col_account"),
        width: GRID_WIDTH.nameStacked,
        grow: true,
        cell: (file) => {
          const typeKey = resolveFileType(file);
          const title = resolveAuthFileDisplayName(file) || file.name;
          const email = typeof file.email === "string" ? file.email.trim() : "";
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0" aria-hidden="true">
                <VendorIcon modelId={typeKey} size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-sn-label">{mask(title)}</p>
                {email && email !== title ? (
                  <p className="truncate text-xs text-sn-label3">{mask(email)}</p>
                ) : null}
              </div>
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
          // 共享摘要里没有令牌，Codex 以外的套餐只能读后端给的 plan_type。
          const rawPlan =
            typeof file.plan_type === "string" ? file.plan_type.trim().toLowerCase() : "";
          const planType = resolveAuthFilePlanType(file, null) ?? (rawPlan || null);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <ProviderTag vendor={typeKey} withLogo className="h-5">
                {typeKey}
              </ProviderTag>
              {planType ? (
                <AuthFilePlanBadge provider={typeKey} planType={planType} className="h-5" />
              ) : null}
            </div>
          );
        },
      },
      {
        id: "status",
        header: t("auth_files.shared_col_status"),
        width: GRID_WIDTH.composite,
        cell: renderStatus,
      },
      {
        id: "subscription",
        header: t("auth_files.col_subscription"),
        width: GRID_WIDTH.metric,
        cell: (file) =>
          renderSubscriptionBadge(file) ?? <span className="text-xs text-sn-label3">--</span>,
      },
      {
        id: "concurrency",
        header: t("auth_files.shared_col_concurrency"),
        width: GRID_WIDTH.numericWide,
        cell: (file) => {
          const limit = Number(file.concurrency_limit);
          return (
            <span className="text-xs tabular-nums text-sn-label2">
              {Number.isFinite(limit) && limit > 0
                ? limit
                : t("auth_files.shared_concurrency_unlimited")}
            </span>
          );
        },
      },
      {
        id: "tags",
        header: t("auth_files.shared_col_tags"),
        width: GRID_WIDTH.badgeGroup,
        cell: (file) => {
          const tags = resolveAuthFileDisplayTags(file);
          if (tags.length === 0) return <span className="text-xs text-sn-label3">--</span>;
          return (
            <div className="flex min-w-0 flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex max-w-full items-center truncate rounded-full bg-sn-label/[0.05] px-2 py-0.5 text-2xs font-semibold text-sn-label2 dark:bg-white/[0.07] colorful:bg-sky-50 colorful:text-sky-700 colorful:dark:bg-sky-500/15 colorful:dark:text-sky-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          );
        },
      },
    ];
  }, [masked, renderRestrictionBadges, renderSubscriptionBadge, t]);

  return (
    // 和「本租户账号」同为页面级分区（flat），页面里只保留表格这一层。
    <Card
      flat
      className="md:flex md:min-h-0 md:flex-1 md:flex-col"
      bodyClassName="flex flex-col gap-4 md:min-h-0 md:flex-1"
    >
      <Callout tone="info" title={t("auth_files.shared_view_title")}>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>{t("auth_files.shared_view_point_maintained")}</li>
          <li>{t("auth_files.shared_view_point_quota")}</li>
          <li>{t("auth_files.shared_view_point_usage")}</li>
        </ul>
      </Callout>
      {/* 桌面宽度由分区钉住，表格铺满剩余高度；窄屏随页面流动、按行收高。 */}
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataGrid<AuthFileItem>
          id="auth-files-shared"
          label={t("auth_files.shared_table_caption")}
          fill
          rows={rows}
          columns={columns}
          rowKey={(file) => file.name}
          empty={{ title: t("auth_files.shared_empty") }}
        />
      </div>
    </Card>
  );
}
