// satin-ui/react/grid
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { GridOptions, GridColumn, GridApi } from "./heavy";
type Base = { className?: string; style?: React.CSSProperties; id?: string };
/** 列定义（React 版：render 可以返回 React 节点） */
export type DataGridColumn<Row = any> = Omit<GridColumn<Row>, "render"> & { render?(value: any, row: Row, ctx: { cell: HTMLElement; key: string; index: number }): React.ReactNode | string | Node | void };
/** 数据表格的属性：columns + data（或 dataSource）；受控的 sort / selectedKeys；事件 onXxx。列的 key 变了换一张新表；ref 拿到实例 */
export type DataGridProps<Row = any> = Base & Omit<GridOptions<Row>, "columns"> & { columns: DataGridColumn<Row>[] };
export const DataGrid: React.ForwardRefExoticComponent<DataGridProps & React.RefAttributes<SatinInstance & GridApi>>;
export type { GridColumn, GridSort, GridDataSource, GridOptions, GridApi, GridEvents } from "./heavy";
