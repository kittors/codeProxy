"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react/canvas-grid：画布表格（一百万行也流畅，satin-ui/canvas-grid 的 createCanvasGrid）包成的 React 组件。
//   import { CanvasGrid } from "satin-ui/react/canvas-grid";
//   <CanvasGrid columns={columns} dataSource={{ total: 1000000, load }} rowKey="id" />
// 选项、事件和 DataGrid 一样（见 satin-ui/react/grid）；画布上画不了任意节点：格子的文字用 format（render 只在 DataGrid 里有效）。
// 列的 key 变了换一张新表（React 的 key）；ref 拿到实例
import { createElement as h, forwardRef, useRef } from "react";
import { createCanvasGrid } from "../src/canvas-grid.js";
import { wrap } from "./wrap.js";

const EVENTS = ["rowClick", "sortChange", "filterChange", "selectionChange", "columnResize", "columnReorder", "cellEdit", "scrollEnd", "rowAction", "retry"];
const Grid = /* @__PURE__ */ wrap(createCanvasGrid, { events: EVENTS, displayName: "CanvasGridInstance" }); // selectedKeys、sort 的受控由表格自己按"传进来的值换了才跟着变"处理（defaultXxx 原样交给表格，只在创建时用）
const sameRows = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
export const CanvasGrid = /* @__PURE__ */ forwardRef(function CanvasGrid({ columns, data, ...rest }, ref) {
  const last = useRef(data);
  if (!sameRows(last.current, data)) last.current = data;
  return h(Grid, { ...rest, columns, data: last.current, ref, key: (columns || []).map((c) => c.key).join("|") });
});
