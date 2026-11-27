"use client";
// satin-ui/react/table：独立按需入口，承载完整 Satin Table 引擎与 createPortal 渲染，
// 让未渲染表格的页面零加载负担，并完整共享父级 React Context（i18n / Router / Theme / Toast）。
import {
  createElement as h,
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  isValidElement,
} from "react";
import { createPortal } from "react-dom";
import { defineComponent } from "../src/core/lifecycle.js";
import { tableHTML, mountTable } from "../src/data/table.js";
import { wrap, useIso } from "./wrap.js";

const createTable = /* @__PURE__ */ defineComponent({
  name: "table",
  defaults: { columns: [], rowKey: "id" },
  html: (o) => tableHTML(o),
  mount: (el, o, api) => mountTable(el, o, api.emit),
});

const TABLE_EVENTS = [
  "sort",
  "select",
  "selectChange",
  "rowClick",
  "expandChange",
  "rowReorder",
  "columnReorder",
  "columnResize",
  "columnResizeBy",
  "autoFitColumn",
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

function useTablePortals(columns, detail, empty, errorContent) {
  const slotsRef = useRef(null);
  if (slotsRef.current === null) slotsRef.current = new Map();
  const dirtyRef = useRef(false);
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

  const flushNow = useCallback(() => {
    if (!aliveRef.current) return;
    dirtyRef.current = false;
    for (const [el] of slotsRef.current) {
      if (!el.isConnected) slotsRef.current.delete(el);
    }
    setTick((n) => n + 1);
  }, []);

  const scheduleFlush = useCallback(() => {
    dirtyRef.current = true;
    if (pendingRef.current) return;
    pendingRef.current = true;
    queueMicrotask(() => {
      pendingRef.current = false;
      if (!aliveRef.current || !dirtyRef.current) return;
      flushNow();
    });
  }, [flushNow]);

  const bindPortal = useCallback(
    (cell, out, prefix) => {
      if (!isValidElement(out)) {
        if (cell && slotsRef.current.has(cell)) {
          slotsRef.current.delete(cell);
          scheduleFlush();
        }
        return out;
      }
      if (!cell) return "";
      if (!cell._snPortalKey) {
        cell.replaceChildren();
        cell._snPortalKey = `${prefix}-${nextTablePortalId++}`;
      }
      slotsRef.current.set(cell, { key: cell._snPortalKey, node: out });
      scheduleFlush();
      return undefined;
    },
    [scheduleFlush],
  );

  const mappedColumns = useMemo(
    () =>
      (columns || []).map((c) => {
        const hasRender = typeof c.render === "function";
        const hasHeader = typeof c.headerRender === "function";
        if (!hasRender && !hasHeader) return c;
        const next = { ...c };
        if (hasRender) {
          next._snOrigRender = c.render;
          next.render = (v, row, ctx) => bindPortal(ctx.cell, c.render(v, row, ctx), "sn-tc");
        }
        if (hasHeader) {
          next._snOrigHeaderRender = c.headerRender;
          next.headerRender = (col, ctx) => bindPortal(ctx.cell, c.headerRender(col, ctx), "sn-th");
        }
        return next;
      }),
    [columns, bindPortal],
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

  const emptyIsNode = isValidElement(empty);
  const mappedEmptyRender = useMemo(() => {
    if (emptyIsNode) {
      return ({ cell }) => bindPortal(cell, empty, "sn-te");
    }
    if (typeof empty === "function") {
      return ({ cell, filtered }) => {
        const out = empty({ filtered });
        if (isValidElement(out)) return bindPortal(cell, out, "sn-te");
        return out;
      };
    }
    return undefined;
  }, [empty, emptyIsNode, bindPortal]);

  const errorIsNode = isValidElement(errorContent) || typeof errorContent === "function";
  const mappedErrorRender = useMemo(() => {
    if (!errorIsNode) return undefined;
    return ({ cell, error, retry }) => {
      const out = typeof errorContent === "function" ? errorContent({ error, retry }) : errorContent;
      if (isValidElement(out)) return bindPortal(cell, out, "sn-terr");
      return out;
    };
  }, [errorContent, errorIsNode, bindPortal]);

  for (const [el] of slotsRef.current) {
    if (!el.isConnected) slotsRef.current.delete(el);
  }
  const portals = [];
  for (const [el, item] of slotsRef.current) {
    portals.push(createPortal(item.node, el, item.key));
  }
  return {
    columns: mappedColumns,
    detail: mappedDetail,
    emptyProp: emptyIsNode ? undefined : empty,
    emptyRender: mappedEmptyRender,
    errorRender: mappedErrorRender,
    portals,
    dirtyRef,
    flushNow,
  };
}

export const Table = /* @__PURE__ */ forwardRef(function Table(
  {
    columns,
    detail,
    empty,
    errorContent,
    bulk,
    footer,
    refreshIndicator,
    onAutoFitColumn,
    onColumnResizeBy,
    ...rest
  },
  ref,
) {
  const instRef = useRef(null);
  const [slotNodes, setSlotNodes] = useState({ bulk: null, footer: null, progress: null });
  const {
    columns: mappedColumns,
    detail: mappedDetail,
    emptyProp,
    emptyRender,
    errorRender,
    portals,
    dirtyRef,
    flushNow,
  } = useTablePortals(columns, detail, empty, errorContent);

  useImperativeHandle(ref, () => instRef.current, []);

  // 在 TableInstance 的 useLayoutEffect 跑完 mount/update 之后，同帧同步提交 Portal，
  // 杜绝首帧闪烁与同步 DOM 断言读到空单元格的问题。
  useIso(() => {
    if (dirtyRef.current) flushNow();
  });

  // 维护挂在 .sn-tbl-wrap 内部的原生槽位（进度条、悬浮批量条 .sn-bulk、贴底页脚 .sn-tbl-foot）
  const hasBulk = bulk != null && bulk !== false;
  const hasFooter = footer != null && footer !== false;
  const hasProgress = refreshIndicator != null && refreshIndicator !== false;

  useLayoutEffect(() => {
    const wrapEl = instRef.current?.el;
    if (!wrapEl) return;

    let progressEl = wrapEl.querySelector(":scope > .sn-tbl-progress");
    if (hasProgress) {
      if (!progressEl) {
        progressEl = document.createElement("div");
        progressEl.className = "sn-tbl-progress";
        wrapEl.append(progressEl);
      }
    } else if (progressEl) {
      progressEl.remove();
      progressEl = null;
    }

    let bulkEl = wrapEl.querySelector(":scope > .sn-bulk");
    if (hasBulk) {
      if (!bulkEl) {
        bulkEl = document.createElement("div");
        bulkEl.className = "sn-bulk";
        bulkEl.setAttribute("data-grid-selection-bar", "");
        wrapEl.append(bulkEl);
      }
      bulkEl.classList.add("sn-on");
    } else if (bulkEl) {
      bulkEl.remove();
      bulkEl = null;
    }
    wrapEl.classList.toggle("sn-has-bulk", hasBulk);

    let footEl = wrapEl.querySelector(":scope > .sn-tbl-foot-custom");
    if (hasFooter) {
      if (!footEl) {
        footEl = document.createElement("div");
        footEl.className = "sn-tbl-foot sn-tbl-foot-custom";
        wrapEl.append(footEl);
      }
    } else if (footEl) {
      footEl.remove();
      footEl = null;
    }
    wrapEl.classList.toggle("sn-has-foot", hasFooter || !!rest.pagination);

    setSlotNodes((prev) =>
      prev.bulk === bulkEl && prev.footer === footEl && prev.progress === progressEl
        ? prev
        : { bulk: bulkEl, footer: footEl, progress: progressEl },
    );
  }, [hasBulk, hasFooter, hasProgress, rest.pagination]);

  const extraPortals = [];
  if (hasProgress && slotNodes.progress && slotNodes.progress.isConnected) {
    extraPortals.push(createPortal(refreshIndicator, slotNodes.progress, "sn-tbl-progress"));
  }
  if (hasBulk && slotNodes.bulk && slotNodes.bulk.isConnected) {
    extraPortals.push(createPortal(bulk, slotNodes.bulk, "sn-tbl-bulk"));
  }
  if (hasFooter && slotNodes.footer && slotNodes.footer.isConnected) {
    extraPortals.push(createPortal(footer, slotNodes.footer, "sn-tbl-footer"));
  }

  return h(
    Fragment,
    null,
    h(TableInstance, {
      ...rest,
      columns: mappedColumns,
      detail: mappedDetail,
      empty: emptyProp,
      emptyRender,
      errorRender,
      hasBulk,
      hasFooter,
      autoFitHandled: typeof onAutoFitColumn === "function",
      resizeByHandled: typeof onColumnResizeBy === "function",
      onAutoFitColumn,
      onColumnResizeBy,
      ref: instRef,
    }),
    portals,
    extraPortals,
  );
});
