// satin-ui/svelte/DataGrid.svelte：数据表格（重组件，只能这样单独引）
import type { Component } from "svelte";
import type { SatinInstance } from "./components";
import type { GridOptions, GridApi } from "./heavy";
type Attrs = { class?: string; style?: string; id?: string; [attr: `data-${string}`]: unknown; [attr: `aria-${string}`]: unknown };
type Inst = { /** bind:instance 拿到实例 */ instance?: (SatinInstance & GridApi) | null };
type DataGridProps = Attrs & Inst & GridOptions;
/** <DataGrid {columns} data={rows} rowKey="id" bind:selectedKeys bind:sort />：事件写成回调属性（onCellEdit……）；列的 key 变了换一张新表 */
declare const DataGrid: Component<DataGridProps, {}, "instance" | "selectedKeys" | "sort">;
export default DataGrid;
