import type { CSSProperties } from "react";

export const DEFAULT_ROW_HEIGHT = 44;
export const DEFAULT_OVERSCAN = 12;
export const DEFAULT_SCROLL_THRESHOLD = 100;
export const DEFAULT_BOTTOM_DEBOUNCE_MS = 120;
// v2：列宽默认值整体按语义令牌重排（见 columnWidths.ts），v1 里的拖拽结果是针对旧默认值的。
// v3：表格不再把各列按比例拉伸，剩余宽度只给弹性列（见 columnLayout.ts 的 resolveFlexColumnKey）。
// v2 存的是从拉伸后的宽度起算的像素：在宽屏上拖一下（以前只点一下手柄也算）就把拉伸宽度
// 存死了，回到窄窗口加起来超过容器，表格横向溢出，右边的列整列压在固定的操作列下面
// （2026-11 租户页：存着租户 553px、到期时间 431px，五列默认只要 734px）。这些值还原不出
// 用户真正想要的宽度，所以换 key 作废，读取时把同一张表的旧 key 一并删掉。
export const COLUMN_WIDTH_STORAGE_PREFIX = "codeProxy.dataTable.columnWidths.v3";
export const LEGACY_COLUMN_WIDTH_STORAGE_PREFIXES = [
  "codeProxy.dataTable.columnWidths.v1",
  "codeProxy.dataTable.columnWidths.v2",
] as const;
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
  /** 按下手柄时的宽度：松手时没变就不写存储，免得一次点击把当前宽度钉成列宽。 */
  startWidth: number;
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
