"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react/grid：数据表格（satin-ui/grid 的 createDataGrid）包成的 React 组件。重组件单独一个子路径，不拉进 satin-ui/react 主入口。
//   import { DataGrid } from "satin-ui/react/grid";
//   <DataGrid columns={columns} data={rows} rowKey="id" onSortChange={setSort} onSelectionChange={(e) => setKeys(e.keys)} />
// · 列：columns（key、title、width、sortable、filter、pinned、type、options、format、render、editable……，见类型 GridColumn）；
//   render 可以返回 React 节点（每个格子一个小的 React 根，拿不到外面的 Context）
// · 数据：data（数组，筛选、排序在页面里算）或 dataSource（{ total, load({ start, end, sort, filter }) } 按块从服务端要）
// · 受控：sort + onSortChange、selectedKeys + onSelectionChange；三种状态 loading / error / emptyText
// · data 换了（不是同一个数组、内容也变了）就按现在的筛选、排序重新要；列的 key 变了换一张新表（React 的 key）
// · 服务端输出和第一帧一样的标记（工具条、表头、空表体），挂上以后才有行；ref 拿到实例：merge、reload、selectedKeys……
import { createElement as h, forwardRef, useMemo, useRef, useEffect, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { createDataGrid } from "../src/grid.js";
import { wrap } from "./wrap.js";

const EVENTS = ["rowClick", "sortChange", "filterChange", "selectionChange", "columnResize", "columnReorder", "cellEdit", "scrollEnd", "rowAction", "retry"];
const Grid = /* @__PURE__ */ wrap(createDataGrid, { events: EVENTS, displayName: "DataGridInstance" }); // selectedKeys、sort 的受控由表格自己按"传进来的值换了才跟着变"处理（defaultXxx 原样交给表格，只在创建时用）
// 同一份数据就不重新要：同一个数组，或者长度一样、每一项都是同一个对象
const sameRows = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
// render 返回 React 节点：格子里建一个小的 React 根画进去（行复用时同一个格子接着用它）
export function useCellRoots(columns) {
  const roots = useRef(new Set());
  useEffect(() => () => { const rs = [...roots.current]; roots.current.clear(); queueMicrotask(() => rs.forEach((r) => r.unmount())); }, []);
  return useMemo(() => (columns || []).map((c) => (typeof c.render !== "function" ? c : { ...c, render: (v, row, ctx) => {
    const out = c.render(v, row, ctx);
    if (!isValidElement(out)) return out;
    let root = ctx.cell._snRoot; if (!root) { ctx.cell.replaceChildren(); root = ctx.cell._snRoot = createRoot(ctx.cell); roots.current.add(root); }
    root.render(out); return undefined;
  } })), [columns]);
}
export const DataGrid = /* @__PURE__ */ forwardRef(function DataGrid({ columns, data, ...rest }, ref) {
  const cols = useCellRoots(columns), last = useRef(data);
  if (!sameRows(last.current, data)) last.current = data;
  return h(Grid, { ...rest, columns: cols, data: last.current, ref, key: (columns || []).map((c) => c.key).join("|") });
});
