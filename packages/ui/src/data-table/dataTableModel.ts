import type { CSSProperties } from "react";

export const DEFAULT_ROW_HEIGHT = 44;
export const DEFAULT_OVERSCAN = 12;
export const DEFAULT_SCROLL_THRESHOLD = 100;
export const DEFAULT_BOTTOM_DEBOUNCE_MS = 120;
export const COLUMN_WIDTH_STORAGE_PREFIX = "codeProxy.dataTable.columnWidths.v1";
export const COLUMN_RESIZE_DEBUG_STORAGE_KEY = "codeProxy.dataTable.debugResize";
export const DEFAULT_MIN_COLUMN_WIDTH = 72;
export const DEFAULT_MAX_COLUMN_WIDTH = 640;
export const COLUMN_RESIZE_PREVIEW_LINE_WIDTH = 2;
export const STICKY_EDGE_SHADOW_WIDTH = 28;
export const NON_RESIZABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);
export const TAILWIND_SPACING_UNIT_PX = 4;

export const COLUMN_ORDER_STORAGE_PREFIX = "codeProxy.dataTable.columnOrder.v1";
export const COLUMN_REORDER_ACTIVATION_DELAY_MS = 90;
export const COLUMN_REORDER_MIN_DRAG_DISTANCE_PX = 4;
export const COLUMN_REORDER_AUTOSCROLL_EDGE_PX = 72;
export const COLUMN_REORDER_AUTOSCROLL_MAX_PX_PER_FRAME = 22;
export const COLUMN_REORDER_SHIFT_TRANSITION = "transform 72ms cubic-bezier(0.2, 0, 0, 1)";
export const COLUMN_REORDER_SETTLE_CLEANUP_MS = 110;
export const COLUMN_REORDER_SETTLE_FEEDBACK_MS = 900;
export const NON_REORDERABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);

export const ROW_REORDER_COLUMN_KEY = "__data-table-row-reorder__";
export const ROW_REORDER_MIN_DRAG_DISTANCE_PX = 4;
export const ROW_REORDER_AUTOSCROLL_EDGE_PX = 56;
export const ROW_REORDER_AUTOSCROLL_MAX_PX_PER_FRAME = 18;

export type ColumnOrder = string[];
export type ColumnWidthMap = Record<string, number>;

export interface ColumnReorderGeometry {
  key: string;
  index: number;
  left: number;
  width: number;
  elements: HTMLElement[];
  appliedDragging: boolean;
  appliedShift: number | null;
  appliedTransform: string;
}

export interface ColumnReorderState {
  pointerId: number;
  columnKey: string;
  originIndex: number;
  currentToIndex: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  lastClientX: number;
  lastClientY: number;
  activated: boolean;
  activationTimer: number | null;
  allowedMinIndex: number;
  allowedMaxIndex: number;
  columns: ColumnReorderGeometry[];
  draggedWidth: number;
}

export interface RowReorderGeometry {
  index: number;
  element: HTMLTableRowElement;
  appliedShift: number;
}

export interface RowReorderState {
  pointerId: number;
  fromIndex: number;
  insertionIndex: number;
  startClientY: number;
  lastClientY: number;
  activated: boolean;
  scrollContainer: HTMLElement | null;
  sourceRow: HTMLTableRowElement | null;
  previewElement: HTMLDivElement | null;
  grabOffsetY: number;
  previewHeight: number;
  sourceHeight: number;
  rows: RowReorderGeometry[];
}

export interface ColumnResizeState {
  pointerId: number;
  columnKey: string;
  startLeftClientX: number;
  pointerBoundaryOffsetClientX: number;
  minWidth: number;
  maxWidth: number;
  previewTop: number;
  previewBottom: number;
  previewMinClientX: number;
  previewMaxClientX: number;
  currentWidth: number;
  lastDebugAtMs: number;
  debugEnabled: boolean;
}

export interface ColumnResizePreview {
  width: number;
  left: number;
  top: number;
  height: number;
  tooltipTop: number;
  visible: boolean;
}

export interface ScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

export type StickyColumnPlacement = {
  edge: "start" | "end";
  offset: number;
};

export type DataTableColumnStyle = CSSProperties & {
  "--vt-sticky-left"?: string;
  "--vt-sticky-right"?: string;
};
