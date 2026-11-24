// satin-ui/vue/grid
import type { DefineComponent } from "vue";
import type { GridOptions } from "./heavy";
/** 属性：GridOptions 去掉回调（Vue 里写成 @row-click 这样的事件）；勾选用 v-model:selected */
type VueGridProps = Omit<GridOptions, "selectedKeys" | "onRowClick" | "onSortChange" | "onFilterChange" | "onSelectionChange" | "onColumnResize" | "onColumnReorder" | "onCellEdit" | "onScrollEnd" | "onRowAction" | "onRetry"> & { /** v-model:selected：勾上的 rowKey */ selected?: unknown[] };
/** 数据表格：columns + data（或 data-source）；v-model:selected、v-model:sort；@row-click、@sort-change、@filter-change、@selection-change、@column-resize、@column-reorder、@cell-edit、@scroll-end、@row-action、@retry */
export const DataGrid: DefineComponent<VueGridProps>;
export function gridComponent(create: unknown, name: string): DefineComponent<VueGridProps>;
export const GRID_EVENTS: string[];
export type { GridColumn, GridSort, GridDataSource, GridOptions, GridApi, GridEvents } from "./heavy";
