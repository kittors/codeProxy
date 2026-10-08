import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, BarChart3, CalendarRange, FileStack, Gauge, LineChart, RefreshCw } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { EChart } from "@code-proxy/ui";

/**
 * 四格指标：无边淡底 + 线性图标 + 墨色数值。弹窗本身是一层，指标格只用一层淡底分组；图标不再按
 * 指标垫身份色底块（文件橙、调用蓝、周限粉、样本绿），颜色只留给下面趋势图里的数据。
 */
function StatCard({
  icon,
  label,
  value,
  help,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  help: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-subtle px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="shrink-0 text-ink-3 [&_svg.lucide]:size-[16px]">
          {icon}
        </span>
        <p className="min-w-0 truncate text-xs font-medium text-ink-3">{label}</p>
      </div>
      <div className="mt-2.5 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</div>
      <p className="mt-1 text-xs leading-5 text-ink-3">{help}</p>
    </div>
  );
}
import type { AuthFilesGroupOverviewRow } from "@code-proxy/domain";
import type { GroupOverviewSummary } from "../hooks/groupOverviewWeekly";

interface GroupOverviewModalProps {
  open: boolean;
  onClose: () => void;
  groupOverviewTab: string;
  setGroupOverviewTab: (value: string) => void;
  groupOverviewTabs: string[];
  resolveProviderLabel: (providerKey: string) => string;
  groupOverviewLoading: boolean;
  groupTrendLoading: boolean;
  refreshGroupOverview: (targetGroup?: string) => Promise<void>;
  refreshGroupTrend: (targetGroup?: string) => Promise<void>;
  activeGroupTitle: string;
  activeGroupRows: AuthFilesGroupOverviewRow[];
  activeGroupOverview: GroupOverviewSummary;
  formatAveragePercent: (value: number | null) => string;
  groupOverviewChartOption: Record<string, unknown>;
}

export function GroupOverviewModal({
  open,
  onClose,
  groupOverviewTab,
  setGroupOverviewTab,
  groupOverviewTabs,
  resolveProviderLabel,
  groupOverviewLoading,
  groupTrendLoading,
  refreshGroupOverview,
  refreshGroupTrend,
  activeGroupTitle,
  activeGroupRows,
  activeGroupOverview,
  formatAveragePercent,
  groupOverviewChartOption,
}: GroupOverviewModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("auth_files.group_overview_modal_title")}
      description={t("auth_files.group_overview_modal_desc")}
      icon={<BarChart3 />}
      size="xl"
      bodyHeightClassName="max-h-[68vh]"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("auth_files.close")}
        </Button>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={groupOverviewTab} onValueChange={setGroupOverviewTab}>
            <TabsList>
              {groupOverviewTabs.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {/* 供应商页签带上厂商 logo，与文件列表的供应商筛选一致，按品牌色一眼认出是谁家。 */}
                  {key === "all" ? null : <VendorIcon modelId={key} size={14} />}
                  {key === "all"
                    ? t("auth_files.group_overview_current_results")
                    : resolveProviderLabel(key)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-hover px-3.5 text-sm font-medium text-ink-2">
              <CalendarRange size={14} aria-hidden="true" className="text-ink-3" />
              {t("auth_files.group_overview_fixed_7_days")}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void refreshGroupOverview(groupOverviewTab);
                void refreshGroupTrend(groupOverviewTab);
              }}
              disabled={groupOverviewLoading || groupTrendLoading}
            >
              <RefreshCw
                size={14}
                className={groupOverviewLoading || groupTrendLoading ? "animate-spin" : ""}
              />
              {t("auth_files.refresh")}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<FileStack />}
            label={activeGroupTitle}
            value={activeGroupRows.length}
            help={t("auth_files.group_overview_file_count")}
          />
          <StatCard
            icon={<Activity />}
            label={t("auth_files.group_overview_total_calls_label")}
            value={activeGroupOverview.totalCalls.toLocaleString()}
            help={t("auth_files.group_overview_total_calls_help")}
          />
          <StatCard
            icon={<Gauge />}
            label={
              (activeGroupOverview.weeklyFamilies?.length ?? 0) > 1
                ? t("auth_files.group_overview_weekly_limits_label")
                : t("auth_files.group_overview_avg_week_label")
            }
            value={
              (activeGroupOverview.weeklyFamilies?.length ?? 0) > 1 ? (
                <div className="space-y-1">
                  {activeGroupOverview.weeklyFamilies.map((family) => (
                    <div key={family.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-xs font-normal text-ink-3">
                        {family.label}
                      </span>
                      <span className="shrink-0 text-lg">
                        {formatAveragePercent(family.remainingPercent)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                formatAveragePercent(
                  activeGroupOverview.weeklyFamilies[0]?.remainingPercent ??
                    activeGroupOverview.averageWeekly,
                )
              )
            }
            help={
              (activeGroupOverview.weeklyFamilies?.length ?? 0) > 1
                ? t("auth_files.group_overview_weekly_limits_help")
                : t("auth_files.group_overview_avg_week_help")
            }
          />
          <StatCard
            icon={<LineChart />}
            label={t("auth_files.group_overview_sample_count", {
              count: activeGroupOverview.quotaSampleCount,
            })}
            value={activeGroupOverview.quotaSampleCount}
            help={
              activeGroupOverview.quotaSampleCount > 0
                ? t("auth_files.group_overview_quota_ready")
                : t("auth_files.group_overview_no_quota")
            }
          />
        </div>

        <div className="min-h-0 flex-1">
          {activeGroupRows.length === 0 ? (
            <div className="grid place-items-center rounded-2xl bg-subtle px-4 py-12 text-center text-sm text-ink-3">
              <BarChart3 size={20} className="mb-2 text-ink-4" aria-hidden="true" />
              {t("auth_files.group_overview_empty")}
            </div>
          ) : (
            <EChart option={groupOverviewChartOption} className="h-[320px] sm:h-[360px]" />
          )}
        </div>
      </div>
    </Modal>
  );
}
