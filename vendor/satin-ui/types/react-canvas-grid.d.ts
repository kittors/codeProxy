// satin-ui/react/canvas-grid
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { GridOptions, GridApi } from "./heavy";
type Base = { className?: string; style?: React.CSSProperties; id?: string };
/** 画布表格的属性：和 DataGrid 一样（格子的文字用 format，render 不生效） */
export type CanvasGridProps<Row = any> = Base & GridOptions<Row>;
export const CanvasGrid: React.ForwardRefExoticComponent<CanvasGridProps & React.RefAttributes<SatinInstance & GridApi>>;
export type { GridColumn, GridSort, GridDataSource, GridOptions, GridApi, GridEvents } from "./heavy";
