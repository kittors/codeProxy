import type { DataGridColumn, GridFilterValue, GridFilters, GridPin, GridSort } from "./types";

/**
 * DataGrid 的纯逻辑：列顺序与布局、排序、筛选、选择。都是无副作用的函数，
 * 组件和页面共用一份，单测直接测这里。
 */

/** 没写宽度的列按这个设计像素起步。 */
export const DEFAULT_COLUMN_WIDTH = 140;
export const DEFAULT_MIN_COLUMN_WIDTH = 56;
export const DEFAULT_MAX_COLUMN_WIDTH = 960;
/** 复选框列的设计宽度。 */
export const SELECT_COLUMN_WIDTH = 40;
/** 展开列（行首的 ›）的设计宽度。 */
export const EXPAND_COLUMN_WIDTH = 28;
/** 行拖动把手列的设计宽度。 */
export const REORDER_COLUMN_WIDTH = 32;

/**
 * 固定在左侧的列在前、普通列居中、固定在右侧的列在后。组内按用户拖过的顺序 order
 * （gridOrder.mergeColumnOrder 合并过的完整列表），没拖过就是声明顺序。
 */
export function orderGridColumns<T>(
  columns: readonly DataGridColumn<T>[],
  hidden?: ReadonlySet<string>,
  order?: readonly string[],
): DataGridColumn<T>[] {
  const visible = columns.filter((column) => !hidden?.has(column.id));
  const position = new Map((order ?? []).map((id, index) => [id, index]));
  const offset = position.size;
  const rank = (pin: GridPin | undefined) => (pin === "start" ? 0 : pin === "end" ? 2 : 1);
  return visible
    .map((column, index) => ({ column, index: position.get(column.id) ?? offset + index }))
    .sort((a, b) => rank(a.column.pin) - rank(b.column.pin) || a.index - b.index)
    .map(({ column }) => column);
}

