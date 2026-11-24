// satin-ui/vue/canvas-grid
import type { DefineComponent } from "vue";
import type { GridOptions } from "./heavy";
/** 画布表格：属性、v-model、事件和 DataGrid 一样（格子的文字用 format） */
export const CanvasGrid: DefineComponent<Omit<GridOptions, "selectedKeys" | "onRowClick" | "onSortChange" | "onFilterChange" | "onSelectionChange" | "onColumnResize" | "onColumnReorder" | "onCellEdit" | "onScrollEnd" | "onRowAction" | "onRetry"> & { selected?: unknown[] }>;
export type { GridColumn, GridSort, GridDataSource, GridOptions, GridApi, GridEvents } from "./heavy";
