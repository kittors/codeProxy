import type { DataTableColumn } from "./DataTable.types";
import {
  COLUMN_ORDER_STORAGE_PREFIX,
  COLUMN_RESIZE_DEBUG_STORAGE_KEY,
  COLUMN_WIDTH_STORAGE_PREFIX,
  DEFAULT_MAX_COLUMN_WIDTH,
  DEFAULT_MIN_COLUMN_WIDTH,
  NON_RESIZABLE_COLUMN_KEYS,
  TAILWIND_SPACING_UNIT_PX,
  type ColumnOrder,
  type ColumnWidthMap,
} from "./dataTableModel";

export {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_OVERSCAN,
  DEFAULT_SCROLL_THRESHOLD,
  DEFAULT_BOTTOM_DEBOUNCE_MS,
  COLUMN_WIDTH_STORAGE_PREFIX,
  COLUMN_RESIZE_DEBUG_STORAGE_KEY,
  DEFAULT_MIN_COLUMN_WIDTH,
  DEFAULT_MAX_COLUMN_WIDTH,
  COLUMN_RESIZE_PREVIEW_LINE_WIDTH,
  NON_RESIZABLE_COLUMN_KEYS,
  COLUMN_ORDER_STORAGE_PREFIX,
  COLUMN_REORDER_ACTIVATION_DELAY_MS,
  COLUMN_REORDER_MIN_DRAG_DISTANCE_PX,
  NON_REORDERABLE_COLUMN_KEYS,
  type ColumnOrder,
  type ColumnWidthMap,
  type ColumnResizeState,
  type ColumnResizePreview,
  type ScrollMetrics,
} from "./dataTableModel";

export {
  hasHorizontalOverflow,
  hasVerticalOverflow,
  calculateScrollbarThumbs,
} from "./scrollMetrics";

/**
 * Tailwind 的尺寸刻度都是 rem，而面板靠根字号做整体缩放（admin-panel 的
 * `--ui-scale`，外加用户自己在浏览器里调过的默认字号），所以 `w-40` 渲染出来
 * 未必是 160px——0.9 缩放下就是 144px。
 *
 * 这里的换算结果会被拿去给固定列的轨道和边缘阴影做绝对定位。按 16px 硬算时轨道
 * 会比真实列宽多出一截、压到相邻列上：表头是 sticky，盖在轨道之上；数据行是
 * static，会被轨道盖住——同一列的表头和单元格于是在不同位置被截断，阴影也落在
 * 离固定列边缘还有一截的地方。所以刻度必须按实际根字号换算。
 */
const TAILWIND_BASE_ROOT_FONT_SIZE_PX = 16;

let cachedRootFontSizePx: number | null = null;
let rootFontSizeReleaseFrame: number | null = null;

/**
 * 读一次缓存一帧：同一帧里每列、每个单元格都会解析宽度，次次 getComputedStyle
 * 会强制样式重算；跨帧释放则让根字号的变化（切换 `--ui-scale`、用户改浏览器默认
 * 字号、页面缩放）在下一帧自然生效，不需要额外的订阅。
 */
function resolveRootFontSizePx() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return TAILWIND_BASE_ROOT_FONT_SIZE_PX;
  }
  if (cachedRootFontSizePx !== null) return cachedRootFontSizePx;

  const measured = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  cachedRootFontSizePx =
    Number.isFinite(measured) && measured > 0 ? measured : TAILWIND_BASE_ROOT_FONT_SIZE_PX;

  if (rootFontSizeReleaseFrame === null && typeof window.requestAnimationFrame === "function") {
    rootFontSizeReleaseFrame = window.requestAnimationFrame(() => {
      cachedRootFontSizePx = null;
      rootFontSizeReleaseFrame = null;
    });
  }
  return cachedRootFontSizePx;
}

/**
 * 把「设计稿基准（根字号 16px）下的像素」换算成当前根字号下的实际像素。
 * `minWidthPx` / `maxWidthPx` 这类直接写死的 px 也走这里，否则它们和 Tailwind
 * class 推出来的宽度会处在两个尺度上，同一张表的固定列轨道会按列而异地错位。
 */
export function scaleDesignPx(designPx: number) {
  return Math.round((designPx * resolveRootFontSizePx()) / TAILWIND_BASE_ROOT_FONT_SIZE_PX);
}

function parseTailwindSizePx(token: string) {
  const arbitrary = token.match(/^\[(\d+(?:\.\d+)?)(px|rem)\]$/);
  if (arbitrary) {
    const value = Number(arbitrary[1]);
    if (!Number.isFinite(value)) return null;
    // 任意值里的 px 编译成字面像素，本来就不吃根字号；只有 rem 需要换算。
    return arbitrary[2] === "rem"
      ? scaleDesignPx(value * TAILWIND_BASE_ROOT_FONT_SIZE_PX)
      : Math.round(value);
  }
  if (token === "px") return 1;
  const numeric = Number(token);
  if (!Number.isFinite(numeric)) return null;
  return scaleDesignPx(numeric * TAILWIND_SPACING_UNIT_PX);
}

