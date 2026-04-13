import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { EChart } from "@/modules/ui/charts/EChart";
import type {
  AuthFilesGroupOverview,
  AuthFilesGroupOverviewRow,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

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
  activeGroupOverview: AuthFilesGroupOverview;
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
            <span className="inline-flex h-9 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/75">
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
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {activeGroupTitle}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {activeGroupRows.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_file_count")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_total_calls_label")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {activeGroupOverview.totalCalls.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_total_calls_help")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_avg_week_label")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              {formatAveragePercent(activeGroupOverview.averageWeekly)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              {t("auth_files.group_overview_avg_week_help")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/45">
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
