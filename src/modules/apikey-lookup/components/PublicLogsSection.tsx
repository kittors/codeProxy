import { useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter } from "lucide-react";
import { Card } from "@/modules/ui/Card";
import { Reveal } from "@/modules/ui/Reveal";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
import { TableCellOverflowTooltip } from "@/modules/ui/TableCellOverflowTooltip";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import type { LogRow, TableColumn } from "@/modules/apikey-lookup/types";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  return date.toLocaleString();
}

export function buildLogColumns(
  t: (key: string, options?: Record<string, unknown>) => string,
  onContentClick?: (logId: number, tab: "input" | "output") => void,
): TableColumn<LogRow>[] {
  return [
    {
      key: "timestamp",
      label: t("request_logs.col_time"),
      width: "w-52",
      cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={formatTimestamp(row.timestamp)} className="block min-w-0">
          <span className="block min-w-0 truncate">{formatTimestamp(row.timestamp)}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "model",
      label: t("request_logs.col_model"),
      width: "w-56",
      render: (row) => (
        <OverflowTooltip content={row.model} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.model}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "status",
      label: t("request_logs.col_status"),
      width: "w-20",
      render: (row) =>
        row.failed ? (
          <span className="inline-flex min-w-[52px] justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            {t("request_logs.status_failed")}
          </span>
        ) : (
          <span className="inline-flex min-w-[52px] justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            {t("request_logs.status_success")}
          </span>
        ),
    },
    {
      key: "latency",
      label: t("request_logs.col_duration"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={row.latencyText} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.latencyText}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "inputTokens",
      label: t("request_logs.col_input"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "input")}
            className="ml-auto inline-block cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-sky-50 dark:hover:bg-sky-950/30"
            title={t("apikey_lookup.view_input")}
          >
            <span className="truncate text-sky-600 underline decoration-sky-300/50 underline-offset-2 dark:text-sky-400 dark:decoration-sky-500/40">
              {row.inputTokens.toLocaleString()}
            </span>
          </button>
        ) : (
          <span>{row.inputTokens.toLocaleString()}</span>
        ),
    },
    {
      key: "cachedTokens",
      label: t("request_logs.col_cache_read"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums",
      render: (row) => (
        <span
          className={`block min-w-0 truncate ${row.cachedTokens > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-white/30"}`}
        >
          {row.cachedTokens > 0 ? row.cachedTokens.toLocaleString() : "0"}
        </span>
      ),
    },
    {
      key: "outputTokens",
      label: t("request_logs.col_output"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "output")}
            className="ml-auto inline-block cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            title={t("apikey_lookup.view_output")}
          >
            <span className="truncate text-emerald-600 underline decoration-emerald-300/50 underline-offset-2 dark:text-emerald-400 dark:decoration-emerald-500/40">
              {row.outputTokens.toLocaleString()}
            </span>
          </button>
        ) : (
          <span>{row.outputTokens.toLocaleString()}</span>
        ),
    },
    {
      key: "totalTokens",
      label: t("request_logs.col_total_token"),
      width: "w-28",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
      render: (row) => <span>{row.totalTokens.toLocaleString()}</span>,
    },
    {
      key: "cost",
      label: t("request_logs.col_cost"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400",
      render: (row) => <span>${row.cost.toFixed(4)}</span>,
    },
  ];
}

function PaginationBar({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  t,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const rangeStart = Math.max(2, currentPage - 1);
      const rangeEnd = Math.min(totalPages - 1, currentPage + 1);
      for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  const btnBase =
    "inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";
  const btnNormal = `${btnBase} text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10`;
  const btnActive = `${btnBase} bg-slate-900 text-white dark:bg-white dark:text-neutral-950`;

  return (
    <div className="flex flex-shrink-0 flex-col gap-2 border-t border-slate-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 dark:border-neutral-800/60">
      <span className="whitespace-nowrap text-xs text-slate-500 dark:text-white/50 tabular-nums">
        {t("request_logs.page_info", { start, end, total: totalCount })}
      </span>

      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          aria-label={t("request_logs.first_page")}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label={t("request_logs.prev_page")}
        >
          <ChevronLeft size={14} />
        </button>
        {pageNumbers.map((page, index) =>
          page === "..." ? (
            <span key={`dots-${index}`} className="px-1 text-xs text-slate-400 dark:text-white/30">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              className={page === currentPage ? btnActive : btnNormal}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ),
        )}
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label={t("request_logs.next_page")}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label={t("request_logs.last_page")}
        >
          <ChevronsRight size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="whitespace-nowrap text-xs text-slate-500 dark:text-white/50">
          {t("request_logs.rows_per_page")}
        </span>
        <Select
          value={String(pageSize)}
          onChange={(value) => onPageSizeChange(Number(value))}
          options={[20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))}
          name="pageSize"
          className="w-auto"
        />
      </div>
    </div>
  );
}