function resolveWidthClassPx(width: string | undefined, prefix: string) {
  if (!width) return null;
  const classes = width.split(/\s+/).filter(Boolean).reverse();
  for (const className of classes) {
    if (!className.startsWith(`${prefix}-`)) continue;
    const parsed = parseTailwindSizePx(className.slice(prefix.length + 1));
    if (parsed !== null) return parsed;
  }
  return null;
}

export function resolveColumnMinWidth<T>(column: DataTableColumn<T>) {
  if (column.minWidthPx !== undefined) return scaleDesignPx(column.minWidthPx);
  return resolveWidthClassPx(column.width, "min-w") ?? scaleDesignPx(DEFAULT_MIN_COLUMN_WIDTH);
}

/**
 * 列没被拖过时的渲染宽度，也就是 `w-*` class 落到 DOM 上的那个值。
 *
 * 固定列的轨道量的是「这一列实际占多宽」，不是「最窄能到多宽」。两者在
 * `w-40 min-w-40` 这种写法下恰好相等，但 `w-[360px] min-w-[280px]` 一写开就差
 * 80px，轨道会短一截，固定列右边缘外露出下层内容。
 */
export function resolveColumnDefaultWidth<T>(column: DataTableColumn<T>) {
  return resolveWidthClassPx(column.width, "w") ?? resolveColumnMinWidth(column);
}

export function resolveColumnMaxWidth<T>(
  column: DataTableColumn<T>,
  minWidth = resolveColumnMinWidth(column),
) {
  return Math.max(minWidth, scaleDesignPx(column.maxWidthPx ?? DEFAULT_MAX_COLUMN_WIDTH));
}

export function clampColumnWidth<T>(column: DataTableColumn<T>, width: number) {
  const minWidth = resolveColumnMinWidth(column);
  const maxWidth = resolveColumnMaxWidth(column, minWidth);
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

export function getColumnWidthStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_WIDTH_STORAGE_PREFIX}.${trimmed}` : null;
}

export function readStoredColumnWidths(tableId?: string): ColumnWidthMap {
  const key = getColumnWidthStorageKey(tableId);
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([columnKey, value]) => [columnKey, Math.round(value as number)]),
    );
  } catch {
    return {};
  }
}

export function writeStoredColumnWidths(tableId: string | undefined, widths: ColumnWidthMap) {
  const key = getColumnWidthStorageKey(tableId);
  if (!key || typeof window === "undefined") return;
  try {
    const normalized = Object.fromEntries(
      Object.entries(widths).filter(([, value]) => Number.isFinite(value) && value > 0),
    );
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private browsing or embedded contexts.
  }
}

export function shouldDebugColumnResize() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLUMN_RESIZE_DEBUG_STORAGE_KEY) === "1";
}

export function logColumnResizeDebug(event: string, payload: Record<string, unknown>) {
  if (!shouldDebugColumnResize()) return;
  // eslint-disable-next-line no-console
  console.debug("[DataTable resize]", event, payload);
}

export function shouldAllowColumnResize<T>(
  column: DataTableColumn<T>,
  columnIndex: number,
  columns: DataTableColumn<T>[],
) {
  if (columnIndex >= columns.length - 1) return false;
  if (column.resizable !== undefined) return column.resizable;
  return !NON_RESIZABLE_COLUMN_KEYS.has(column.key);
}

export function resolveCellOverflowTooltip<T>(column: DataTableColumn<T>, row: T, index: number) {
  if (column.overflowTooltip === false) return false;
  if (typeof column.overflowTooltip === "function") {
    const value = column.overflowTooltip(row, index);
    return value === null || value === undefined ? null : String(value);
  }
  return undefined;
}

export function safeSetPointerCapture(element: Element, pointerId: number) {
  try {
    if ("setPointerCapture" in element) {
      element.setPointerCapture(pointerId);
    }
  } catch {
    // Synthetic pointer events in automated checks may not create an active browser pointer.
  }
}

export function getColumnOrderStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_ORDER_STORAGE_PREFIX}.${trimmed}` : null;
}

export function readStoredColumnOrder(tableId?: string): ColumnOrder {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.trim() !== "",
    );
  } catch {
    return [];
  }
}

export function writeStoredColumnOrder(tableId: string | undefined, order: ColumnOrder) {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return;
  try {
    const normalized = Array.from(new Set(order.filter((value) => value.trim() !== "")));
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private browsing or embedded contexts.
  }
}

export function resolveColumnOrderLock<T>(column: DataTableColumn<T>) {
  if (column.lockOrder) return column.lockOrder;
  if (column.key === "select") return "start";
  if (column.key === "action" || column.key === "actions") return "end";
  return null;
}
