import { Icon } from "satin-ui/react";
import {
  useId,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "../primitives/Checkbox";
import { OverflowTooltip } from "../overlays/Tooltip";
import { GridCellTooltip } from "./GridCellTooltip";
import {
  DEFAULT_MAX_COLUMN_WIDTH,
  DEFAULT_MIN_COLUMN_WIDTH,
  isGridFilterActive,
  type GridColumnLayout,
  type GridSelectionState,
} from "./gridModel";
import {
  GRID_EXPAND_COLUMN_ID,
  GRID_REORDER_COLUMN_ID,
  GRID_SELECT_COLUMN_ID,
  HEAD_HEIGHT,
  cellPadding,
} from "./gridLayout";
import type { DataGridColumn, GridDensity, GridFilters, GridSort } from "./types";

export function pinStyle(
  columnId: string,
  pin: "start" | "end" | undefined,
  layout: GridColumnLayout,
): CSSProperties | undefined {
  if (pin === "start") return { left: layout.startOffsets[columnId] ?? 0 };
  if (pin === "end") return { right: layout.endOffsets[columnId] ?? 0 };
  return undefined;
}

export function pinEdge(columnId: string, layout: GridColumnLayout): "start" | "end" | undefined {
  if (columnId === layout.startEdgeId) return "start";
  if (columnId === layout.endEdgeId) return "end";
  return undefined;
}

/**
 * 排序箭头贴在文字外侧、绝对定位，不占文字的宽度：窄的数字列（输入、输出）表头本来就只有
 * 两三个字的空间，箭头、筛选按钮再各占一格，文字就被挤成「输…」（旧表格正是这样）。
 */
function SortGlyph({ direction, reverse }: { direction: "asc" | "desc" | null; reverse: boolean }) {
  return (
    <Icon
      name="arrow-up"
      size={12}
      className={[
        "pointer-events-none absolute top-1/2 -translate-y-1/2 transition-[rotate,opacity,color] duration-200 ease-pop",
        reverse ? "right-full mr-0.5" : "left-full ml-0.5",
        direction === "desc" ? "rotate-180" : "",
        direction
          ? "text-[var(--sn-label)] opacity-100"
          : "text-[var(--sn-label3)] opacity-0 group-hover/sort:opacity-70 group-focus-visible/sort:opacity-70",
      ].join(" ")}
    />
  );
}

/**
 * 表头文字。带说明的列在文字下画一条点状下划线，悬停文字看说明（不再单独放一个 ⓘ 图标占宽度）；
 * 没有说明的列只在文字被截断时提示全名。同一处只套一层提示，不会叠出两个气泡。
 */
function HeaderLabel({
  header,
  hint,
  focusable = false,
}: {
  header: string;
  hint?: ReactNode;
  /** 不在按钮里（不可排序）时自己可聚焦：键盘也能打开说明。 */
  focusable?: boolean;
}) {
  if (hint) {
    return (
      <GridCellTooltip
        focusable={focusable}
        placement="top"
        content={
          <span className="block max-w-[18rem]">
            <span className="mb-0.5 block text-xs font-semibold">{header}</span>
            <span className="block text-xs opacity-75">{hint}</span>
          </span>
        }
      >
        <span className="truncate underline decoration-ink-4 decoration-dotted underline-offset-[3px]">
          {header}
        </span>
      </GridCellTooltip>
    );
  }
  return (
    <OverflowTooltip content={header} className="block min-w-0 truncate">
      {header}
    </OverflowTooltip>
  );
}

/** 表头拖动换列（columnReorder 开启时）。 */
export interface GridColumnGripProps<T> {
  isMovable: (column: DataGridColumn<T>) => boolean;
  onPointerDown: (
    column: DataGridColumn<T>,
    event: ReactPointerEvent<HTMLElement>,
    fromGrip: boolean,
  ) => void;
  onKeyDown: (column: DataGridColumn<T>, event: KeyboardEvent<HTMLElement>) => void;
}

interface HeaderProps<T> {
  columns: readonly DataGridColumn<T>[];
  layout: GridColumnLayout;
  designWidths: Record<string, number>;
  density: GridDensity;
  selectable: boolean;
  expandable: boolean;
  selectionState: GridSelectionState;
  selectionDisabled: boolean;
  onToggleAll: () => void;
  sort: GridSort | null | undefined;
  onSortClick?: (column: DataGridColumn<T>) => void;
  filters: GridFilters | undefined;
  openMenuColumnId: string | null;
  onOpenMenu?: (column: DataGridColumn<T>, anchor: HTMLElement) => void;
  resizingColumnId: string | null;
  onResizeStart: (columnId: string, event: ReactPointerEvent<HTMLElement>, invert: boolean) => void;
  onResizeBy: (columnId: string, delta: number) => void;
  onAutoFit: (columnId: string) => void;
  /** 列上没写 resizable 时是否可拖宽。 */
  resizableDefault: boolean;
  columnGrip: GridColumnGripProps<T> | null;
  draggingColumnId: string | null;
  /** 行首有拖动把手列。 */
  rowGrip: boolean;
}

export function DataGridHeader<T>({
  columns,
  layout,
  designWidths,
  density,
  selectable,
  expandable,
  selectionState,
  selectionDisabled,
  onToggleAll,
  sort,
  onSortClick,
  filters,
  openMenuColumnId,
  onOpenMenu,
  resizingColumnId,
  onResizeStart,
  onResizeBy,
  onAutoFit,
  resizableDefault,
  columnGrip,
  draggingColumnId,
  rowGrip,
}: HeaderProps<T>) {
  const { t } = useTranslation();
  const idBase = useId();
  const headHeight = HEAD_HEIGHT[density];
  const hasLeading = selectable || expandable || rowGrip;

  const onHandleKeyDown = (column: DataGridColumn<T>, event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const direction = column.pin === "end" ? -1 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      onResizeBy(column.id, (event.key === "ArrowRight" ? step : -step) * direction);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onAutoFit(column.id);
    }
  };

  return (
    <thead>
      <tr className="cp-grid-head-row">
        {rowGrip ? (
          <th
            scope="col"
            data-pin="start"
            data-pin-edge={pinEdge(GRID_REORDER_COLUMN_ID, layout)}
            className={`cp-grid-head-cell p-0 ${headHeight}`}
            style={pinStyle(GRID_REORDER_COLUMN_ID, "start", layout)}
          >
            <span className="flex h-full items-center justify-center text-[var(--sn-label3)]">
              <Icon name="grip-vertical" size={14} />
              <span className="sr-only">{t("common.row_order")}</span>
            </span>
          </th>
        ) : null}
        {selectable ? (
          <th
            scope="col"
            data-pin="start"
            data-pin-edge={pinEdge(GRID_SELECT_COLUMN_ID, layout)}
            className={`cp-grid-head-cell p-0 ${headHeight}`}
            style={pinStyle(GRID_SELECT_COLUMN_ID, "start", layout)}
          >
            <div className="flex h-full items-center justify-center">
              <Checkbox
                checked={selectionState === "all"}
                indeterminate={selectionState === "some"}
                onCheckedChange={onToggleAll}
                disabled={selectionDisabled}
                aria-label={t("data_grid.select_page")}
              />
            </div>
          </th>
        ) : null}
        {expandable ? (
          <th
            scope="col"
            data-pin="start"
            data-pin-edge={pinEdge(GRID_EXPAND_COLUMN_ID, layout)}
            className={`cp-grid-head-cell p-0 ${headHeight}`}
            style={pinStyle(GRID_EXPAND_COLUMN_ID, "start", layout)}
          >
            <span className="sr-only">{t("data_grid.details")}</span>
          </th>
        ) : null}
        {columns.map((column, index) => {
          const align = column.align ?? "start";
          const direction = sort?.columnId === column.id ? sort.direction : null;
          const filterActive = isGridFilterActive(filters?.[column.id]);
          const menuOpen = openMenuColumnId === column.id;
          const resizable = column.resizable ?? resizableDefault;
          const reverse = align === "end";
          const sortable = Boolean(column.sortable && onSortClick);
          const movable = columnGrip?.isMovable(column) ?? false;
          // 说明文字给读屏：排序按钮或可聚焦的表头文字用 aria-describedby 指向它。
          const hintId = column.headerHint ? `${idBase}-hint-${index}` : undefined;
          return (
            <th
              key={column.id}
              scope="col"
              data-col={column.id}
              data-pin={column.pin}
              data-pin-edge={pinEdge(column.id, layout)}
              aria-sort={
                direction === "asc"
                  ? "ascending"
                  : direction === "desc"
                    ? "descending"
                    : column.sortable
                      ? "none"
                      : undefined
              }
              data-dragging={draggingColumnId === column.id ? "true" : undefined}
              // 表头的可访问名称就是列名：拖宽把手、换列把手各有自己的名字，不并进列名里。
              aria-label={column.header}
              className={`cp-grid-head-cell group/head select-none p-0 text-left font-normal ${headHeight}`}
              style={pinStyle(column.id, column.pin, layout)}
            >
              {movable ? (
                // 把手在表头上沿正中，悬停或聚焦才出现，不占文字的宽度；整个表头也能直接拖。
                <button
                  type="button"
                  data-grid-col-grip=""
                  aria-label={t("common.reorder_column", { column: column.header })}
                  title={t("common.reorder_column", { column: column.header })}
                  onPointerDown={(event) => columnGrip?.onPointerDown(column, event, true)}
                  onKeyDown={(event) => columnGrip?.onKeyDown(column, event)}
                  className="sn-grip absolute left-1/2 top-0 z-[2] !h-3 !w-7 -translate-x-1/2 rounded-b-md opacity-0 focus-visible:opacity-100 group-hover/head:opacity-100"
                >
                  <Icon name="grip-vertical" size={12} className="rotate-90" />
                </button>
              ) : null}
              <div
                onPointerDown={
                  movable ? (event) => columnGrip?.onPointerDown(column, event, false) : undefined
                }
                className={[
                  "relative flex h-full min-w-0 items-center",
                  cellPadding(index, columns.length, hasLeading),
                  align === "end" ? "justify-end" : align === "center" ? "justify-center" : "",
                  // 筛选生效后按钮常驻，给它让出位置，免得压住窄列的表头文字。
                  filterActive ? (reverse ? "!pl-7" : "!pr-7") : "",
                ].join(" ")}
              >
                {column.hideHeaderLabel ? (
                  <span className="sr-only">{column.header}</span>
                ) : sortable ? (
                  <button
                    type="button"
                    aria-describedby={hintId}
                    onClick={() => onSortClick?.(column)}
                    className={[
                      "sn-sort group/sort relative min-w-0 max-w-full",
                      direction ? "sn-on" : "",
                      direction === "desc" ? "sn-desc" : "",
                      reverse ? "flex-row-reverse" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <HeaderLabel header={column.header} hint={column.headerHint} />
                    <SortGlyph direction={direction} reverse={reverse} />
                  </button>
                ) : (
                  <span
                    className="inline-flex min-w-0 max-w-full text-xs font-medium text-[var(--sn-label3)]"
                    aria-describedby={hintId}
                  >
                    <HeaderLabel header={column.header} hint={column.headerHint} focusable />
                  </span>
                )}
                {column.headerAccessory ? (
                  <span
                    data-grid-no-drag=""
                    className={`inline-flex shrink-0 items-center ${column.hideHeaderLabel ? "" : "ml-1.5"}`}
                  >
                    {column.headerAccessory}
                  </span>
                ) : null}
                {hintId ? (
                  <span id={hintId} hidden>
                    {column.headerHint}
                  </span>
                ) : null}
                {column.filter && onOpenMenu ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                    data-grid-no-drag=""
                    aria-label={t("data_grid.filter_column", { column: column.header })}
                    data-active={filterActive ? "true" : undefined}
                    onClick={(event) => onOpenMenu(column, event.currentTarget)}
                    className={[
                      "sn-btn sn-ghost sn-sm sn-ibtn sn-round absolute top-1/2 z-[1] !h-6 !w-6 -translate-y-1/2",
                      reverse ? "left-0.5" : "right-1",
                      filterActive || menuOpen
                        ? "sn-selected opacity-100"
                        : "opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100",
                    ].join(" ")}
                  >
                    <Icon name="list-filter" size={13} />
                    {filterActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--sn-accent)]"
                      />
                    ) : null}
                  </button>
                ) : null}
              </div>
              {resizable ? (
                <div
                  role="separator"
                  data-grid-no-drag=""
                  aria-orientation="vertical"
                  aria-label={t("data_grid.resize_column", { column: column.header })}
                  aria-valuenow={Math.round(designWidths[column.id] ?? 0)}
                  aria-valuemin={column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH}
                  aria-valuemax={column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH}
                  tabIndex={0}
                  data-active={resizingColumnId === column.id ? "true" : undefined}
                  onPointerDown={(event) => onResizeStart(column.id, event, column.pin === "end")}
                  onDoubleClick={() => onAutoFit(column.id)}
                  onKeyDown={(event) => onHandleKeyDown(column, event)}
                  // 把手整个落在本列之内、贴着列边：每个表头格都是吸顶的独立层叠上下文，
                  // 伸进隔壁列的那一截会被隔壁表头盖住，鼠标按下去落在隔壁列上。
                  className={[
                    "cp-grid-resize-handle group/resize absolute inset-y-0 z-[6] w-2.5 cursor-col-resize touch-none outline-none",
                    column.pin === "end" ? "left-0" : "right-0",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "cp-grid-resize-line pointer-events-none absolute inset-y-3 w-px rounded-full bg-line-strong transition-[background-color,inset,width] duration-150 ease-soft",
                      column.pin === "end" ? "left-0" : "right-0",
                      "group-hover/resize:inset-y-1.5 group-hover/resize:w-0.5 group-hover/resize:bg-[var(--cp-focus)]",
                      "group-focus-visible/resize:inset-y-1.5 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-[var(--cp-focus)]",
                      "group-data-[active=true]/resize:inset-y-0 group-data-[active=true]/resize:w-0.5 group-data-[active=true]/resize:bg-[var(--cp-focus)]",
                    ].join(" ")}
                  />
                </div>
              ) : null}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
