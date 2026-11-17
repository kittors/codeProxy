import {
  Button,
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  GridFacetFilter,
  GridFilterChips,
  GridSearchInput,
  GridViewMenu,
  applyGridFilters,
  formatInteger,
  iconHueClass,
  paginateRows,
  setGridFilter,
  sortGridRows,
  toast,
  useGridPreferences,
  type GridFilters,
  type GridSort,
} from "@code-proxy/ui";
import { Download, RefreshCw, ScrollText, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LabDetailPanel } from "./LabDetailPanel";
import { LabSummaryStrip, Segmented, StatusTabs, type StatusTab } from "./LabHeader";
import { buildLabColumns, buildLabFilterOptions } from "./labColumns";
import {
  generateLabLogs,
  summarizeLabLogs,
  type LabLogRow,
  type LabStatus,
  type LabSummary,
} from "./labData";

/**
 * 演示页的请求日志部分（计划 104）：用一份本地生成的请求日志，把筛选区、表头菜单、
 * 固定列、拖宽、展开、吞吐、分页、加载 / 空 / 错误态都摆出来给人看。多选不在这里（见 ApiKeySelectionDemo）。
 *
 * 只在开发环境注册（见 route.tsx），不连后端：排序、筛选、翻页在本地算，
 * 但故意延迟 380ms 再出结果，模拟服务端分页时的加载过程（进度条、行变淡、依次浮入）。
 */

type DemoState = "live" | "loading" | "empty" | "error";
type TimeRange = 1 | 7 | 14 | 30;

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const FIRST_LOAD_MS = 900;
const QUERY_MS = 380;
const STATUS_VALUES: readonly LabStatus[] = ["success", "failed", "retried", "cancelled"];

function matchesSearch(row: LabLogRow, query: string): boolean {
  if (!query) return true;
  const haystack = `${row.id} ${row.user.name} ${row.user.key} ${row.model} ${row.upstreamModel} ${row.channel.name}`;
  return haystack.toLocaleLowerCase().includes(query);
}

