import { ChartSpline, Filter, RefreshCw, Search } from "lucide-react";
import { TextInput } from "@/modules/ui/Input";
import { TimeRangeSelector } from "@/modules/monitor/MonitorPagePieces";
import type { TimeRange } from "@/modules/monitor/monitor-constants";

export function MonitorToolbarSection({
  t,
  timeRange,
  setTimeRange,
  apiFilterInput,
  setApiFilterInput,
  applyFilter,
  refreshData,
  isLoading,
  error,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  timeRange: TimeRange;
  setTimeRange: (value: TimeRange) => void;
  apiFilterInput: string;
  setApiFilterInput: (value: string) => void;
  applyFilter: () => void;
  refreshData: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <ChartSpline size={18} className="text-slate-900 dark:text-white" />
            <span>{t("monitor.title")}</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <TextInput
            value={apiFilterInput}
            onChange={(event) => setApiFilterInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilter();
              }
            }}
            startAdornment={<Search size={14} className="text-[#71717A] dark:text-[#A1A1AA]" />}
            className="w-44"
            placeholder={t("monitor.filter_placeholder")}
          />
          <button
            type="button"
            onClick={applyFilter}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
          >
            <Filter size={14} />
            {t("monitor.apply")}
          </button>
          <button
            type="button"
            onClick={refreshData}
            disabled={isLoading}
            aria-busy={isLoading}
            className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span className="grid">
              <span
                className={
                  isLoading
                    ? "col-start-1 row-start-1 opacity-0"
                    : "col-start-1 row-start-1 opacity-100"
                }
              >
                {t("monitor.refresh")}
              </span>
              <span
                className={
                  isLoading
                    ? "col-start-1 row-start-1 opacity-100"
                    : "col-start-1 row-start-1 opacity-0"
                }
              >
                {t("monitor.refreshing")}
              </span>
            </span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}
