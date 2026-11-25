import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Progress } from "satin-ui/react";
import { Button } from "../primitives/Button";
import { popoverEnterTransition, popoverExitTransition } from "../utils/motion";
import "./DataGrid.css";
import { DataGridBody } from "./DataGridBody";
import { DataGridHeader } from "./DataGridHeader";
import { GridColumnMenu } from "./GridColumnMenu";
import { GridPopover } from "./GridPopover";
import { GridScrollbar } from "./GridScrollbar";
import { useGridLines } from "./gridStorage";
import {
  GRID_EXPAND_COLUMN_ID,
  GRID_REORDER_COLUMN_ID,
  GRID_SELECT_COLUMN_ID,
  ROW_HEIGHT_REM,
} from "./gridLayout";
import {
  EXPAND_COLUMN_WIDTH,
  REORDER_COLUMN_WIDTH,
  SELECT_COLUMN_WIDTH,
  firstSortDirection,
  getGridSelectionState,
  nextGridSort,
  orderGridColumns,
  setGridFilter,
  sortGridRows,
  toggleGridRowSelection,
  toggleGridSelectAll,
  type GridLayoutColumn,
} from "./gridModel";
import { cssEscape, useColumnReorder } from "./useColumnReorder";
import { useColumnSizing } from "./useColumnSizing";
import { useGridViewport } from "./useGridViewport";
import { useRowReorder } from "./useRowReorder";
import { RowSlide } from "./RowSlide";
import { useRowMotion } from "./useRowMotion";
import type { DataGridColumn, DataGridProps, GridFilterValue, GridSort } from "./types";

/** 嵌入小表空态 / 错误态的高度（像素）。 */
const EMBEDDED_STATE_HEIGHT = 220;