export function RequestLogsDemo() {
  const now = useMemo(() => Date.now(), []);
  const allRows = useMemo(() => generateLabLogs(1354, now), [now]);
  const [demoState, setDemoState] = useState<DemoState>("live");
  const [timeRange, setTimeRange] = useState<TimeRange>(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filters, setFilters] = useState<GridFilters>({});
  const [sort, setSort] = useState<GridSort | null>({ columnId: "time", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [refreshTick, setRefreshTick] = useState(0);
  const [result, setResult] = useState<{
    rows: LabLogRow[];
    total: number;
    summary: LabSummary;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);

  const openDetails = useCallback((row: LabLogRow) => {
    setExpandedKeys((prev) => new Set(prev).add(row.id));
  }, []);
  const columns = useMemo(
    () =>
      buildLabColumns(allRows, {
        now,
        onOpenDetails: openDetails,
        onAction: (message) => toast.info(message),
      }),
    [allRows, now, openDetails],
  );
  const defaultHidden = useMemo(
    () => columns.filter((column) => column.defaultHidden).map((column) => column.id),
    [columns],
  );
  const prefs = useGridPreferences("lab-request-logs", { hidden: defaultHidden });
  const facetOptions = useMemo(() => buildLabFilterOptions(allRows), [allRows]);

  // 搜索框停手 250ms 才生效：每敲一个字就查一次，服务端分页的表会连发一串请求。
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim().toLocaleLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // 条件变了回到第一页。
  // 请求日志不开多选（用户 11-17 反馈：日志是只读流水，没有要批量处理的动作）；多选在 API Key 示例里演示。
  const querySignature = JSON.stringify([appliedSearch, filters, timeRange]);
  useEffect(() => {
    setPage(1);
  }, [querySignature]);

  // 模拟服务端：本地算好，延迟一下再交给表格。
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(
      () => {
        const filtered = applyGridFilters(allRows, columns, filters).filter((row) =>
          matchesSearch(row, appliedSearch),
        );
        const sorted = sortGridRows(filtered, columns, sort, "zh-CN");
        setResult({
          rows: paginateRows(sorted, page, pageSize),
          total: filtered.length,
          summary: summarizeLabLogs(filtered),
        });
        setLoading(false);
        firstLoad.current = false;
      },
      firstLoad.current ? FIRST_LOAD_MS : QUERY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [allRows, appliedSearch, columns, filters, page, pageSize, refreshTick, sort, timeRange]);

  // 状态页签的计数：除状态以外的条件都算上，切页签前就知道每类有多少。
  const statusCounts = useMemo(() => {
    const base = applyGridFilters(
      allRows,
      columns,
      setGridFilter(filters, "status", undefined),
    ).filter((row) => matchesSearch(row, appliedSearch));
    const counts: Record<StatusTab, number> = {
      all: base.length,
      success: 0,
      failed: 0,
      retried: 0,
      cancelled: 0,
    };
    for (const row of base) counts[row.status] += 1;
    return counts;
  }, [allRows, appliedSearch, columns, filters]);

  const statusFilter = filters.status;
  const statusTab: StatusTab | null =
    !statusFilter || statusFilter.type !== "options" || statusFilter.values.length === 0
      ? "all"
      : statusFilter.values.length === 1 &&
          STATUS_VALUES.includes(statusFilter.values[0] as LabStatus)
        ? (statusFilter.values[0] as LabStatus)
        : null;

  const demoRows = demoState === "live" ? (result?.rows ?? []) : [];
  const demoLoading = demoState === "loading" || (demoState === "live" && loading);
  const total = result?.total ?? 0;
  const hasFilters = Object.keys(filters).length > 0 || appliedSearch.length > 0;

  const clearAll = () => {
    setFilters({});
    setSearch("");
  };

  const exportResults = (count: number) =>
    toast.success(`已导出 ${formatInteger(count)} 条记录（演示）`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
                <ScrollText
                  size={18}
                  className={`text-ink-3 ${iconHueClass(ScrollText)}`}
                  aria-hidden="true"
                />
                请求日志
              </h2>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                新表格演示 · 假数据
              </span>
            </div>
            <div className="-m-1 flex flex-wrap items-center gap-2 p-1">
              <Segmented<DemoState>
                id="lab-demo-state"
                label="演示状态"
                value={demoState}
                onChange={setDemoState}
                options={[
                  { value: "live", label: "正常" },
                  { value: "loading", label: "加载中" },
                  { value: "empty", label: "空结果" },
                  { value: "error", label: "出错" },
                ]}
              />
              <Segmented<TimeRange>
                id="lab-time-range"
                label="时间范围"
                value={timeRange}
                onChange={setTimeRange}
                options={[
                  { value: 1, label: "今天" },
                  { value: 7, label: "7 天" },
                  { value: 14, label: "14 天" },
                  { value: 30, label: "30 天" },
                ]}
              />
              <Button
                size="sm"
                onClick={() => setRefreshTick((tick) => tick + 1)}
                aria-label="刷新"
                className="h-8 w-8"
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={demoLoading ? "motion-safe:animate-spin" : ""}
                />
              </Button>
            </div>
          </div>
          <LabSummaryStrip
            summary={result?.summary ?? null}
            pending={demoState !== "live" || !result}
          />
        </header>

        {/* 独立的筛选区：一块淡底，和表格分开；芯片行说清楚当前到底筛了什么。 */}
        <div className="rounded-2xl bg-subtle p-2">
          <DataGridToolbar
            end={
              <>
                <GridViewMenu
                  columns={columns}
                  density={prefs.density}
                  onDensityChange={prefs.setDensity}
                  hiddenColumnIds={prefs.hiddenColumnIds}
                  onHiddenColumnIdsChange={prefs.setHiddenColumnIds}
                  onReset={prefs.resetView}
                />
                <Button size="sm" className="h-8 px-3 text-xs" onClick={() => exportResults(total)}>
                  <Download size={13} aria-hidden="true" />
                  导出
                </Button>
              </>
            }
            chips={
              <GridFilterChips
                columns={columns}
                filters={filters}
                onFiltersChange={setFilters}
                extra={
                  appliedSearch
                    ? [
                        {
                          id: "search",
                          label: `搜索「${search.trim()}」`,
                          onRemove: () => setSearch(""),
                        },
                      ]
                    : []
                }
              />
            }
          >
            <StatusTabs
              value={statusTab}
              counts={statusCounts}
              onChange={(tab) =>
                setFilters((prev) =>
                  setGridFilter(
                    prev,
                    "status",
                    tab === "all" ? undefined : { type: "options", values: [tab] },
                  ),
                )
              }
            />
            <GridSearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜索请求 ID、用户、模型、渠道"
              className="w-60"
            />
            <GridFacetFilter
              columnId="user"
              label="用户"
              options={facetOptions.users}
              filters={filters}
              onFiltersChange={setFilters}
            />
            <GridFacetFilter
              columnId="model"
              label="模型"
              options={facetOptions.models}
              filters={filters}
              onFiltersChange={setFilters}
            />
            <GridFacetFilter
              columnId="channel"
              label="渠道"
              options={facetOptions.channels}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </DataGridToolbar>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <DataGrid
            id="lab-request-logs"
            label="请求日志"
            fill
            columns={columns}
            rows={demoRows}
            rowKey={(row) => row.id}
            loading={demoLoading}
            error={demoState === "error" ? "网络超时：30 秒内没有收到服务器响应（演示）" : null}
            onRetry={() => setDemoState("live")}
            empty={{
              icon: <SearchX aria-hidden="true" />,
              title: hasFilters || demoState === "empty" ? "没有符合条件的请求" : "还没有请求日志",
              description: "换个时间范围，或者放宽筛选条件再试试",
              action: (
                <Button
                  size="sm"
                  onClick={() => {
                    clearAll();
                    setDemoState("live");
                  }}
                >
                  清除筛选
                </Button>
              ),
            }}
            density={prefs.density}
            hiddenColumnIds={prefs.hiddenColumnIds}
            onHiddenColumnIdsChange={prefs.setHiddenColumnIds}
            sort={sort}
            onSortChange={setSort}
            filters={filters}
            onFiltersChange={setFilters}
            renderExpanded={(row) => <LabDetailPanel row={row} />}
            expandedKeys={expandedKeys}
            onExpandedKeysChange={setExpandedKeys}
            resetScrollKey={`${page}|${pageSize}|${querySignature}`}
            footer={
              <DataGridPagination
                page={page}
                pageSize={pageSize}
                total={demoState === "live" ? total : 0}
                pending={demoState === "live" ? !result : demoState === "loading"}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
