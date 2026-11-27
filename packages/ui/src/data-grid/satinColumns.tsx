import type { KeyboardEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import { Icon } from "satin-ui/react";
import type { TableColumnReact } from "satin-ui/react";
import { OverflowTooltip } from "../overlays/Tooltip";
import { GridCellTooltip } from "./GridCellTooltip";
import { resolveCellTooltip } from "./gridCellText";
import {
  DEFAULT_MAX_COLUMN_WIDTH,
  DEFAULT_MIN_COLUMN_WIDTH,
  firstSortDirection,
  isGridFilterActive,
} from "./gridModel";
import type { DataGridColumn, GridFilters, GridSort } from "./types";

const ALIGN_INNER: Record<"start" | "center" | "end", string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

function HeaderLabel({
  header,
  hint,
  focusable = false,
}: {
  header: string;
  hint?: ReactNode;
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
        <span className="truncate underline decoration-sn-label-off decoration-dotted underline-offset-[3px]">
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

function CellContent({ content, tooltip }: { content: ReactNode; tooltip: string | null }) {
  const body =
    typeof content === "string" || typeof content === "number" ? (
      <span className="min-w-0 truncate">{content}</span>
    ) : (
      content
    );
  if (!tooltip) return <>{body}</>;
  return (
    <GridCellTooltip overflowOnly content={tooltip}>
      {body}
    </GridCellTooltip>
  );
}

export interface BuildSatinColumnsOptions<T> {
  columns: readonly DataGridColumn<T>[];
  scale: number;
  layoutWidths: Record<string, number>;
  designWidths: Record<string, number>;
  resizable: boolean;
  reorderEnabled: boolean;
  canSort: boolean;
  activeSort: GridSort | null;
  filters?: GridFilters;
  hasFiltersChange: boolean;
  openMenuColumnId?: string;
  idBase: string;
  rowKey: (row: T) => string;
  selectedKeys?: ReadonlySet<string>;
  expandedKeys?: ReadonlySet<string>;
  onSortClick: (column: DataGridColumn<T>) => void;
  onColumnGripKeyDown: (column: DataGridColumn<T>, event: KeyboardEvent<HTMLElement>) => void;
  onToggleFilterMenu: (columnId: string, anchor: HTMLElement) => void;
  t: TFunction;
}

/**
 * 将 DataGrid 列定义转换为 Satin 原生 TableColumnReact 描述，
 * 保留表头排序、分面筛选按钮、拖列把手、溢出提示与单元格渲染契约。
 */
export function buildSatinColumns<T>({
  columns,
  scale,
  layoutWidths,
  designWidths,
  resizable,
  reorderEnabled,
  canSort,
  activeSort,
  filters,
  hasFiltersChange,
  openMenuColumnId,
  idBase,
  rowKey,
  selectedKeys,
  expandedKeys,
  onSortClick,
  onColumnGripKeyDown,
  onToggleFilterMenu,
  t,
}: BuildSatinColumnsOptions<T>): TableColumnReact<T>[] {
  const currentScale = scale || 1;
  return columns.map((column) => {
    const align = column.align ?? "start";
    const satinAlign = align === "end" ? "right" : align === "center" ? "center" : "left";
    const fixed = column.pin === "start" ? "left" : column.pin === "end" ? "right" : undefined;
    const colResizable = column.resizable ?? resizable;
    const movable = reorderEnabled && !column.pin && column.reorderable !== false;
    const sortable = Boolean(column.sortable && canSort);
    const direction = activeSort?.columnId === column.id ? activeSort.direction : null;
    const filterActive = isGridFilterActive(filters?.[column.id]);
    const menuOpen = openMenuColumnId === column.id;
    const hintId = column.headerHint ? `${idBase}-hint-${column.id}` : undefined;

    return {
      key: column.id,
      title: column.header,
      ariaLabel: column.header,
      align: satinAlign,
      width: layoutWidths[column.id],
      minWidth: Math.round((column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH) * currentScale),
      maxWidth: Math.round((column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH) * currentScale),
      designWidth: designWidths[column.id],
      minDesignWidth: column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH,
      maxDesignWidth: column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH,
      resizeLabel: t("data_grid.resize_column", { column: column.header }),
      skeleton: column.skeleton,
      sortable,
      sortFirst: firstSortDirection(column),
      resizable: colResizable,
      reorderable: movable,
      fixed,
      className: column.className,
      headerRender: () => (
        <div
          className={[
            "group/head relative flex h-full w-full min-w-0 items-center",
            ALIGN_INNER[align],
            filterActive ? (align === "end" ? "pl-6" : "pr-6") : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {movable ? (
            <button
              type="button"
              data-grid-col-grip=""
              aria-label={t("common.reorder_column", { column: column.header })}
              title={t("common.reorder_column", { column: column.header })}
              onKeyDown={(event) => onColumnGripKeyDown(column, event)}
              className="sn-grip absolute left-1/2 top-0 z-[2] !h-3 !w-7 -translate-x-1/2 rounded-b-md opacity-0 focus-visible:opacity-100 group-hover/head:opacity-100"
            >
              <Icon name="grip-vertical" size={12} className="rotate-90" />
            </button>
          ) : null}
          {column.hideHeaderLabel ? (
            <span className="sr-only">{column.header}</span>
          ) : sortable ? (
            <button
              type="button"
              aria-describedby={hintId}
              onClick={() => onSortClick(column)}
              className={[
                "sn-sort min-w-0 max-w-full",
                direction ? "sn-on" : "",
                direction === "desc" ? "sn-desc" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <HeaderLabel header={column.header} hint={column.headerHint} />
              <Icon name="arrow-up" size={12} />
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
              data-no-drag=""
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
          {column.filter && hasFiltersChange ? (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              data-no-drag=""
              data-grid-no-drag=""
              aria-label={t("data_grid.filter_column", { column: column.header })}
              data-active={filterActive ? "true" : undefined}
              onClick={(event) => onToggleFilterMenu(column.id, event.currentTarget)}
              className={[
                "sn-btn sn-ghost sn-sm sn-ibtn sn-round absolute top-1/2 z-[1] !h-6 !w-6 -translate-y-1/2",
                align === "end" ? "left-0" : "right-0",
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
      ),
      render: (_value, row, ctx) => {
        const key = rowKey(row);
        const selected = selectedKeys?.has(key) ?? false;
        const expanded = expandedKeys?.has(key) ?? false;
        const content = column.cell(row, { rowIndex: ctx.index, selected, expanded });
        return (
          <div
            data-cell-inner=""
            className={`flex min-w-0 items-center overflow-hidden ${ALIGN_INNER[align]}`}
          >
            <CellContent content={content} tooltip={resolveCellTooltip(column, row, content)} />
          </div>
        );
      },
    };
  });
}