/**
 * 新一代数据表格（计划 104）。
 *
 * 结构：根节点（滚动状态写在 data-* 上）→ 表格区（视口 + 叠在上面的选择条、进度条、
 * 拖宽参考线、纵向滚动条）→ 横向滚动条通道 → 页脚（分页）。
 * 表头吸顶、左右冻结列都是同一个滚动视口里的 position: sticky，不再像旧 DataTable 那样
 * 另画一层「冻结轨道」去盖住单元格——旧做法要求 JS 算出的列宽和浏览器排出来的严丝合缝，
 * 根字号一缩放就错位。
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
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const selectionAnchor = useRef<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ columnId: string; anchor: HTMLElement } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const expandable = Boolean(renderExpanded);

  // ---------- 列顺序（拖表头换位置） ----------
  const pinnedRef = useRef({ start: 0, end: 0 });
  const movedColumn = useRef<{ columnId: string; viaKeyboard: boolean } | null>(null);
  const columnOrder = useColumnReorder({
    id,
    columns,
    hidden: hiddenColumnIds,
    enabled: columnReorder ?? Boolean(id),
    viewportRef,
    areaRef,
    pinnedRef,
    onMoved: (columnId, viaKeyboard) => {
      movedColumn.current = { columnId, viaKeyboard };
    },
  });
  const visibleColumns = useMemo(
    () => orderGridColumns(columns, hiddenColumnIds, columnOrder.order),
    [columnOrder.order, columns, hiddenColumnIds],
  );
  const leadingColumns = useMemo<GridLayoutColumn[]>(() => {
    const leading: GridLayoutColumn[] = [];
    if (rowReorder)
      leading.push({ id: GRID_REORDER_COLUMN_ID, width: REORDER_COLUMN_WIDTH, pin: "start" });
    if (selectable)
      leading.push({ id: GRID_SELECT_COLUMN_ID, width: SELECT_COLUMN_WIDTH, pin: "start" });
    if (expandable)
      leading.push({ id: GRID_EXPAND_COLUMN_ID, width: EXPAND_COLUMN_WIDTH, pin: "start" });
    return leading;
  }, [expandable, rowReorder, selectable]);

  const viewport = useGridViewport(rootRef, viewportRef);
  const sizing = useColumnSizing({
    id,
    columns: visibleColumns,
    leadingColumns,
    viewportWidth: viewport.width,
    scale: viewport.scale,
    fitColumns,
  });
  const { layout } = sizing;
  pinnedRef.current = { start: layout.startPinnedWidth, end: layout.endPinnedWidth };

  // ---------- 排序：受控（sort 传了，含 null）只画箭头；非受控自己记状态、本地排好 ----------
  const sortControlled = sort !== undefined;
  const [innerSort, setInnerSort] = useState<GridSort | null>(defaultSort);
  const activeSort = sortControlled ? sort : innerSort;
  const displayRows = useMemo(
    () =>
      sortControlled || !activeSort ? rows : sortGridRows(rows, columns, activeSort, i18n.language),
    [activeSort, columns, i18n.language, rows, sortControlled],
  );

  const keys = useMemo(() => displayRows.map((row) => rowKey(row)), [displayRows, rowKey]);
  const orderSignature = keys.join("\u0001");
  const rowMoves = useRowMotion({ rows: displayRows, keys, bodyRef, live: rowMotion === "live", reduceMotion: Boolean(reduceMotion) });

  const selectionState = getGridSelectionState(keys, selectedKeys);
  const selectedCount = selectionCount ?? selectedKeys?.size ?? 0;

  // 换页、换筛选时回到顶部；第一次渲染不动（保留浏览器恢复的滚动位置）。
  const lastResetKey = useRef(resetScrollKey);
  useEffect(() => {
    if (lastResetKey.current === resetScrollKey) return;
    lastResetKey.current = resetScrollKey;
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [resetScrollKey]);
  const status = error ? "error" : rows.length === 0 ? (loading ? "skeleton" : "empty") : "rows";

  // 键盘移动列之后：报出新位置，把焦点还给这一列的把手（DOM 换了位置，焦点会丢）。
  useLayoutEffect(() => {
    const moved = movedColumn.current;
    if (!moved) return;
    movedColumn.current = null;
    const index = visibleColumns.findIndex((column) => column.id === moved.columnId);
    if (index < 0) return;
    setAnnouncement(
      t("data_grid.announce_column_moved", {
        column: visibleColumns[index].header,
        position: index + 1,
      }),
    );
    if (moved.viaKeyboard) {
      viewportRef.current
        ?.querySelector<HTMLElement>(
          `th[data-col="${cssEscape(moved.columnId)}"] [data-grid-col-grip]`,
        )
        ?.focus();
    }
  }, [t, visibleColumns]);

  // ---------- 行顺序（拖行首把手） ----------
  const headerHeightRef = useRef(0);
  headerHeightRef.current = viewport.headerHeight;
  const movedRow = useRef<{ key: string; viaKeyboard: boolean } | null>(null);
  const rowDrag = useRowReorder({
    enabled: Boolean(rowReorder) && !rowReorder?.disabled && !activeSort,
    keys,
    viewportRef,
    areaRef,
    headerHeightRef,
    onMove: rowReorder
      ? (fromIndex, toIndex) => rowReorder.onMove(fromIndex, toIndex)
      : undefined,
    onMoved: (key, toIndex, viaKeyboard) => {
      movedRow.current = { key, viaKeyboard };
      setAnnouncement(t("data_grid.announce_row_moved", { position: toIndex + 1 }));
    },
  });
  useLayoutEffect(() => {
    const moved = movedRow.current;
    if (!moved) return;
    movedRow.current = null;
    if (!moved.viaKeyboard) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(
        `tr[data-row-key="${cssEscape(moved.key)}"] [data-grid-row-grip]`,
      )
      ?.focus();
  }, [orderSignature]);

  // ---------- 排序 ----------
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
          {
            column: column?.header ?? next.columnId,
          },
        ),
      );
    },
    [columns, t],
  );

  const canSort = sortControlled ? Boolean(onSortChange) : true;
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

  // ---------- 选择 ----------
  const setSelection = useCallback(
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

  const toggleRow = useCallback(
    (key: string, range: boolean) => {
      setSelection(
        toggleGridRowSelection(keys, selectedKeys, key, {
          anchorKey: selectionAnchor.current,
          range,
        }),
      );
      selectionAnchor.current = key;
    },
    [keys, selectedKeys, setSelection],
  );

  const toggleAll = useCallback(() => {
    setSelection(toggleGridSelectAll(keys, selectedKeys));
    selectionAnchor.current = null;
  }, [keys, selectedKeys, setSelection]);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    selectionAnchor.current = null;
  }, [setSelection]);

  // ---------- 展开 ----------
  const toggleExpand = useCallback(
    (key: string) => {
      if (!onExpandedKeysChange) return;
      const next = new Set(expandedKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onExpandedKeysChange(next);
    },
    [expandedKeys, onExpandedKeysChange],
  );

  // ---------- 键盘：行之间用方向键走，空格勾选，回车展开 ----------
  // 只在纵向上把行滚进视野：scrollIntoView 会顺带横向滚动（行比视口宽），
  // 用户正在看右侧的列时，按一下方向键表格就跳回最左边。
  const focusRowAt = useCallback((index: number) => {
    const list = bodyRef.current?.querySelectorAll<HTMLElement>("tr[data-row-key]");
    const viewportElement = viewportRef.current;
    if (!list || list.length === 0 || !viewportElement) return;
    const target = list[Math.max(0, Math.min(list.length - 1, index))];
    target.focus({ preventScroll: true });
    const headHeight = viewportElement.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = target.offsetTop;
    const bottom = top + target.offsetHeight;
    if (top - headHeight < viewportElement.scrollTop) {
      viewportElement.scrollTop = top - headHeight;
    } else if (bottom > viewportElement.scrollTop + viewportElement.clientHeight) {
      viewportElement.scrollTop = bottom - viewportElement.clientHeight;
    }
  }, []);

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>, key: string, index: number) => {
      if (event.target !== event.currentTarget) return;
      switch (event.key) {
        case "ArrowDown":
          focusRowAt(index + 1);
          break;
        case "ArrowUp":
          focusRowAt(index - 1);
          break;
        case "Home":
          focusRowAt(0);
          break;
        case "End":
          focusRowAt(keys.length - 1);
          break;
        case " ":
          if (selectable) toggleRow(key, event.shiftKey);
          else if (onRowClick && !expandable) onRowClick(displayRows[index]);
          else return;
          break;
        case "Enter":
          if (expandable) toggleExpand(key);
          else if (onRowClick) onRowClick(displayRows[index]);
          else return;
          break;
        case "Escape":
          if (expandedKeys?.has(key)) toggleExpand(key);
          else if (selectedCount > 0) clearSelection();
          else return;
          break;
        case "a":
        case "A":
          if (!selectable || !(event.metaKey || event.ctrlKey)) return;
          setSelection(new Set([...(selectedKeys ?? []), ...keys]));
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [
      clearSelection,
      displayRows,
      expandable,
      expandedKeys,
      focusRowAt,
      keys,
      onRowClick,
      selectable,
      selectedCount,
      selectedKeys,
      setSelection,
      toggleExpand,
      toggleRow,
    ],
  );

  // 焦点所在的行没了（翻页、筛选）就回到第一行，保证表格始终有一个可 Tab 进入的行。
  const effectiveFocusedKey =
    focusedKey && keys.includes(focusedKey) ? focusedKey : (keys[0] ?? null);

  // ---------- 列宽：双击把手按内容自适应 ----------
  const autoFit = useCallback(
    (columnId: string) => {
      const viewportElement = viewportRef.current;
      if (!viewportElement) return;
      const selector =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(columnId)
          : columnId;
      let overflow = 0;
      for (const cell of viewportElement.querySelectorAll<HTMLElement>(
        `[data-col="${selector}"]`,
      )) {
        for (const node of [cell, ...cell.querySelectorAll<HTMLElement>("*")]) {
          overflow = Math.max(overflow, node.scrollWidth - node.clientWidth);
        }
      }
      // 有被截断的内容就加宽到刚好放下；什么都放得下就回到默认宽度。
      if (overflow > 1) {
        sizing.setWidth(
          columnId,
          (sizing.designWidths[columnId] ?? 0) + overflow / viewport.scale + 6,
        );
      } else {
        sizing.setWidth(columnId, null);
      }
    },
    [sizing, viewport.scale],
  );

  // ---------- 表头菜单 ----------
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

  // ---------- 拖宽时的参考线与宽度角标 ----------
  const resizingColumn = sizing.resizing
    ? visibleColumns.find((column) => column.id === sizing.resizing?.columnId)
    : undefined;
  let guideX: number | null = null;
  let badgeX: number | null = null;
  let guideUnderPinned = false;
  if (resizingColumn) {
    const width = layout.widths[resizingColumn.id] ?? 0;
    if (resizingColumn.pin === "start") {
      guideX = (layout.startOffsets[resizingColumn.id] ?? 0) + width;
    } else if (resizingColumn.pin === "end") {
      guideX = viewport.width - (layout.endOffsets[resizingColumn.id] ?? 0) - width;
    } else {
      let left = 0;
      for (const column of [...leadingColumns, ...visibleColumns]) {
        if (column.id === resizingColumn.id) break;
        left += layout.widths[column.id] ?? 0;
      }
      guideX = left + width - (viewportRef.current?.scrollLeft ?? 0);
      // 普通列的右缘可能已经滚到冻结列底下（例如滚到最右、把最后一列往操作列下面拖）：
      // 那里看不到列的边，参考线画上去会压在冻结列上、像是在拖冻结列，所以只在中间可滚动的那一段画线。
      // 宽度角标照常显示，收进这一段里，拖到哪里都读得到当前宽度。
      const laneStart = layout.startPinnedWidth;
      const laneEnd = viewport.width - layout.endPinnedWidth;
      guideUnderPinned = guideX < laneStart - 0.5 || guideX > laneEnd + 0.5;
      badgeX = Math.min(Math.max(guideX, laneStart + 32), Math.max(laneStart + 32, laneEnd - 32));
    }
    badgeX ??= guideX;
  }

  const rowHeightPx = ROW_HEIGHT_REM[density] * 16 * viewport.scale;
  const bodyHeight = Math.max(0, viewport.height - viewport.headerHeight);
  const skeletonRows = fill ? Math.max(5, Math.ceil(bodyHeight / Math.max(1, rowHeightPx))) : 5;
  const stateHeight = fill ? Math.max(180, bodyHeight) : EMBEDDED_STATE_HEIGHT;
  const selectionBarLeft =
    (layout.startOffsets[GRID_SELECT_COLUMN_ID] ?? 0) + (layout.widths[GRID_SELECT_COLUMN_ID] ?? 0);
  const interactive = selectable || expandable || Boolean(onRowClick) || Boolean(rowReorder);
  const columnDrag = columnOrder.drag;
  const resolvedLines = useGridLines(id, lines);

  const viewportStyle: CSSProperties = {
    ["--grid-head-h" as string]: `${viewport.headerHeight}px`,
    ...(fill ? null : { maxHeight: maxHeight ?? "100%" }),
  };

  return (
    <div
      ref={rootRef}
      className={[
        "cp-grid group/grid relative flex min-w-0 flex-col",
        // 外框使用 Satin 原生 .sn-tbl-wrap（16px 大圆角 + 1px 细边 + 纯净 raised 表面）
        frame ? "sn-tbl-wrap cp-grid-frame isolate overflow-hidden" : "",
        density === "compact" ? "sn-compact" : "",
        fill ? "sn-tbl-fill h-full min-h-0 flex-1" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-fill={fill ? "true" : "false"}
      data-density={density}
      data-lines={resolvedLines}
    >
      <div
        ref={areaRef}
        className={`relative flex min-w-0 flex-col ${fill ? "min-h-0 flex-1" : ""}`}
      >
        <div
          ref={viewportRef}
          className={`cp-grid-viewport min-w-0 overflow-auto ${fill ? "min-h-0 flex-1" : ""}`}
          style={viewportStyle}
          tabIndex={-1}
        >
          <table
            className="sn-tbl cp-grid-table"
            style={{ width: layout.totalWidth || "100%" }}
            role={interactive ? "grid" : undefined}
            aria-label={label}
            aria-busy={loading || undefined}
            aria-multiselectable={selectable || undefined}
          >
            <colgroup>
              {[...leadingColumns, ...visibleColumns].map((column) => (
                <col key={column.id} style={{ width: layout.widths[column.id] }} />
              ))}
            </colgroup>
            <DataGridHeader
              columns={visibleColumns}
              layout={layout}
              designWidths={sizing.designWidths}
              density={density}
              selectable={selectable}
              expandable={expandable}
              selectionState={selectionState}
              selectionDisabled={status !== "rows"}
              onToggleAll={toggleAll}
              sort={activeSort}
              onSortClick={canSort ? onSortClick : undefined}
              filters={filters}
              openMenuColumnId={menu?.columnId ?? null}
              onOpenMenu={(column, anchor) =>
                setMenu((current) =>
                  current?.columnId === column.id ? null : { columnId: column.id, anchor },
                )
              }
              resizingColumnId={sizing.resizing?.columnId ?? null}
              onResizeStart={sizing.startResize}
              onResizeBy={sizing.resizeBy}
              onAutoFit={autoFit}
              resizableDefault={resizable}
              columnGrip={{
                isMovable: columnOrder.isMovable,
                onPointerDown: columnOrder.startDrag,
                onKeyDown: columnOrder.onGripKeyDown,
              }}
              draggingColumnId={columnDrag?.columnId ?? null}
              rowGrip={Boolean(rowReorder)}
            />
            <RowSlide bodyRef={bodyRef} order={rowMoves.order} reduceMotion={Boolean(reduceMotion)} />
            <DataGridBody
              bodyRef={bodyRef}
              columns={visibleColumns}
              layout={layout}
              density={density}
              rows={rowMoves.rows}
              rowKey={rowKey}
              selectable={selectable}
              selectedKeys={selectedKeys}
              onToggleRow={toggleRow}
              expandable={expandable}
              expandedKeys={expandedKeys}
              onToggleExpand={toggleExpand}
              renderExpanded={renderExpanded}
              sortColumnId={activeSort?.columnId ?? null}
              status={status}
              skeletonRows={skeletonRows}
              empty={empty}
              error={error}
              onRetry={onRetry}
              stateHeight={stateHeight}
              viewportWidth={viewport.width}
              focusedKey={effectiveFocusedKey}
              onFocusRow={setFocusedKey}
              onRowKeyDown={onRowKeyDown}
              motion={rowMoves}
              dimmed={loading && rows.length > 0}
              onRowClick={onRowClick}
              isRowActive={isRowActive}
              rowClassName={rowClassName}
              rowTone={rowTone}
              rowLabel={rowLabel}
              rowGrip={
                rowReorder
                  ? {
                      enabled: Boolean(!rowReorder.disabled && !activeSort),
                      draggingKey: rowDrag.drag?.key ?? null,
                      onPointerDown: rowDrag.startDrag,
                      onKeyDown: rowDrag.onGripKeyDown,
                    }
                  : null
              }
              draggingColumnId={columnDrag?.columnId ?? null}
            />
          </table>
        </div>

        {/* 已有数据时的加载：表头下沿使用 Satin 原生不确定态进度条，行变淡，框和分页都不动。 */}
        {loading && rows.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-[8]"
            style={{ top: Math.max(0, viewport.headerHeight - 2) }}
          >
            <Progress
              height={2}
              label={t("data_grid.loading")}
              className="!rounded-none !bg-transparent"
            />
          </div>
        ) : null}

        {/* 有选中行时，表头换成选择条（复选框列留在原位，仍可全选 / 取消）。 */}
        <AnimatePresence>
          {selectable && selectedCount > 0 ? (
            <motion.div
              key="selection-bar"
              data-grid-selection-bar=""
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: popoverEnterTransition }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -4, transition: popoverExitTransition }}
              className="absolute right-0 top-0 z-[9] flex items-center gap-3 bg-[var(--grid-head-bg)] pr-3 shadow-[inset_0_-1px_0_var(--sn-line)]"
              style={{ left: selectionBarLeft, height: viewport.headerHeight }}
            >
              <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--sn-label)]">
                {t("data_grid.selected_rows", { count: selectedCount })}
              </span>
              {selectionSummary ? (
                <span className="min-w-0 truncate text-xs text-[var(--sn-label3)]">
                  {selectionSummary({ count: selectedCount, clear: clearSelection })}
                </span>
              ) : null}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {selectionActions?.({ count: selectedCount, clear: clearSelection })}
                <Button size="xs" variant="ghost" onClick={clearSelection}>
                  {t("data_grid.clear_selection")}
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {guideX !== null && sizing.resizing ? (
          <>
            {guideUnderPinned ? null : (
              <div
                aria-hidden="true"
                data-grid-resize-guide
                className="pointer-events-none absolute z-[10] w-0.5 rounded-full bg-[var(--cp-focus)]"
                style={{ left: guideX - 1, top: 0, height: viewport.height }}
              />
            )}
            <div
              aria-hidden="true"
              data-grid-resize-badge
              className="pointer-events-none absolute z-[11] -translate-x-1/2 rounded-md bg-[var(--sn-tip-bg)] px-2 py-0.5 text-2xs font-medium tabular-nums text-[var(--sn-tip-fg)] shadow-pop"
              style={{ left: badgeX ?? guideX, top: viewport.headerHeight + 8 }}
            >
              {t("data_grid.width_px", {
                width: Math.round(layout.widths[sizing.resizing.columnId] ?? 0),
              })}
            </div>
          </>
        ) : null}

        {/* 拖动换列：插入线贯穿表头与表体；换行：一道横线落在两行之间。 */}
        {columnDrag?.indicatorX != null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-[10] w-0.5 rounded-full bg-[var(--cp-focus)] transition-[left] duration-100 ease-soft"
            style={{ left: columnDrag.indicatorX - 1, height: viewport.height }}
          />
        ) : null}
        {rowDrag.drag?.indicatorY != null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 z-[10] h-0.5 rounded-full bg-[var(--cp-focus)] transition-[top] duration-100 ease-soft"
            style={{ top: rowDrag.drag.indicatorY - 1 }}
          />
        ) : null}

        <GridScrollbar
          axis="y"
          viewportRef={viewportRef}
          className="right-0.5 z-[8] opacity-0 transition-opacity duration-200 group-hover/grid:opacity-100 group-data-[scrolling=true]/grid:opacity-100 data-[dragging=true]:opacity-100"
          style={{ top: viewport.headerHeight + 4, bottom: 4 }}
        />
      </div>

      {/* 横向滚动条单独占一条通道：夹在左右冻结区之间，不压最后一行。 */}
      {viewport.xOverflow ? (
        <div className="relative h-3 shrink-0" data-grid-x-lane="">
          <GridScrollbar
            axis="x"
            viewportRef={viewportRef}
            pinnedSize={layout.startPinnedWidth + layout.endPinnedWidth}
            style={{
              left: layout.startPinnedWidth + 6,
              right: layout.endPinnedWidth + 6,
              top: 0,
            }}
          />
        </div>
      ) : null}

      {footer ? (
        <div className={frame ? "cp-grid-footer shrink-0 px-4 py-2.5" : "shrink-0 pt-2.5"}>
          {footer}
        </div>
      ) : null}

      {/* 不用 role="status"：页面自己常有一个状态区，两个同角色的区域会互相抢。 */}
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

      {/* 跟着指针走的列名标签，和拖宽时的宽度角标同一个样式。 */}
      {columnDrag && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[1000] rounded-md bg-[var(--sn-tip-bg)] px-2.5 py-1 text-xs font-medium text-[var(--sn-tip-fg)] shadow-pop"
              style={{ left: columnDrag.pointerX + 12, top: columnDrag.pointerY + 14 }}
            >
              {columnDrag.header}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
