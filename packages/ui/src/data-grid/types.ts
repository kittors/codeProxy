import type { ReactNode } from "react";

/**
 * DataGrid 的公开类型。
 *
 * 设计取舍（详见根仓 docs/plan/104-data-grid-redesign-20261117.md）：
 * - 排序、筛选、选择、展开都是受控状态：服务端分页的页面（请求日志）把它们拼进请求参数，
 *   客户端小表用 gridModel 里的纯函数（applyGridFilters / sortGridRows）自己算，
 *   表格本身不偷偷持有一份「真实数据」的副本。
 * - 列宽按「设计像素」（16px 根字号下的像素）声明和持久化，渲染时乘以实际根字号：
 *   面板默认根字号是 14.4px（--ui-scale 0.9），Windows 是 16px，直接写像素会让同一列在两个平台上
 *   一宽一窄，持久化的值也会在换平台后错位。
 */

export type GridAlign = "start" | "center" | "end";
export type GridPin = "start" | "end";
export type GridDensity = "compact" | "default" | "comfortable";
export type GridSortDirection = "asc" | "desc";

export interface GridSort {
  columnId: string;
  direction: GridSortDirection;
}

export interface GridFilterOption {
  value: string;
  label: string;
  /** 这个取值当前命中的行数；有数时在筛选面板里画占比条。 */
  count?: number;
  icon?: ReactNode;
  /** 搜索时额外匹配的文字（例如别名、厂商名）。 */
  searchText?: string;
}

export interface GridRangePreset {
  label: string;
  min?: number;
  max?: number;
}

/** 列上声明「可以怎么筛」。 */
export type GridColumnFilter =
  | { type: "options"; options: readonly GridFilterOption[]; searchable?: boolean }
  | {
      type: "range";
      /** 输入框后面的单位（s、%、$、tokens）。 */
      unit?: string;
      presets?: readonly GridRangePreset[];
      /**
       * 输入值到行值的换算：例如耗时列以秒输入、行里存毫秒时传 1000。
       * 只影响 applyGridFilters 的比较，筛选状态里存的是输入值，芯片文案也按输入值显示。
       */
      scale?: number;
      step?: number;
      /** 芯片里怎么写这个值（「$0.1」「10s」）；不传就是「数字 单位」。 */
      formatValue?: (value: number) => string;
    }
  | { type: "text"; placeholder?: string };

/** 筛选状态里某一列的取值。 */
export type GridFilterValue =
  | { type: "options"; values: readonly string[] }
  | { type: "range"; min?: number; max?: number }
  | { type: "text"; query: string };

export type GridFilters = Readonly<Record<string, GridFilterValue>>;

export interface GridCellContext {
  rowIndex: number;
  selected: boolean;
  expanded: boolean;
}

export interface DataGridColumn<T> {
  id: string;
  /** 表头文字。也用于列设置、读屏和筛选芯片，所以必须是纯文本。 */
  header: string;
  /** 指标口径说明：表头文字带点状下划线，悬停文字时显示。 */
  headerHint?: ReactNode;
  /** 表头不显示文字（只留给读屏），用于操作列这类一眼就懂、又很窄的列。 */
  hideHeaderLabel?: boolean;
  /** 文字列靠左；数字、金额、耗时靠右（表头跟着同侧对齐）；纯图标/勾选列居中。 */
  align?: GridAlign;
  /** 默认宽度，设计像素。 */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  /**
   * 吸收容器剩余宽度的列，数字是分配权重（true 等于 1）。几列长文字列按权重分剩余宽度，
   * 宽屏上不会只有一列被拉得很宽、留出一大段空白。没有剩余宽度时它就是 width；
   * 拖拽改的也是这个下限，持久化的永远是下限而不是拉伸后的宽度。
   */
  grow?: boolean | number;
  pin?: GridPin;
  /** 默认可拖拽调宽。 */
  resizable?: boolean;
  /** 能否在「视图」里隐藏；固定列默认不可隐藏。 */
  hideable?: boolean;
  defaultHidden?: boolean;
  sortable?: boolean;
  /** 第一次点表头时的排序方向；默认数字列（靠右）降序、其它升序。时间列通常写 "desc"。 */
  sortFirst?: GridSortDirection;
  /** 客户端排序取值；服务端排序的表可以不传。 */
  sortValue?: (row: T) => string | number | null | undefined;
  filter?: GridColumnFilter;
  /** 客户端筛选取值；不传时用 sortValue。 */
  filterValue?: (row: T) => string | number | null | undefined;
  cell: (row: T, context: GridCellContext) => ReactNode;
  /** 骨架屏里这一列的占位形状。 */
  skeleton?: "text" | "two-line" | "number" | "pill" | "box";
  /** 附加在 td 上的类名。 */
  className?: string;
}

