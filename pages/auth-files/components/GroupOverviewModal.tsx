import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, BarChart3, CalendarRange, FileStack, Gauge, LineChart, RefreshCw } from "lucide-react";
import { Button, surface } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { EChart } from "@code-proxy/ui";

// 四张指标卡各用一个固定的身份色（与仪表盘 / 系统监控一致）：数量蓝、调用绿、额度紫、样本琥珀。
const STAT_TONE = {
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
} as const;

function StatCard({
  icon,
  tone,
  label,
  value,
  help,
}: {
  icon: ReactNode;
  tone: keyof typeof STAT_TONE;
  label: ReactNode;
  value: ReactNode;
  help: ReactNode;
}) {
  return (
    <div className={[surface({ tone: "raised", radius: "2xl" }), "flex flex-col px-4 py-3.5"].join(" ")}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={[
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg [&_svg.lucide]:size-[15px]",
            STAT_TONE[tone],
          ].join(" ")}
        >
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
                  {key === "all"
                    ? t("auth_files.group_overview_current_results")
                    : resolveProviderLabel(key)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-hover px-3.5 text-sm font-medium text-ink-2">
              <CalendarRange size={14} aria-hidden="true" />
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
            tone="sky"
            label={activeGroupTitle}
            value={activeGroupRows.length}
            help={t("auth_files.group_overview_file_count")}
          />
          <StatCard
            icon={<Activity />}
            tone="emerald"
            label={t("auth_files.group_overview_total_calls_label")}
            value={activeGroupOverview.totalCalls.toLocaleString()}
            help={t("auth_files.group_overview_total_calls_help")}
          />
          <StatCard
            icon={<Gauge />}
            tone="violet"
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
            tone="amber"
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
            <div className="grid place-items-center rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-ink-3">
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
