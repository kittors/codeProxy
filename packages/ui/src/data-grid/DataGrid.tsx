import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Progress } from "satin-ui/react";
import { Table as SatinTable } from "satin-ui/react/table";
import type { SatinInstance, TableApi } from "satin-ui/react";
import { EmptyState } from "../feedback/EmptyState";
import { Button } from "../primitives/Button";
import { GridColumnMenu } from "./GridColumnMenu";
import { GridPopover } from "./GridPopover";
import {
  DEFAULT_MIN_COLUMN_WIDTH,
  EXPAND_COLUMN_WIDTH,
  REORDER_COLUMN_WIDTH,
  SELECT_COLUMN_WIDTH,
  baseColumnWidth,
  clampColumnWidth,
  computeGridLayout,
  firstSortDirection,
  nextGridSort,
  orderGridColumns,
  setGridFilter,
  sortGridRows,
  toggleGridRowSelection,
  toggleGridSelectAll,
  type GridLayoutColumn,
} from "./gridModel";
import { mergeColumnOrder, moveColumnBefore } from "./gridOrder";
import {
  readGridPreferences,
  useGridLines,
  useGridPreferenceEvents,
  writeGridPreferences,
} from "./gridStorage";
import { buildSatinColumns } from "./satinColumns";
import type { DataGridColumn, DataGridProps, GridFilterValue, GridSort } from "./types";

const GRID_REORDER_COLUMN_ID = "__reorder__";
const GRID_SELECT_COLUMN_ID = "__select__";
const GRID_EXPAND_COLUMN_ID = "__expand__";

const cssEscape = (value: string): string =>
  typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/([^\w-])/g, "\\$1");

function readRootScale(): number {
  if (typeof window === "undefined") return 1;
  const fs = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs / 16 : 1;
}

/**
 * 统一业务数据表格（基于 Satin UI 官方 `<SatinTable>` 内核驱动）：
 * - 完整承接 Satin 原生 `.sn-tbl-wrap` / `.sn-tbl-fill` / `.sn-sa` 悬浮细条 / `.sn-pin-l/.sn-pin-r` 柔雾离边投影 /
 *   `.sn-bulk` 悬浮胶囊批量操作条 / `.sn-tbl-foot` 贴底页脚 / 整列幽灵拖列 / 所见即所得拖行 / 增量行调和；
 * - 零 `.cp-grid` 自研样式与自研渲染引擎，彻底消除旧版固定列白色遮罩截字问题。
 */
