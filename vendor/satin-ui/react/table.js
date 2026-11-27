"use client";
// satin-ui/react/table：独立按需入口，承载完整 Satin Table 引擎与 createPortal 单元格渲染，
// 让未渲染表格的页面零加载负担，并完整共享父级 React Context（i18n / Router / Theme / Toast）。
import {
  createElement as h,
  Fragment,
  forwardRef,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  isValidElement,
} from "react";
import { createPortal } from "react-dom";
import { defineComponent } from "../src/core/lifecycle.js";
import { tableHTML, mountTable } from "../src/data/table.js";
import { wrap } from "./wrap.js";

const createTable = /* @__PURE__ */ defineComponent({
  name: "table",
  defaults: { columns: [], rowKey: "id" },
  html: (o) => tableHTML(o),
  mount: (el, o, api) => mountTable(el, o, api.emit),
});

const TABLE_EVENTS = [
  "sort",
  "select",
  "rowClick",
  "expandChange",
  "rowReorder",
  "columnReorder",
  "columnResize",
  "rowResize",
  "cellEdit",
  "pageChange",
  "retry",
  "layout",
];
const TableInstance = /* @__PURE__ */ wrap(createTable, {
  valueKey: "selected",
  events: TABLE_EVENTS,
  displayName: "TableInstance",
});

let nextTablePortalId = 1;

function useTablePortals(columns, detail) {
  const slotsRef = useRef(null);
  if (slotsRef.current === null) slotsRef.current = new Map();
  const pendingRef = useRef(false);
  const aliveRef = useRef(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      slotsRef.current.clear();
    };
  }, []);

  const scheduleFlush = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      if (!aliveRef.current) return;
      for (const [el] of slotsRef.current) {
        if (!el.isConnected) slotsRef.current.delete(el);
      }
      setTick((n) => n + 1);
    });
  }, []);

  const mappedColumns = useMemo(
    () =>
      (columns || []).map((c) =>
        typeof c.render !== "function"
          ? c
          : {
              ...c,
              render: (v, row, ctx) => {
                const out = c.render(v, row, ctx);
                if (!isValidElement(out)) {
                  if (ctx.cell && slotsRef.current.has(ctx.cell)) {
                    slotsRef.current.delete(ctx.cell);
                    scheduleFlush();
                  }
                  return out;
                }
                if (!ctx.cell) return "";
                if (!ctx.cell._snPortalKey) {
                  ctx.cell.replaceChildren();
                  ctx.cell._snPortalKey = `sn-tc-${nextTablePortalId++}`;
                }
                slotsRef.current.set(ctx.cell, { key: ctx.cell._snPortalKey, node: out });
                scheduleFlush();
                return undefined;
              },
            },
      ),
    [columns, scheduleFlush],
  );

  const mappedDetail = useMemo(
    () =>
      typeof detail !== "function"
        ? detail
        : (row, ctx) => {
            const out = detail(row, ctx);
            if (!isValidElement(out)) return out;
            if (typeof document === "undefined") return "";
            const host = document.createElement("div");
            host.style.display = "contents";
            const key = `sn-td-${ctx.key}-${nextTablePortalId++}`;
            slotsRef.current.set(host, { key, node: out });
            scheduleFlush();
            return host;
          },
    [detail, scheduleFlush],
  );

  for (const [el] of slotsRef.current) {
    if (!el.isConnected) slotsRef.current.delete(el);
  }
  const portals = [];
  for (const [el, item] of slotsRef.current) {
    portals.push(createPortal(item.node, el, item.key));
  }
  return { columns: mappedColumns, detail: mappedDetail, portals };
}

export const Table = /* @__PURE__ */ forwardRef(function Table({ columns, detail, ...rest }, ref) {
  const { columns: mappedColumns, detail: mappedDetail, portals } = useTablePortals(
    columns,
    detail,
  );
  return h(
    Fragment,
    null,
    h(TableInstance, { ...rest, columns: mappedColumns, detail: mappedDetail, ref }),
    portals,
  );
});
