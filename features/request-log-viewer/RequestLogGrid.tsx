import {
  Button,
  DataGrid,
  DataGridPagination,
  listGridFilterChips,
  type DataGridColumn,
  type GridEmptyState,
  type GridFilters,
  type UseGridPreferencesResult,
} from "@code-proxy/ui";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RequestLogDetailPanel } from "./RequestLogDetailPanel";
import type { RequestLogsRow } from "./requestLogsRow";

export const REQUEST_LOG_PAGE_SIZES = [20, 50, 100] as const;

/**
 * 请求日志三处表格的偏好 id（列宽、列顺序、显隐、密度都按它存）。
 * 带「.v3」：升级至完整 Satin 原生表格布局与默认一屏零横滚列宽；旧版缓存的列宽若带入，会把
 * 1440px 表格撑出横向滚动并导致右侧冻结列压切耗时列；递增版本号让三处都干净回到新默认布局。
 */
export const REQUEST_LOG_GRID_IDS = {
  page: "request-logs.v3",
  lookup: "apikey-lookup-request-logs.v3",
  keyUsage: "api-key-usage-logs.v3",
} as const;

/**
 * 请求日志表格（管理端整页、Key 用量弹窗、公开查询共用）：DataGrid + 行展开详情 + 分页。
 *
 * 三种空状态都铺满表体、和有数据时同高：完全没有数据 / 当前筛选下没有结果（列出生效的条件，
 * 给「清除筛选」）/ 加载失败（给「重试」）。加载、翻页时表格只在表头下沿出一条进度条、行变淡，
 * 框、分页、横向滚动条都不动。
 */
export function RequestLogGrid({
  id,
  label,
  columns,
  rows,
  loading,
  error,
  onRetry,
  filters,
  onFiltersChange,
  extraFilterLabels = [],
  onClearFilters,
  prefs,
  masked,
  hideChannel,
  onOpenContent,
  onOpenError,
  page,
  pageSize,
  total,
  pending,
  onPageChange,
  onPageSizeChange,
  fill = true,
  frame = true,
  maxHeight,
  resetScrollKey,
  noDataTitle,
}: {
  id: string;
  label: string;
  columns: DataGridColumn<RequestLogsRow>[];
  rows: readonly RequestLogsRow[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  filters: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;
  /** 不在列上的条件（循环保护）也要写进「无匹配」的条件列表。 */
  extraFilterLabels?: readonly string[];
  onClearFilters: () => void;
  prefs: UseGridPreferencesResult;
  masked: boolean;
  hideChannel?: boolean;
  onOpenContent?: (row: RequestLogsRow, side: "input" | "output") => void;
  onOpenError?: (row: RequestLogsRow) => void;
  page: number;
  pageSize: number;
  total: number;
  pending: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  fill?: boolean;
  frame?: boolean;
  maxHeight?: string;
  resetScrollKey?: string;
  /** 「完全没有数据」时的标题；默认「还没有请求日志」，只看一把 Key 时写「没有用量记录」之类。 */
  noDataTitle?: string;
}) {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const activeLabels = [
    ...listGridFilterChips(columns, filters, t).map((chip) => chip.label),
    ...extraFilterLabels,
  ];
  const hasFilters = activeLabels.length > 0;
  const empty: GridEmptyState = hasFilters
    ? {
        scene: "search",
        title: t("request_logs.no_match_title"),
        description: t("request_logs.no_match_desc"),
        details: (
          <ul
            className="flex flex-wrap justify-center gap-1.5"
            aria-label={t("request_logs.active_filters")}
          >
            {activeLabels.map((text) => (
              <li key={text} className="sn-chip sn-tag !h-6 !px-2.5 !text-xs">
                {text}
              </li>
            ))}
          </ul>
        ),
        action: (
          <Button size="sm" onClick={onClearFilters}>
            {t("request_logs.clear_filters")}
          </Button>
        ),
      }
    : {
        scene: "inbox",
        title: noDataTitle ?? t("request_logs.no_data_title"),
        description: t("request_logs.no_data_hint"),
      };
  const footer: ReactNode = (
    <DataGridPagination
      page={page}
      pageSize={pageSize}
      total={total}
      pending={pending}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={REQUEST_LOG_PAGE_SIZES}
    />
  );
  return (
    <DataGrid
      id={id}
      label={label}
      fill={fill}
      fitColumns
      frame={frame}
      maxHeight={maxHeight}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={empty}
      density={prefs.density}
      lines={prefs.lines}
      hiddenColumnIds={prefs.hiddenColumnIds}
      onHiddenColumnIdsChange={prefs.setHiddenColumnIds}
      filters={filters}
      onFiltersChange={onFiltersChange}
      renderExpanded={(row) => (
        <RequestLogDetailPanel
          row={row}
          masked={masked}
          hideChannel={hideChannel}
          onOpenContent={onOpenContent}
          onOpenError={onOpenError}
        />
      )}
      expandedKeys={expandedKeys}
      onExpandedKeysChange={setExpandedKeys}
      resetScrollKey={resetScrollKey}
      footer={footer}
    />
  );
}