export interface GridEmptyState {
  /** 不传用默认图标，传 null 不要图标。 */
  icon?: ReactNode | null;
  title: string;
  description?: string;
  action?: ReactNode;
  /** 标题与说明下面的补充内容，例如「当前生效的筛选条件」，放在操作按钮之上。 */
  details?: ReactNode;
}

export interface GridSelectionContext {
  count: number;
  clear: () => void;
}

export interface DataGridProps<T> {
  /** 持久化键：列宽、隐藏列、密度各自按它存 localStorage。不传就不持久化。 */
  id?: string;
  columns: readonly DataGridColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 表格的可访问名称。 */
  label: string;

  /** 没有行时是首屏骨架；已有行时是表头下沿的进度条 + 行变淡，框不变。 */
  loading?: boolean;
  /** 出错时在表体里显示错误态（保留表头），配合 onRetry。值是给人看的错误说明。 */
  error?: string | null;
  onRetry?: () => void;
  empty?: GridEmptyState;

  density?: GridDensity;
  /** 隐藏的列（受控）。 */
  hiddenColumnIds?: ReadonlySet<string>;
  /** 传了才在列菜单里出现「隐藏此列」。 */
  onHiddenColumnIdsChange?: (ids: Set<string>) => void;

  sort?: GridSort | null;
  onSortChange?: (sort: GridSort | null) => void;

  filters?: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;

  /** 开启首列复选框。 */
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onSelectedKeysChange?: (keys: Set<string>) => void;
  /** 有选中行时表头换成选择条，这里渲染选择条右侧的批量操作。 */
  selectionActions?: (context: GridSelectionContext) => ReactNode;
  /** 选择条上「选中全部 N 条」之类的补充文字或按钮。 */
  selectionSummary?: (context: GridSelectionContext) => ReactNode;
  /**
   * 选择条上显示的条数。默认是 selectedKeys 的大小；页面支持「选中全部匹配的记录」
   * （跨页、不逐条列出 key）时传真实条数。
   */
  selectionCount?: number;

  /** 行展开后的详情；传了才可展开。 */
  renderExpanded?: (row: T) => ReactNode;
  expandedKeys?: ReadonlySet<string>;
  onExpandedKeysChange?: (keys: Set<string>) => void;

  /** 整页列表铺满父容器（父容器需是 flex-1 min-h-0 的槽位）；嵌入小表不传，按行收高。 */
  fill?: boolean;
  /** 嵌入小表的封顶高度（CSS 长度）。 */
  maxHeight?: string;
  /** 渲染在横向滚动条下面的页脚，一般是 DataGridPagination。 */
  footer?: ReactNode;
  /**
   * 外框：默认是和面板卡片一样的四边封闭圆角盒子（24px 圆角、细边、柔和投影），表头、表体、
   * 横向滚动条、页脚都在框里，被圆角裁住。嵌在卡片或弹窗里的小表传 false，不要卡中卡。
   */
  frame?: boolean;
  /** 变化时把表格滚回顶部（换页、换筛选时传页码与筛选的签名；自动刷新不要传，免得把用户拽回去）。 */
  resetScrollKey?: string | number;
  className?: string;
}
