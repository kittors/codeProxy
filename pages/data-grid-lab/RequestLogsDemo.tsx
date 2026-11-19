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
  listGridFilterChips,
  paginateRows,
  setGridFilter,
  sortGridRows,
  toast,
  useGridPreferences,
  type GridFilters,
  type GridSort,
} from "@code-proxy/ui";
import { Download, RefreshCw, ScrollText, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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

type DemoState = "live" | "loading" | "nodata" | "error";
/** 演示状态开关上的选项：「无匹配」不是独立状态，是真的套上一组筛不出任何请求的条件。 */
type DemoChoice = DemoState | "nomatch";

/** 「无匹配」用的筛选：耗时 ≥ 600 秒的 claude-haiku 请求，假数据里一条都没有。 */
const NO_MATCH_FILTERS: GridFilters = {
  model: { type: "options", values: ["claude-haiku-5-5"] },
  latency: { type: "range", min: 600 },
};
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

export function RequestLogsDemo({ switcher }: { switcher: ReactNode }) {
  const { t } = useTranslation();
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

  // 不加任何筛选时每类的条数：页签按它的位数留宽，筛选时宽度不变。
  const maxStatusCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = {
      all: allRows.length,
      success: 0,
      failed: 0,
      retried: 0,
      cancelled: 0,
    };
    for (const row of allRows) counts[row.status] += 1;
    return counts;
  }, [allRows]);

  const statusFilter = filters.status;
  const statusTab: StatusTab | null =
    !statusFilter || statusFilter.type !== "options" || statusFilter.values.length === 0
      ? "all"
      : statusFilter.values.length === 1 &&
          STATUS_VALUES.includes(statusFilter.values[0] as LabStatus)
        ? (statusFilter.values[0] as LabStatus)
        : null;

  const demoRows = demoState === "live" ? (result?.rows ?? []) : [];
  const activeFilterLabels = [
    ...(appliedSearch ? [`搜索「${search.trim()}」`] : []),
    ...listGridFilterChips(columns, filters, t).map((chip) => chip.label),
  ];
  const demoLoading = demoState === "loading" || (demoState === "live" && loading);
  const total = result?.total ?? 0;
  const hasFilters = Object.keys(filters).length > 0 || appliedSearch.length > 0;
  const demoChoice: DemoChoice =
    demoState === "live" && hasFilters && !loading && result?.total === 0 ? "nomatch" : demoState;

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
              <h2 className="sr-only">请求日志</h2>
              {switcher}
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                新表格演示 · 假数据
              </span>
            </div>
            <div className="-m-1 flex flex-wrap items-center gap-2 p-1">
              <Segmented<DemoChoice>
                id="lab-demo-state"
                label="演示状态"
                value={demoChoice}
                onChange={(choice) => {
                  if (choice === "nomatch") {
                    setSearch("");
                    setFilters(NO_MATCH_FILTERS);
                    setDemoState("live");
                    return;
                  }
                  // 离开「无匹配」（不管切到哪一项）都撤掉那组筛不出东西的条件，免得切回「正常」还是空表。
                  if (filters === NO_MATCH_FILTERS) setFilters({});
                  setDemoState(choice);
                }}
                options={[
                  { value: "live", label: "正常" },
                  { value: "loading", label: "加载中" },
                  { value: "nodata", label: "无数据" },
                  { value: "nomatch", label: "无匹配" },
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
                placeholder="未筛选，显示全部请求 · 按 / 搜索"
              />
            }
          >
            <StatusTabs
              value={statusTab}
              counts={statusCounts}
              maxCounts={maxStatusCounts}
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
            // 三种空状态都铺满表体、和有数据时同高：完全没有数据 / 当前筛选下没有结果
            // （写出生效的条件、给清除筛选）/ 加载失败（上面的 error，给重试）。
            empty={
              demoState === "nodata" || !hasFilters
                ? {
                    icon: <ScrollText aria-hidden="true" />,
                    title: "还没有请求日志",
                    description: "有请求经过网关后会出现在这里。新部署的实例要等第一次调用。",
                  }
                : {
                    icon: <SearchX aria-hidden="true" />,
                    title: "没有符合条件的请求",
                    description: "当前生效的筛选条件：",
                    details: (
                      <ul
                        className="flex flex-wrap justify-center gap-1.5"
                        aria-label="生效的筛选条件"
                      >
                        {activeFilterLabels.map((label) => (
                          <li
                            key={label}
                            className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs text-ink-2 dark:bg-white/[0.07]"
                          >
                            {label}
                          </li>
                        ))}
                      </ul>
                    ),
                    action: (
                      <Button size="sm" onClick={clearAll}>
                        清除筛选
                      </Button>
                    ),
                  }
            }
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
