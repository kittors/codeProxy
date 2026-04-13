import { RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { TimeRangeSelector } from "@/modules/monitor/MonitorPagePieces";
import type { TimeRange } from "@/modules/monitor/monitor-constants";

export function LookupResultsToolbar({
  t,
  activeTab,
  setActiveTab,
  timeRange,
  setTimeRange,
  handleRefresh,
  loading,
  chartLoading,
  modelsLoading,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  activeTab: "usage" | "logs" | "models";
  setActiveTab: (value: "usage" | "logs" | "models") => void;
  timeRange: TimeRange;
  setTimeRange: (value: TimeRange) => void;
  handleRefresh: () => void;
  loading: boolean;
  chartLoading: boolean;
  modelsLoading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="usage">{t("apikey_lookup.usage_stats")}</TabsTrigger>
            <TabsTrigger value="logs">{t("apikey_lookup.request_logs")}</TabsTrigger>
            <TabsTrigger value="models">{t("apikey_lookup.available_models")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {activeTab !== "models" ? (
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || chartLoading || modelsLoading}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
        >
          <RefreshCw
            size={13}
            className={loading || chartLoading || modelsLoading ? "animate-spin" : ""}
          />
          {t("common.refresh")}
        </button>
      </div>
    </div>
  );
}