export function clampColumnWidth<T>(column: DataGridColumn<T>, width: number): number {
  const min = column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  const max = Math.max(min, column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH);
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** 一列的设计宽度：用户拖过的值优先，否则用声明值。 */
export function baseColumnWidth<T>(
  column: DataGridColumn<T>,
  overrides: Readonly<Record<string, number>>,
): number {
  const override = overrides[column.id];
  return clampColumnWidth(
    column,
    typeof override === "number" && Number.isFinite(override)
      ? override
      : (column.width ?? DEFAULT_COLUMN_WIDTH),
  );
}

export interface GridColumnLayout {
  /** 每列的实际像素宽度（已乘根字号比例、已把剩余宽度分给 grow 列）。 */
  widths: Record<string, number>;
  /** 表格总宽度（像素）。 */
  totalWidth: number;
  /** 固定列到各自那一侧的距离（像素），给 position: sticky 的 left / right。 */
  startOffsets: Record<string, number>;
  endOffsets: Record<string, number>;
  /** 左右固定区的总宽，横向滚动条的轨道夹在两者之间。 */
  startPinnedWidth: number;
  endPinnedWidth: number;
  /** 左侧固定区最后一列、右侧固定区第一列：只有它们画固定列阴影。 */
  startEdgeId: string | null;
  endEdgeId: string | null;
}

export interface GridLayoutColumn {
  id: string;
  /** 设计像素。 */
  width: number;
  pin?: GridPin;
  grow?: boolean | number;
  /** 设计像素；只在 shrink 时用作下限。 */
  minWidth?: number;
  /** 放不下时可以往 minWidth 压（DataGrid 的 fitColumns 打开、grow 列、用户没拖过宽度）。 */
  shrink?: boolean;
}

/**
 * 列宽之和超出视口时，从 shrink 列里按各自可压的余量比例扣掉差额，最多扣到 minWidth；返回扣掉的总像素。
 * 余量按比例分摊而不是先压一列：几列一起略收窄，比某一列突然被压到最窄更不显眼。
 */
function shrinkToFit(
  columns: readonly GridLayoutColumn[],
  widths: Record<string, number>,
  scale: number,
  deficit: number,
): number {
  const shrinkable = columns.filter((column) => column.shrink && !column.pin);
  const room = new Map<string, number>();
  for (const column of shrinkable) {
    const min = Math.max(1, Math.round((column.minWidth ?? column.width) * scale));
    room.set(column.id, Math.max(0, widths[column.id] - min));
  }
  const totalRoom = [...room.values()].reduce((sum, value) => sum + value, 0);
  if (totalRoom <= 0) return 0;
  const target = Math.min(deficit, totalRoom);
  let taken = 0;
  for (const column of shrinkable) {
    const cut = Math.floor((target * (room.get(column.id) ?? 0)) / totalRoom);
    widths[column.id] -= cut;
    room.set(column.id, (room.get(column.id) ?? 0) - cut);
    taken += cut;
  }
  // 取整剩下的零头，从还有余量的列里逐列扣完。
  for (const column of shrinkable) {
    if (taken >= target) break;
    const cut = Math.min(room.get(column.id) ?? 0, target - taken);
    widths[column.id] -= cut;
    taken += cut;
  }
  return taken;
}

const growWeight = (grow: boolean | number | undefined): number =>
  grow === true ? 1 : typeof grow === "number" && grow > 0 ? grow : 0;

/**
 * 算出每列像素宽与固定偏移。
 *
 * - 设计像素 × scale（实际根字号 / 16）后取整，总宽是逐列取整后的和——和 <col> 实际渲染的
 *   宽度一致，固定列的 left 偏移才不会和单元格错开 1px；
 * - 视口比各列之和宽时，把差额按权重分给 grow 列（没有 grow 列就留白在最右，不按比例拉宽
 *   所有列：数字列被拉宽后数字离表头更远；拉伸后的宽度也不持久化，持久化的只是下限）。
 */
export function computeGridLayout(
  columns: readonly GridLayoutColumn[],
  scale: number,
  viewportWidth: number,
): GridColumnLayout {
  const widths: Record<string, number> = {};
  let totalWidth = 0;
  for (const column of columns) {
    const px = Math.max(1, Math.round(column.width * scale));
    widths[column.id] = px;
    totalWidth += px;
  }

  // 放不下：先把可压的列往最小宽度压（只有打开 fitColumns 的表才有 shrink 列），压到底还放不下才横向滚动。
  if (viewportWidth > 0 && totalWidth > Math.floor(viewportWidth)) {
    totalWidth -= shrinkToFit(columns, widths, scale, totalWidth - Math.floor(viewportWidth));
  }

  // 剩余宽度按权重分给 grow 列；取整的零头给权重最大的那列，总宽正好等于视口。
  // 没有列声明 grow 时由最宽的普通列吸收：否则表格比框窄，表头底色和行线在右边断掉一截。
  const declared = columns.filter((column) => !column.pin && growWeight(column.grow) > 0);
  const regular = columns.filter((column) => !column.pin && !column.id.startsWith("__"));
  const widest = regular.reduce<GridLayoutColumn | null>(
    (best, column) => (!best || column.width > best.width ? column : best),
    null,
  );
  const growColumns =
    declared.length > 0 ? declared : widest ? [{ ...widest, grow: true as const }] : [];
  const spare = Math.floor(viewportWidth) - totalWidth;
  if (growColumns.length > 0 && spare > 0) {
    const totalWeight = growColumns.reduce((sum, column) => sum + growWeight(column.grow), 0);
    let given = 0;
    for (const column of growColumns) {
      const share = Math.floor((spare * growWeight(column.grow)) / totalWeight);
      widths[column.id] += share;
      given += share;
    }
    const heaviest = growColumns.reduce((best, column) =>
      growWeight(column.grow) > growWeight(best.grow) ? column : best,
    );
    widths[heaviest.id] += spare - given;
    totalWidth += spare;
  }

  const startOffsets: Record<string, number> = {};
  const endOffsets: Record<string, number> = {};
  let startPinnedWidth = 0;
  let startEdgeId: string | null = null;
  for (const column of columns) {
    if (column.pin !== "start") continue;
    startOffsets[column.id] = startPinnedWidth;
    startPinnedWidth += widths[column.id];
    startEdgeId = column.id;
  }
  let endPinnedWidth = 0;
  let endEdgeId: string | null = null;
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const column = columns[index];
    if (column.pin !== "end") continue;
    endOffsets[column.id] = endPinnedWidth;
    endPinnedWidth += widths[column.id];
    endEdgeId = column.id;
  }

  return {
    widths,
    totalWidth,
    startOffsets,
    endOffsets,
    startPinnedWidth,
    endPinnedWidth,
    startEdgeId,
    endEdgeId,
  };
}

