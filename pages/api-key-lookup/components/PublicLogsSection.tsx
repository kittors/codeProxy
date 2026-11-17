import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Reveal, useGridPreferences } from "@code-proxy/ui";
import {
  REQUEST_LOG_GRID_IDS,
  RequestLogFilterBar,
  RequestLogGrid,
  RequestLogSummary,
  buildRequestLogGridColumns,
  type RequestLogFacet,
  type RequestLogsRow,
} from "@features/request-log-viewer";
import type { PublicLogFilters } from "../hooks/usePublicLogFilters";

/**
 * 公开查询的请求日志（Key 自查页、门户「API Key 用量」页）：和控制台请求日志页同一种结构——
 * 汇总一行、独立的筛选区、铺满剩余高度的表格。没有渠道列（不对外暴露渠道身份），
 * identity="key" 时多一列 Key 名称（一个账号名下有多把 Key）。
 */
export function PublicLogsSection({
  logFilters,
  identity,
  stats,
  lastUpdatedAt,
  loading,
  error,
  onRetry,
  rows,
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  logFilters: PublicLogFilters;
  identity: "key" | "none";
  stats: { total: number; success_rate: number; total_tokens: number; total_cost: number };
  /** 这一页数据回来的时刻；null 是还没回来过。 */
  lastUpdatedAt: number | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  rows: RequestLogsRow[];
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const { filters, setFilters, options, clients } = logFilters;
  const columns = useMemo(
    () =>
      buildRequestLogGridColumns(t, {
        identity,
        hideChannel: true,
        clients,
        now: lastUpdatedAt ?? Date.now(),
        facets: {
          identity: identity === "key" ? options.identity : undefined,
          model: options.model,
          agent: options.agent,
          status: options.status,
        },
      }),
    [clients, identity, lastUpdatedAt, options, t],
  );
  const defaultHidden = useMemo(
    () => columns.filter((column) => column.defaultHidden).map((column) => column.id),
    [columns],
  );
  const prefs = useGridPreferences(REQUEST_LOG_GRID_IDS.lookup, { hidden: defaultHidden });
  const facets: RequestLogFacet[] = [
    ...(identity === "key" && options.identity.length > 1
      ? [{ columnId: "identity" as const, label: t("request_logs.col_key_name"), options: options.identity }]
      : []),
    { columnId: "model", label: t("request_logs.col_model"), options: options.model },
    ...(clients === "supported"
      ? [{ columnId: "agent" as const, label: t("request_logs.col_agent"), options: options.agent }]
      : []),
  ];
  const pending = lastUpdatedAt === null;

  return (
    // 桌面宽度由门户页钉满一屏（见 lookupLayout），这里把高度一路传给表格。
    <Reveal className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <RequestLogSummary
          pending={pending}
          stats={{
            total: stats.total,
            successRate: stats.success_rate,
            totalTokens: stats.total_tokens,
            totalCost: stats.total_cost,
          }}
        />
        {lastUpdatedAt !== null ? (
          <span className="text-xs text-ink-3">
            {loading
              ? t("request_logs.refreshing")
              : t("request_logs.updated_at", { time: new Date(lastUpdatedAt).toLocaleTimeString() })}
          </span>
        ) : null}
      </div>
      <RequestLogFilterBar
        columns={columns}
        filters={filters}
        onFiltersChange={setFilters}
        facets={facets}
        prefs={prefs}
      />
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <RequestLogGrid
          id={REQUEST_LOG_GRID_IDS.lookup}
          label={t("request_logs.table_caption")}
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={onRetry}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={() => setFilters({})}
          prefs={prefs}
          masked={false}
          hideChannel
          page={currentPage}
          pageSize={pageSize}
          total={totalCount}
          pending={pending}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          resetScrollKey={`${currentPage}|${pageSize}|${JSON.stringify(filters)}`}
        />
      </div>
    </Reveal>
  );
}
