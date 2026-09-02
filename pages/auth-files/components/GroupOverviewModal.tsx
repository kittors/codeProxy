import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button, surface } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { EChart } from "@code-proxy/ui";
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
      maxWidth="max-w-5xl"
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
            <span className="inline-flex h-9 items-center rounded-2xl border border-slate-900/8 bg-slate-50 px-3 text-sm font-medium text-slate-700 dark:border-white/8 dark:bg-neutral-900/60 dark:text-white/75">
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
          <div className={[surface({ tone: "raised", radius: "2xl" }), "px-4 py-3"].join(" ")}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {activeGroupTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {activeGroupRows.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_file_count")}
            </p>
          </div>
          <div className={[surface({ tone: "raised", radius: "2xl" }), "px-4 py-3"].join(" ")}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_total_calls_label")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {activeGroupOverview.totalCalls.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_total_calls_help")}
            </p>
          </div>
          <div className={[surface({ tone: "raised", radius: "2xl" }), "px-4 py-3"].join(" ")}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {(activeGroupOverview.weeklyFamilies?.length ?? 0) > 1
                ? t("auth_files.group_overview_weekly_limits_label")
                : t("auth_files.group_overview_avg_week_label")}
            </p>
            {(activeGroupOverview.weeklyFamilies?.length ?? 0) > 1 ? (
              <div className="mt-2 space-y-1.5">
                {activeGroupOverview.weeklyFamilies.map((family) => (
                  <div key={family.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-slate-500 dark:text-white/55">
                      {family.label}
                    </span>
                    <span className="shrink-0 text-lg font-semibold text-slate-900 dark:text-white">
                      {formatAveragePercent(family.remainingPercent)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                {formatAveragePercent(activeGroupOverview.weeklyFamilies[0]?.remainingPercent ?? activeGroupOverview.averageWeekly)}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {(activeGroupOverview.weeklyFamilies?.length ?? 0) > 1
                ? t("auth_files.group_overview_weekly_limits_help")
                : t("auth_files.group_overview_avg_week_help")}
            </p>
          </div>
          <div className={[surface({ tone: "raised", radius: "2xl" }), "px-4 py-3"].join(" ")}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_sample_count", {
                count: activeGroupOverview.quotaSampleCount,
              })}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {activeGroupOverview.quotaSampleCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {activeGroupOverview.quotaSampleCount > 0
                ? t("auth_files.group_overview_quota_ready")
                : t("auth_files.group_overview_no_quota")}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {activeGroupRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-white/50">
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