type Comparable = string | number | null | undefined;

const isBlank = (value: Comparable) =>
  value === null || value === undefined || value === "" || Number.isNaN(value);

/** 稳定排序；空值永远排在最后（不随方向翻转），数字按大小、文字按当前语言比较。 */
export function sortGridRows<T>(
  rows: readonly T[],
  columns: readonly DataGridColumn<T>[],
  sort: GridSort | null | undefined,
  locale?: string,
): T[] {
  if (!sort) return [...rows];
  const column = columns.find((item) => item.id === sort.columnId);
  const getValue = column?.sortValue;
  if (!getValue) return [...rows];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const factor = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((a, b) => {
      const aBlank = isBlank(a.value);
      const bBlank = isBlank(b.value);
      if (aBlank || bBlank) {
        if (aBlank && bBlank) return a.index - b.index;
        return aBlank ? 1 : -1;
      }
      const result =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return result === 0 ? a.index - b.index : result * factor;
    })
    .map(({ row }) => row);
}

/** 筛选值是否真的在起作用（空选项、空区间、空字符串都等于没筛）。 */
export function isGridFilterActive(value: GridFilterValue | undefined): value is GridFilterValue {
  if (!value) return false;
  switch (value.type) {
    case "options":
      return value.values.length > 0;
    case "range":
      return Number.isFinite(value.min) || Number.isFinite(value.max);
    case "text":
      return value.query.trim().length > 0;
    default:
      return false;
  }
}

export function countActiveGridFilters(filters: GridFilters | undefined): number {
  if (!filters) return 0;
  return Object.values(filters).filter((value) => isGridFilterActive(value)).length;
}

/** 写入或清除一列的筛选，返回新对象；清空的列直接删掉键，避免状态里堆满空筛选。 */
export function setGridFilter(
  filters: GridFilters | undefined,
  columnId: string,
  value: GridFilterValue | undefined,
): GridFilters {
  const next: Record<string, GridFilterValue> = { ...filters };
  if (isGridFilterActive(value)) next[columnId] = value;
  else delete next[columnId];
  return next;
}

function matchesFilter(raw: Comparable, value: GridFilterValue, scale: number): boolean {
  switch (value.type) {
    case "options":
      return value.values.includes(String(raw ?? ""));
    case "range": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
      if (Number.isFinite(value.min) && raw < (value.min as number) * scale) return false;
      if (Number.isFinite(value.max) && raw > (value.max as number) * scale) return false;
      return true;
    }
    case "text":
      return String(raw ?? "")
        .toLocaleLowerCase()
        .includes(value.query.trim().toLocaleLowerCase());
    default:
      return true;
  }
}