export function PublicLogsSection({
  t,
  statusFilter,
  setStatusFilter,
  statusOptions,
  modelOptions,
  modelQuery,
  setModelQuery,
  modelFilterOptions,
  stats,
  lastUpdatedText,
  loading,
  logColumns,
  rows,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  statusOptions: Array<{ value: string; label: string; searchText: string }>;
  modelOptions: string[];
  modelQuery: string;
  setModelQuery: (value: string) => void;
  modelFilterOptions: Array<{ value: string; label: string; searchText: string }>;
  stats: { total: number; success_rate: number; total_tokens: number; total_cost: number };
  lastUpdatedText: string;
  loading: boolean;
  logColumns: TableColumn<LogRow>[];
  rows: LogRow[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <Reveal>
      <Card padding="none" className="overflow-hidden" bodyClassName="mt-0">
        <div className="border-b border-slate-100 px-3 py-3 sm:px-5 dark:border-neutral-800/60">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                placeholder={t("apikey_lookup.all_status")}
                aria-label={t("apikey_lookup.status_filter")}
                className="w-full sm:w-auto"
              />
              {modelOptions.length > 0 ? (
                <SearchableSelect
                  value={modelQuery}
                  onChange={setModelQuery}
                  options={modelFilterOptions}
                  placeholder={t("request_logs.all_models_placeholder")}
                  aria-label={t("apikey_lookup.model_filter")}
                  className="w-full sm:w-auto"
                />
              ) : null}
            </div>

            <div className="hidden sm:block sm:flex-1" />

            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-white/55 sm:flex sm:items-center sm:gap-1.5">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Filter size={12} aria-hidden="true" />
                <span className="font-mono tabular-nums">
                  {t("request_logs.records_count", { count: stats.total })}
                </span>
              </span>
              <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap sm:justify-start">
                {t("common.success_rate")}
                <span className="font-mono tabular-nums">{stats.success_rate.toFixed(1)}%</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-slate-300 dark:text-white/10" aria-hidden="true">
                  ·
                </span>
                {t("apikey_lookup.token")}
                <span className="font-mono tabular-nums">
                  {stats.total_tokens.toLocaleString()}
                </span>
              </span>
              {lastUpdatedText ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-slate-300 dark:text-white/10" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-400 dark:text-white/40">
                    {t("request_logs.updated_at", { time: lastUpdatedText })}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative h-[calc(100vh-500px)] min-h-[300px] overflow-hidden px-3 sm:px-5">
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{t("request_logs.table_caption")}</caption>
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                  {logColumns.map((col, index) => (
                    <th
                      key={col.key}
                      className={`whitespace-nowrap bg-slate-100 px-4 py-3 dark:bg-neutral-800 ${col.width ?? ""} ${col.headerClassName ?? ""} ${index === 0 ? "first:rounded-l-xl" : ""} ${index === logColumns.length - 1 ? "last:rounded-r-xl" : ""}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-slate-900 dark:text-white">
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={logColumns.length}
                      className="px-4 py-12 text-center text-sm text-slate-600 dark:text-white/70"
                    >
                      {t("request_logs.no_data")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIndex) => (
                    <tr
                      key={row.id}
                      className="text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      style={{ height: 44 }}
                    >
                      {logColumns.map((col, colIndex) => (
                        <td
                          key={col.key}
                          className={`px-4 py-2.5 align-middle ${col.cellClassName ?? ""} ${colIndex === 0 ? "first:rounded-l-lg" : ""} ${colIndex === logColumns.length - 1 ? "last:rounded-r-lg" : ""}`}
                        >
                          <TableCellOverflowTooltip className={col.cellClassName}>
                            {col.render(row, rowIndex)}
                          </TableCellOverflowTooltip>
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
                <span
                  className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80"
                  aria-hidden="true"
                />
                <span role="status">{t("common.loading_ellipsis")}</span>
              </div>
            </div>
          ) : null}
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          t={t}
        />
      </Card>
    </Reveal>
  );
}
