import { type ReactNode } from "react";

export type DataTableSortDirection = "asc" | "desc";

export interface DataTableSortState {
  columnKey: string;
  direction: DataTableSortDirection;
}

export type DataTableSortValue = string | number | null | undefined;

export interface DataTableColumnSort<T> {
  /** Value used by the built-in stable sorter. */
  getValue: (row: T, index: number) => DataTableSortValue;
  /** Optional row comparator. The table applies the active direction. */
  compare?: (left: T, right: T) => number;
}

export type DataTableRowsChangeAction =
  | {
      type: "sort";
      sort: DataTableSortState;
    }
  | {
      type: "row-reorder";
      fromIndex: number;
      toIndex: number;
    };

/** Column definition for DataTable */
export interface DataTableColumn<T> {
  /** Unique key for this column */
  key: string;
  /** Header label */
  label: string;
  /** Fixed width class (Tailwind), e.g. "w-52" */
  width?: string;
  /** Whether users can drag this column's right edge to resize it. */
  resizable?: boolean;
  /** Whether users can reorder this column by dragging its handle. */
  reorderable?: boolean;
  /** Pin this column to the start or end of the table, preventing it from being reordered. */
  lockOrder?: "start" | "end";
  /** Minimum drag-resize width in px. */
  minWidthPx?: number;
  /** Maximum drag-resize width in px. */
  maxWidthPx?: number;
  /** Extra header class (e.g. "text-right") */
  headerClassName?: string;
  /** Extra class applied to the table cell. */
  cellClassName?: string;
  /** Extra class applied to the clipped cell content; defaults to cellClassName for compatibility. */
  cellContentClassName?: string;
  /** Overflow tooltip text for a truncated cell. Primitive render output is used by default. */
  overflowTooltip?: boolean | ((row: T, index: number) => string | null | undefined);
  /** Built-in sort menu configuration. Omit to keep the column unsortable. */
  sort?: DataTableColumnSort<T>;
  /** Custom header render function (overrides label) */
  headerRender?: () => ReactNode;
  /** Render function for cell content */
  render: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  /** Stable id used to keep each table's column widths isolated in localStorage. */
  tableId?: string;
  /** Row data array */
  rows: readonly T[];
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Unique key extractor for each row */
  rowKey: (row: T, index: number) => string;
  /** Whether the initial data is loading */
  loading?: boolean;
  /** Whether more data is available for infinite scroll */
  hasMore?: boolean;
  /** Whether a next-page load is in progress */
  loadingMore?: boolean;
  /** Callback when scrolled near bottom (triggers next page load) */
  onScrollBottom?: () => void;
  /** Legacy row windowing mode. Most management tables keep this disabled for finite row sets. */
  virtualize?: boolean;
  /** Row height in px (default 44) */
  rowHeight?: number;
  /** Overscan rows above/below viewport (default 12) */
  overscan?: number;
  /** Distance from bottom to trigger onScrollBottom (default 100) */
  scrollThreshold?: number;
  /** Debounce ms before triggering onScrollBottom (default 120) */
  bottomDebounceMs?: number;
  /** Minimum table width class (default "min-w-[1320px]") */
  minWidth?: string;
  /** Container height class (default "h-[calc(100dvh-260px)]") */
  height?: string;
  /** Container minimum height class (default "min-h-[360px]") */
  minHeight?: string;
  /** Screen-reader caption */
  caption?: string;
  /** Empty state message */
  emptyText?: string;
  /** Show the "all records loaded" footer when there is no next page. */
  showAllLoadedMessage?: boolean;
  /** Show a straight divider between data rows. */
  rowDividers?: boolean;
  /** Extra row className */
  rowClassName?: string | ((row: T, index: number) => string);
  /** Optional row click handler. When set, rows become keyboard-focusable selection targets. */
  onRowClick?: (row: T, index: number) => void;
  /** Optional selected state for row interaction semantics. */
  rowAriaSelected?: (row: T, index: number) => boolean;
  /** Forward wheel scrolling to a scrollable parent when this table is already at an edge. */
  allowWheelPropagationAtBoundary?: boolean;
  /** Render the table in normal document flow without any internal table scrollbars. */
  naturalFlow?: boolean;
  /** Extra class for the content wrapper inside the scroll viewport (e.g. "pr-5" for right padding). */
  scrollContentClassName?: string;
  /** Whether users can resize columns by dragging header boundaries (default true). */
  columnResizable?: boolean;
  /** Whether column reorder by dragging the header handle is allowed (default true when tableId is set). */
  columnReorderable?: boolean;
  /** Whether column order is persisted to localStorage (default true). */
  persistColumnOrder?: boolean;
  /** Controlled active sort state. Omit to let DataTable manage the icon state. */
  sortState?: DataTableSortState | null;
  /** Initial sort state for an uncontrolled table. */
  defaultSortState?: DataTableSortState | null;
  /** Called whenever a column sort is selected or row dragging clears the current sort. */
  onSortStateChange?: (sort: DataTableSortState | null) => void;
  /** Enable the built-in row drag handle. Requires onRowsChange to persist the new order. */
  rowReorderable?: boolean;
  /** Receives rows in their new order after sorting or row dragging. */
  onRowsChange?: (rows: T[], action: DataTableRowsChangeAction) => void;
}