/** 客户端筛选：所有列条件取交集。没有取值函数的列忽略它的筛选（服务端筛选的列）。 */
export function applyGridFilters<T>(
  rows: readonly T[],
  columns: readonly DataGridColumn<T>[],
  filters: GridFilters | undefined,
): T[] {
  const active = Object.entries(filters ?? {}).filter(([, value]) => isGridFilterActive(value));
  if (active.length === 0) return [...rows];
  const checks = active
    .map(([columnId, value]) => {
      const column = columns.find((item) => item.id === columnId);
      const getValue = column?.filterValue ?? column?.sortValue;
      if (!column || !getValue) return null;
      const scale = column.filter?.type === "range" ? (column.filter.scale ?? 1) : 1;
      return (row: T) => matchesFilter(getValue(row), value, scale);
    })
    .filter((check): check is (row: T) => boolean => check !== null);
  return rows.filter((row) => checks.every((check) => check(row)));
}

export type GridSelectionState = "none" | "some" | "all";

/** 表头复选框的状态：只看当前页可见的行。 */
export function getGridSelectionState(
  visibleKeys: readonly string[],
  selected: ReadonlySet<string> | undefined,
): GridSelectionState {
  if (!selected || selected.size === 0 || visibleKeys.length === 0) return "none";
  let hit = 0;
  for (const key of visibleKeys) if (selected.has(key)) hit += 1;
  if (hit === 0) return "none";
  return hit === visibleKeys.length ? "all" : "some";
}

/** 点击表头复选框：当前页全选了就取消当前页，否则把当前页全部选上（不动其它页已选的）。 */
export function toggleGridSelectAll(
  visibleKeys: readonly string[],
  selected: ReadonlySet<string> | undefined,
): Set<string> {
  const next = new Set(selected);
  if (getGridSelectionState(visibleKeys, selected) === "all") {
    for (const key of visibleKeys) next.delete(key);
  } else {
    for (const key of visibleKeys) next.add(key);
  }
  return next;
}

/**
 * 勾选一行。带 Shift 时把上次点过的行到这一行之间整段设成和这一行相同的状态，
 * 和邮箱、文件管理器里的习惯一致。
 */
export function toggleGridRowSelection(
  visibleKeys: readonly string[],
  selected: ReadonlySet<string> | undefined,
  key: string,
  options: { anchorKey?: string | null; range?: boolean } = {},
): Set<string> {
  const next = new Set(selected);
  const willSelect = !next.has(key);
  const anchorIndex = options.anchorKey ? visibleKeys.indexOf(options.anchorKey) : -1;
  const targetIndex = visibleKeys.indexOf(key);
  if (options.range && anchorIndex >= 0 && targetIndex >= 0) {
    const [from, to] =
      anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    for (let index = from; index <= to; index += 1) {
      if (willSelect) next.add(visibleKeys[index]);
      else next.delete(visibleKeys[index]);
    }
    return next;
  }
  if (willSelect) next.add(key);
  else next.delete(key);
  return next;
}

/**
 * 表头点击排序的循环：无 → 首选方向 → 反方向 → 无。
 * 首选方向由列决定：数字列（靠右）默认降序，点一下最常想看的是「最大的在前」；文字列默认升序。
 */
export function nextGridSort(
  current: GridSort | null | undefined,
  columnId: string,
  first: GridSort["direction"] = "desc",
): GridSort | null {
  const second = first === "desc" ? "asc" : "desc";
  if (!current || current.columnId !== columnId) return { columnId, direction: first };
  if (current.direction === first) return { columnId, direction: second };
  return null;
}

/** 列的首选排序方向。 */
export function firstSortDirection<T>(column: DataGridColumn<T>): GridSort["direction"] {
  return column.sortFirst ?? (column.align === "end" ? "desc" : "asc");
}

export function getPageCount(total: number, pageSize: number): number {
  const size = Math.max(1, Math.trunc(pageSize));
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

export function paginateRows<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, Math.trunc(pageSize));
  const safePage = Math.min(getPageCount(rows.length, size), Math.max(1, Math.trunc(page)));
  return rows.slice((safePage - 1) * size, safePage * size);
}