export function DataGrid<T>({
  id,
  columns,
  rows,
  rowKey,
  label,
  loading = false,
  error = null,
  onRetry,
  fitColumns = false,
  empty,
  density = "default",
  lines,
  hiddenColumnIds,
  onHiddenColumnIdsChange,
  sort,
  defaultSort = null,
  onSortChange,
  filters,
  onFiltersChange,
  selectable = false,
  rowLabel,
  selectedKeys,
  onSelectedKeysChange,
  selectionActions,
  selectionSummary,
  selectionCount,
  onRowClick,
  isRowActive,
  rowClassName,
  rowTone,
  rowReorder,
  columnReorder,
  resizable = true,
  renderExpanded,
  expandedKeys,
  onExpandedKeysChange,
  fill = false,
  maxHeight,
  footer,
  frame = true,
  resetScrollKey,
  rowMotion = "page",
  className,
}: DataGridProps<T>) {
  const { t, i18n } = useTranslation();
  const idBase = useId();
  const tableRef = useRef<(SatinInstance & TableApi) | null>(null);
  // 视口宽度保存在 ref 而非 state：侧边栏收起/展开或窗口缩放期间直接通过 SatinTable.setLayoutWidths
  // 更新 <colgroup> 与 table 宽度，避免每帧触发 React 重渲染与 500 单元格重建。
  const viewportWidthRef = useRef(0);
  const [scale, setScale] = useState(readRootScale);
  const [menu, setMenu] = useState<{ columnId: string; anchor: HTMLElement } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const movedColumnRef = useRef<{ columnId: string; viaKeyboard: boolean } | null>(null);

  const expandable = Boolean(renderExpanded);
  const reorderEnabled = columnReorder ?? Boolean(id);

  // ---------- 视图偏好：列宽与列顺序 ----------
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>(
    () => readGridPreferences(id).widths ?? {},
  );
  const [storedOrder, setStoredOrder] = useState<string[] | undefined>(
    () => readGridPreferences(id).order,
  );
  const reloadPrefs = useCallback(() => {
    const prefs = readGridPreferences(id);
    setWidthOverrides(prefs.widths ?? {});
    setStoredOrder(prefs.order);
  }, [id]);
  useEffect(reloadPrefs, [reloadPrefs]);
  useGridPreferenceEvents(id, reloadPrefs);

  const definitionIds = useMemo(() => columns.map((column) => column.id), [columns]);
  const mergedOrder = useMemo(
    () => mergeColumnOrder(definitionIds, storedOrder),
    [definitionIds, storedOrder],
  );
  const visibleColumns = useMemo(
    () => orderGridColumns(columns, hiddenColumnIds, mergedOrder),
    [columns, hiddenColumnIds, mergedOrder],
  );
  const visibleOrderIds = useMemo(
    () => visibleColumns.map((column) => column.id),
    [visibleColumns],
  );
  const movableIds = useMemo(
    () =>
      visibleColumns
        .filter((column) => reorderEnabled && !column.pin && column.reorderable !== false)
        .map((column) => column.id),
    [reorderEnabled, visibleColumns],
  );

  // ---------- 列宽布局计算（设计像素 × scale，支持 fitColumns / grow） ----------
  const designWidths = useMemo(() => {
    const map: Record<string, number> = {};
    for (const column of visibleColumns) {
      map[column.id] = baseColumnWidth(column, widthOverrides);
    }
    return map;
  }, [visibleColumns, widthOverrides]);

  const leadingColumns = useMemo<GridLayoutColumn[]>(() => {
    const leading: GridLayoutColumn[] = [];
    if (rowReorder) {
      leading.push({ id: GRID_REORDER_COLUMN_ID, width: REORDER_COLUMN_WIDTH, pin: "start" });
    }
    if (selectable) {
      leading.push({ id: GRID_SELECT_COLUMN_ID, width: SELECT_COLUMN_WIDTH, pin: "start" });
    }
    if (expandable) {
      leading.push({ id: GRID_EXPAND_COLUMN_ID, width: EXPAND_COLUMN_WIDTH, pin: "start" });
    }
    return leading;
  }, [expandable, rowReorder, selectable]);

  const layoutColumns = useMemo<GridLayoutColumn[]>(
    () => [
      ...leadingColumns,
      ...visibleColumns.map((column) => ({
        id: column.id,
        width: designWidths[column.id],
        pin: column.pin,
        grow: column.grow,
        minWidth: column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH,
        shrink:
          fitColumns &&
          Boolean(column.grow) &&
          !column.pin &&
          widthOverrides[column.id] === undefined,
      })),
    ],
    [designWidths, fitColumns, leadingColumns, visibleColumns, widthOverrides],
  );

  const layout = useMemo(
    () => computeGridLayout(layoutColumns, scale, viewportWidthRef.current),
    [layoutColumns, scale],
  );

  const layoutSpecRef = useRef({ layoutColumns, scale });
  layoutSpecRef.current = { layoutColumns, scale };

  // ---------- 视口宽度与根字号缩放观测（零 React 重渲染直写列宽） ----------
  useLayoutEffect(() => {
    const inst = tableRef.current;
    const scroller = inst?.scroller ?? inst?.el ?? null;
    if (!scroller) return undefined;
    const applyViewportWidths = (nextWidth: number, nextScale: number) => {
      const nextLayout = computeGridLayout(layoutSpecRef.current.layoutColumns, nextScale, nextWidth);
      tableRef.current?.setLayoutWidths?.({
        widths: nextLayout.widths,
        tableWidth: nextLayout.totalWidth || "100%",
        fluidColumnId: nextLayout.fluidColumnId,
        selectColWidth: nextLayout.widths[GRID_SELECT_COLUMN_ID] ?? SELECT_COLUMN_WIDTH,
        expandColWidth: nextLayout.widths[GRID_EXPAND_COLUMN_ID] ?? EXPAND_COLUMN_WIDTH,
        reorderColWidth: nextLayout.widths[GRID_REORDER_COLUMN_ID] ?? REORDER_COLUMN_WIDTH,
      });
    };
    const sync = () => {
      const currentInst = tableRef.current;
      const currentScroller = currentInst?.scroller ?? currentInst?.el ?? scroller;
      const nextWidth = currentScroller.clientWidth || currentInst?.el?.clientWidth || 0;
      const nextScale = readRootScale();
      const widthChanged = Math.abs(viewportWidthRef.current - nextWidth) > 0.5;
      const scaleChanged = Math.abs(layoutSpecRef.current.scale - nextScale) > 0.001;
      if (widthChanged) viewportWidthRef.current = nextWidth;
      if (scaleChanged) {
        setScale(nextScale);
      } else if (widthChanged) {
        applyViewportWidths(nextWidth, layoutSpecRef.current.scale);
      }
    };
    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(scroller);
    window.addEventListener("resize", sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  // 列集合 / 用户拖宽覆盖 / 缩放变更时，按当前视口宽度同步最新列宽
  useLayoutEffect(() => {
    const vw = viewportWidthRef.current;
    if (vw <= 0) return;
    const nextLayout = computeGridLayout(layoutColumns, scale, vw);
    tableRef.current?.setLayoutWidths?.({
      widths: nextLayout.widths,
      tableWidth: nextLayout.totalWidth || "100%",
      fluidColumnId: nextLayout.fluidColumnId,
      selectColWidth: nextLayout.widths[GRID_SELECT_COLUMN_ID] ?? SELECT_COLUMN_WIDTH,
      expandColWidth: nextLayout.widths[GRID_EXPAND_COLUMN_ID] ?? EXPAND_COLUMN_WIDTH,
      reorderColWidth: nextLayout.widths[GRID_REORDER_COLUMN_ID] ?? REORDER_COLUMN_WIDTH,
    });
  }, [layoutColumns, scale]);

  const commitWidth = useCallback(
    (columnId: string, designPx: number | null) => {
      const column = columns.find((item) => item.id === columnId);
      if (!column) return;
      setWidthOverrides((prev) => {
        const next = { ...prev };
        if (designPx === null) delete next[columnId];
        else next[columnId] = clampColumnWidth(column, designPx);
        writeGridPreferences(id, {
          widths: Object.keys(next).length > 0 ? next : undefined,
        });
        return next;
      });
    },
    [columns, id],
  );

  const handleColumnResize = useCallback(
    ({ key, width }: { key: string; width: number }) => {
      const currentScale = readRootScale();
      commitWidth(key, Math.round(width / currentScale));
    },
    [commitWidth],
  );

  const handleColumnResizeBy = useCallback(
    ({ key, delta }: { key: string; delta: number }) => {
      const column = columns.find((item) => item.id === key);
      if (!column) return;
      const base = baseColumnWidth(column, widthOverrides);
      commitWidth(key, base + delta);
    },
    [columns, commitWidth, widthOverrides],
  );

  const handleAutoFitColumn = useCallback(
    ({ key }: { key: string }) => {
      const scroller = tableRef.current?.scroller;
      if (!scroller) {
        commitWidth(key, null);
        return;
      }
      const selector = cssEscape(key);
      let overflow = 0;
      for (const cell of scroller.querySelectorAll<HTMLElement>(`[data-col="${selector}"]`)) {
        for (const node of [cell, ...cell.querySelectorAll<HTMLElement>("*")]) {
          overflow = Math.max(overflow, node.scrollWidth - node.clientWidth);
        }
      }
      if (overflow > 1) {
        const currentScale = readRootScale();
        commitWidth(key, (designWidths[key] ?? 0) + overflow / currentScale + 6);
      } else {
        commitWidth(key, null);
      }
    },
    [commitWidth, designWidths],
  );

  // ---------- 列重排（拖拽 + 键盘把手） ----------
  const persistOrder = useCallback(
    (nextVisibleOrder: string[], movedId?: string, viaKeyboard = false) => {
      const hiddenTail = mergedOrder.filter((item) => !nextVisibleOrder.includes(item));
      const fullNext = [...nextVisibleOrder, ...hiddenTail];
      setStoredOrder(fullNext);
      writeGridPreferences(id, { order: fullNext });
      if (movedId) movedColumnRef.current = { columnId: movedId, viaKeyboard };
    },
    [id, mergedOrder],
  );

  const handleColumnReorder = useCallback(
    ({ keys }: { keys: string[] }) => {
      persistOrder(keys);
    },
    [persistOrder],
  );

  const handleColumnGripKeyDown = useCallback(
    (column: DataGridColumn<T>, event: KeyboardEvent<HTMLElement>) => {
      if (!movableIds.includes(column.id)) return;
      const pos = movableIds.indexOf(column.id);
      let targetBefore: string | null | undefined;
      if (event.key === "ArrowLeft") {
        if (pos <= 0) return;
        targetBefore = movableIds[pos - 1];
      } else if (event.key === "ArrowRight") {
        if (pos >= movableIds.length - 1) return;
        targetBefore = movableIds[pos + 2] ?? null;
      } else if (event.key === "Home") {
        if (pos === 0) return;
        targetBefore = movableIds[0];
      } else if (event.key === "End") {
        if (pos === movableIds.length - 1) return;
        targetBefore = null;
      } else {
        return;
      }
      event.preventDefault();
      const nextMovable = moveColumnBefore(movableIds, column.id, targetBefore);
      const startPinned = visibleOrderIds.filter(
        (cid) => visibleColumns.find((c) => c.id === cid)?.pin === "start",
      );
      const endPinned = visibleOrderIds.filter(
        (cid) => visibleColumns.find((c) => c.id === cid)?.pin === "end",
      );
      const fixedMid = visibleOrderIds.filter(
        (cid) => !startPinned.includes(cid) && !endPinned.includes(cid) && !movableIds.includes(cid),
      );
      const nextVisible = [...startPinned, ...nextMovable, ...fixedMid, ...endPinned];
      persistOrder(nextVisible, column.id, true);
    },
    [movableIds, persistOrder, visibleColumns, visibleOrderIds],
  );

  useLayoutEffect(() => {
    const moved = movedColumnRef.current;
    if (!moved) return;
    movedColumnRef.current = null;
    const index = visibleColumns.findIndex((column) => column.id === moved.columnId);
    if (index < 0) return;
    setAnnouncement(
      t("data_grid.announce_column_moved", {
        column: visibleColumns[index].header,
        position: index + 1,
      }),
    );
    if (moved.viaKeyboard) {
      tableRef.current?.el
        ?.querySelector<HTMLElement>(
          `th[data-col="${cssEscape(moved.columnId)}"] [data-grid-col-grip]`,
        )
        ?.focus();
    }
  }, [t, visibleColumns]);

  // ---------- 排序（受控 / 非受控，三态循环 + 多语言排序） ----------
  const sortControlled = sort !== undefined;
  const [innerSort, setInnerSort] = useState<GridSort | null>(defaultSort);
  const activeSort = sortControlled ? sort : innerSort;
  const canSort = sortControlled ? Boolean(onSortChange) : true;

  const displayRows = useMemo(
    () =>
      sortControlled || !activeSort ? rows : sortGridRows(rows, columns, activeSort, i18n.language),
    [activeSort, columns, i18n.language, rows, sortControlled],
  );
  const rowKeys = useMemo(() => displayRows.map((row) => rowKey(row)), [displayRows, rowKey]);

  const announceSort = useCallback(
    (next: GridSort | null) => {
      if (!next) {
        setAnnouncement(t("data_grid.announce_sort_cleared"));
        return;
      }
      const column = columns.find((item) => item.id === next.columnId);
      setAnnouncement(
        t(
          next.direction === "asc" ? "data_grid.announce_sort_asc" : "data_grid.announce_sort_desc",
          { column: column?.header ?? next.columnId },
        ),
      );
    },
    [columns, t],
  );

  const changeSort = useCallback(
    (next: GridSort | null) => {
      if (sortControlled && !onSortChange) return;
      if (!sortControlled) setInnerSort(next);
      onSortChange?.(next);
      announceSort(next);
    },
    [announceSort, onSortChange, sortControlled],
  );

  const onSortClick = useCallback(
    (column: DataGridColumn<T>) =>
      changeSort(nextGridSort(activeSort, column.id, firstSortDirection(column))),
    [activeSort, changeSort],
  );

  // ---------- 选择（含跨页与 Shift 连选） ----------
  const selectionAnchorRef = useRef<string | null>(null);
  const selectedArray = useMemo(() => [...(selectedKeys ?? [])], [selectedKeys]);
  const selectedCount = selectionCount ?? selectedKeys?.size ?? 0;

  const commitSelection = useCallback(
    (next: Set<string>) => {
      onSelectedKeysChange?.(next);
      setAnnouncement(
        next.size > 0
          ? t("data_grid.selected_rows", { count: next.size })
          : t("data_grid.selection_cleared"),
      );
    },
    [onSelectedKeysChange, t],
  );

  const clearSelection = useCallback(() => {
    commitSelection(new Set());
    selectionAnchorRef.current = null;
  }, [commitSelection]);

  const handleSelectChange = useCallback(
    (detail: {
      keys: string[];
      key?: string;
      range?: boolean;
      all?: boolean;
      checked?: boolean;
      clear?: boolean;
    }) => {
      if (detail.clear) {
        clearSelection();
        return;
      }
      if (detail.all) {
        const next = detail.checked
          ? new Set([...(selectedKeys ?? []), ...rowKeys])
          : toggleGridSelectAll(rowKeys, selectedKeys);
        commitSelection(next);
        selectionAnchorRef.current = null;
        return;
      }
      if (detail.key) {
        const next = toggleGridRowSelection(rowKeys, selectedKeys, detail.key, {
          anchorKey: selectionAnchorRef.current,
          range: Boolean(detail.range),
        });
        selectionAnchorRef.current = detail.key;
        commitSelection(next);
        return;
      }
      commitSelection(new Set(detail.keys));
    },
    [clearSelection, commitSelection, rowKeys, selectedKeys],
  );

  // ---------- 展开 ----------
  const expandedArray = useMemo(
    () => (expandedKeys ? [...expandedKeys] : undefined),
    [expandedKeys],
  );
  const handleExpandChange = useCallback(
    (event: { keys: string[]; key: string; expanded: boolean }) => {
      if (!onExpandedKeysChange) return;
      const next = new Set(expandedKeys);
      if (event.expanded) next.add(event.key);
      else next.delete(event.key);
      onExpandedKeysChange(next);
    },
    [expandedKeys, onExpandedKeysChange],
  );

  // ---------- 行重排 ----------
  const handleRowReorder = useCallback(
    (event: { from: number; to: number; viaKeyboard?: boolean }) => {
      if (!rowReorder || rowReorder.disabled || activeSort) return;
      rowReorder.onMove(event.from, event.to);
      setAnnouncement(t("data_grid.announce_row_moved", { position: event.to + 1 }));
    },
    [activeSort, rowReorder, t],
  );

  // ---------- 列菜单与筛选 ----------
  const menuColumn = menu
    ? visibleColumns.find((column) => column.id === menu.columnId)
    : undefined;
  const closeMenu = useCallback(() => setMenu(null), []);
  const applyFilter = useCallback(
    (columnId: string, value: GridFilterValue | undefined) => {
      if (!onFiltersChange) return;
      onFiltersChange(setGridFilter(filters, columnId, value));
      const column = columns.find((item) => item.id === columnId);
      setAnnouncement(
        value
          ? t("data_grid.announce_filtered", { column: column?.header ?? columnId })
          : t("data_grid.announce_filter_cleared", { column: column?.header ?? columnId }),
      );
    },
    [columns, filters, onFiltersChange, t],
  );

  // 保持稳定的列定义顺序传给 SatinTable，列序变化完全交给 columnOrder 走无重建 moveCols()
  const definitionVisibleColumns = useMemo(
    () =>
      hiddenColumnIds && hiddenColumnIds.size > 0
        ? columns.filter((column) => !hiddenColumnIds.has(column.id) || Boolean(column.pin) || column.hideable === false)
        : columns,
    [columns, hiddenColumnIds],
  );

  const handleToggleFilterMenu = useCallback((columnId: string, anchor: HTMLElement) => {
    setMenu((current) => (current?.columnId === columnId ? null : { columnId, anchor }));
  }, []);

  // ---------- 映射至 Satin 原生 TableColumnReact ----------
  const satinColumns = useMemo(
    () =>
      buildSatinColumns({
        columns: definitionVisibleColumns,
        scale,
        layoutWidths: layout.widths,
        designWidths,
        resizable,
        reorderEnabled,
        canSort,
        activeSort,
        filters,
        hasFiltersChange: Boolean(onFiltersChange),
        openMenuColumnId: menu?.columnId,
        idBase,
        rowKey,
        selectedKeys,
        expandedKeys,
        onSortClick,
        onColumnGripKeyDown: handleColumnGripKeyDown,
        onToggleFilterMenu: handleToggleFilterMenu,
        t,
      }),
    [
      activeSort,
      canSort,
      definitionVisibleColumns,
      designWidths,
      expandedKeys,
      filters,
      handleColumnGripKeyDown,
      handleToggleFilterMenu,
      idBase,
      layout.widths,
      menu?.columnId,
      onFiltersChange,
      onSortClick,
      reorderEnabled,
      resizable,
      rowKey,
      scale,
      selectedKeys,
      t,
    ],
  );

  const resolvedLines = useGridLines(id, lines);
  const interactive = selectable || expandable || Boolean(onRowClick) || Boolean(rowReorder);
  const satinSort = activeSort ? { key: activeSort.columnId, dir: activeSort.direction } : null;

  const emptyNode = useMemo(
    () => (
      <EmptyState
        icon={empty?.icon}
        scene={empty?.scene}
        compact={!fill}
        title={empty?.title ?? t("data_grid.empty_title")}
        description={empty?.description}
        action={
          empty?.details || empty?.action ? (
            <div className="flex max-w-xl flex-col items-center gap-3">
              {empty?.details}
              {empty?.action}
            </div>
          ) : undefined
        }
      />
    ),
    [empty, fill, t],
  );

  const errorNode = useMemo(
    () =>
      error ? (
        <div role="alert">
          <EmptyState
            scene="error"
            compact={!fill}
            title={t("data_grid.error_title")}
            description={error}
            action={
              onRetry ? (
                <Button size="sm" onClick={onRetry}>
                  {t("data_grid.retry")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : undefined,
    [error, fill, onRetry, t],
  );

  // Satin 原生底部悬浮胶囊批量操作条（.sn-bulk）
  const bulkNode =
    selectable && selectedCount > 0 ? (
      <>
        <span className="whitespace-nowrap font-semibold tabular-nums">
          {t("data_grid.selected_rows", { count: selectedCount })}
        </span>
        {selectionSummary ? (
          <span className="max-w-56 truncate text-xs opacity-80">
            {selectionSummary({ count: selectedCount, clear: clearSelection })}
          </span>
        ) : null}
        <span className="sn-sep" aria-hidden="true" />
        <div className="flex shrink-0 items-center gap-1.5">
          {selectionActions?.({ count: selectedCount, clear: clearSelection })}
          <button type="button" className="sn-bb" onClick={clearSelection}>
            {t("data_grid.clear_selection")}
          </button>
        </div>
      </>
    ) : null;

  const refreshIndicator =
    loading && rows.length > 0 ? (
      <Progress
        height={2}
        label={t("data_grid.loading")}
        className="!rounded-none !bg-transparent"
      />
    ) : null;

  return (
    <>
      <SatinTable
        ref={tableRef}
        wrapClassName={className}
        columns={satinColumns}
        data={displayRows as T[]}
        rowKey={(row) => rowKey(row as T)}
        label={label}
        loading={loading && rows.length === 0}
        refreshing={loading && rows.length > 0}
        refreshIndicator={refreshIndicator}
        error={error || undefined}
        errorContent={errorNode}
        onRetry={onRetry}
        empty={emptyNode}
        density={density}
        lines={resolvedLines}
        plain={!frame}
        fill={fill}
        maxHeight={fill ? undefined : (maxHeight ?? undefined)}
        sort={satinSort}
        sortLocal={false}
        sortClearable
        resizeMode="single"
        tableWidth={layout.totalWidth || "100%"}
        selectColWidth={layout.widths[GRID_SELECT_COLUMN_ID] ?? SELECT_COLUMN_WIDTH}
        expandColWidth={layout.widths[GRID_EXPAND_COLUMN_ID] ?? EXPAND_COLUMN_WIDTH}
        reorderColWidth={layout.widths[GRID_REORDER_COLUMN_ID] ?? REORDER_COLUMN_WIDTH}
        columnOrder={visibleOrderIds}
        draggableColumns={reorderEnabled}
        draggableRows={Boolean(rowReorder)}
        rowDragDisabled={Boolean(rowReorder && (rowReorder.disabled || activeSort))}
        selectable={selectable}
        selected={selectedArray}
        onSelectChange={handleSelectChange}
        rowLabel={rowLabel as ((row: unknown) => string) | undefined}
        rowClassName={rowClassName as ((row: unknown) => string | undefined) | undefined}
        rowTone={rowTone as ((row: unknown) => "danger" | "warning" | "muted" | undefined) | undefined}
        isRowActive={isRowActive as ((row: unknown) => boolean) | undefined}
        onRowClick={expandable ? undefined : (onRowClick as ((row: unknown) => void) | undefined)}
        detail={renderExpanded ? (row) => renderExpanded(row as T) : undefined}
        expandColumn={expandable}
        expandOnRowClick={expandable}
        expandedKeys={expandedArray}
        onExpandChange={handleExpandChange}
        leadFixed={
          leadingColumns.length > 0 &&
          (visibleColumns.some((c) => c.pin === "start") || leadingColumns.length > 0)
        }
        gridRole={interactive}
        rowNavigation={interactive}
        rowMotion={rowMotion}
        resetScrollKey={resetScrollKey}
        selectPageLabel={t("data_grid.select_page")}
        selectRowLabel={t("data_grid.select_row")}
        selectNamedLabel={(name) => t("data_grid.select_named", { name })}
        rowOrderLabel={t("common.row_order")}
        reorderRowLabel={(idx) => t("common.reorder_row", { index: idx + 1 })}
        expandLabel={t("data_grid.details")}
        expandRowLabel={t("data_grid.expand_row")}
        collapseRowLabel={t("data_grid.collapse_row")}
        onColumnResize={handleColumnResize}
        onColumnResizeBy={handleColumnResizeBy}
        onAutoFitColumn={handleAutoFitColumn}
        onColumnReorder={handleColumnReorder}
        onRowReorder={handleRowReorder}
        bulk={bulkNode}
        footer={footer}
      />

      {/* 读屏实时播报（排序、筛选、选中、列/行移动）。 */}
      <div aria-live="polite" aria-atomic="true" data-grid-announcer="" className="sr-only">
        {announcement}
      </div>

      <GridPopover
        anchor={menu?.anchor ?? null}
        open={Boolean(menu && menuColumn)}
        onClose={closeMenu}
        align={menuColumn?.align === "end" ? "end" : "start"}
        label={menuColumn ? t("data_grid.column_menu", { column: menuColumn.header }) : ""}
      >
        {menuColumn ? (
          <GridColumnMenu
            key={menuColumn.id}
            column={menuColumn}
            sort={activeSort}
            onSortChange={canSort ? changeSort : undefined}
            filterValue={filters?.[menuColumn.id]}
            onApplyFilter={
              onFiltersChange ? (value) => applyFilter(menuColumn.id, value) : undefined
            }
            onHide={
              onHiddenColumnIdsChange && menuColumn.hideable !== false && !menuColumn.pin
                ? () =>
                    onHiddenColumnIdsChange(new Set([...(hiddenColumnIds ?? []), menuColumn.id]))
                : undefined
            }
            onClose={closeMenu}
          />
        ) : null}
      </GridPopover>
    </>
  );
}
