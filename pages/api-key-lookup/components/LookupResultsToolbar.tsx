import { RefreshCw } from "lucide-react";
import { HoverTooltip, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { TimeRangeSelector } from "@features/monitor-widgets";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";

export type ApiKeyLookupTab = "usage" | "logs" | "models" | "quickImport";

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
  activeTab: ApiKeyLookupTab;
  setActiveTab: (value: ApiKeyLookupTab) => void;
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
            <TabsTrigger value="quickImport">{t("apikey_lookup.quick_import")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {activeTab === "usage" || activeTab === "logs" ? (
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <HoverTooltip content={t("common.refresh")}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || chartLoading || modelsLoading}
            aria-label={t("common.refresh")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <RefreshCw
              size={16}
              className={loading || chartLoading || modelsLoading ? "animate-spin" : ""}
            />
          </button>
        </HoverTooltip>
      </div>
    </div>
  );
}
