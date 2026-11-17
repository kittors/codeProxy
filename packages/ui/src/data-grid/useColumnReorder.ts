import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { findDropTarget, mergeColumnOrder, moveColumnBefore } from "./gridOrder";
import { readGridPreferences, useGridPreferenceEvents, writeGridPreferences } from "./gridStorage";
import type { DataGridColumn } from "./types";

/** 按住表头横向移动超过这么多像素才算拖动，否则松手仍是一次点击（排序）。 */
const DRAG_THRESHOLD_PX = 5;
/** 指针离可滚动区（左右冻结区之间）的边缘这么近时自动横向滚动，越靠边越快。 */
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_MAX_STEP_PX = 18;

export interface ColumnDragState {
  columnId: string;
  header: string;
  /** 指针位置（视口坐标），画跟手的列名标签。 */
  pointerX: number;
  pointerY: number;
  /** 插入线相对表格区左缘的位置；null 表示放回原处，不画线。 */
  indicatorX: number | null;
}

export function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value;
}

/**
 * 吞掉拖动松手后浏览器补发的那次 click：不然拖完一列，顺带切换了一次排序。
 * click 与 pointerup 在同一轮事件里派发，setTimeout 0 之后就不会再有了。
 */
export function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
}

interface Options<T> {
  id?: string;
  columns: readonly DataGridColumn<T>[];
  hidden?: ReadonlySet<string>;
  enabled: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  areaRef: RefObject<HTMLDivElement | null>;
  /** 左右冻结区的实际宽度：插入线和自动滚动都只在两者之间。 */
  pinnedRef: RefObject<{ start: number; end: number }>;
  /** 移动完成（viaKeyboard 为真时调用方要把焦点还给这一列的把手）。 */
  onMoved: (columnId: string, viaKeyboard: boolean) => void;
}

/**
 * 列顺序：拖表头（或聚焦表头上的把手按 ←/→、Home/End）调整未冻结列的先后，
 * 存进这张表的视图偏好；「恢复默认视图」清掉偏好时一起复原。冻结列与 reorderable: false 的列不动。
 */
export function useColumnReorder<T>({
  id,
  columns,
  hidden,
  enabled,
  viewportRef,
  areaRef,
  pinnedRef,
  onMoved,
}: Options<T>) {
  const [stored, setStored] = useState<string[] | undefined>(() => readGridPreferences(id).order);
  const reload = useCallback(() => setStored(readGridPreferences(id).order), [id]);
  useGridPreferenceEvents(id, reload);
  useEffect(() => {
    reload();
  }, [reload]);

  const definitionKey = columns.map((column) => column.id).join("\u0000");
  const order = useMemo(
    () =>
      mergeColumnOrder(definitionKey ? definitionKey.split("\u0000") : [], enabled ? stored : null),
    [definitionKey, enabled, stored],
  );

  const isMovable = useCallback(
    (column: DataGridColumn<T>) => enabled && !column.pin && column.reorderable !== false,
    [enabled],
  );

  const columnsById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  /** 当前看得见、能移动的列，按显示顺序。 */
  const movableIds = useMemo(
    () =>
      order.filter((columnId) => {
        const column = columnsById.get(columnId);
        return column && !hidden?.has(columnId) && isMovable(column);
      }),
    [columnsById, hidden, isMovable, order],
  );

  const latest = useRef({ order, movableIds, onMoved });
  latest.current = { order, movableIds, onMoved };

  const commit = useCallback(
    (columnId: string, beforeId: string | null, viaKeyboard: boolean) => {
      const next = moveColumnBefore(latest.current.order, columnId, beforeId);
      setStored(next);
      writeGridPreferences(id, { order: next });
      latest.current.onMoved(columnId, viaKeyboard);
    },
    [id],
  );

  const [drag, setDrag] = useState<ColumnDragState | null>(null);

  const startDrag = useCallback(
    (column: DataGridColumn<T>, event: ReactPointerEvent<HTMLElement>, fromGrip: boolean) => {
      if (event.button !== 0 || !isMovable(column)) return;
      if (!fromGrip && (event.target as HTMLElement).closest("[data-grid-no-drag]")) return;
      const viewport = viewportRef.current;
      const area = areaRef.current;
      if (!viewport || !area) return;
      if (fromGrip) event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      let pointerX = startX;
      let pointerY = startY;
      let active = false;
      let frame = 0;
      let drop: { beforeId: string | null } | null = null;
      const previousCursor = document.body.style.cursor;

      const measure = () => {
        const areaRect = area.getBoundingClientRect();
        const items: { id: string; start: number; end: number }[] = [];
        for (const columnId of latest.current.movableIds) {
          const cell = viewport.querySelector<HTMLElement>(`th[data-col="${cssEscape(columnId)}"]`);
          if (!cell) continue;
          const rect = cell.getBoundingClientRect();
          items.push({ id: columnId, start: rect.left, end: rect.right });
        }
        const target = findDropTarget(items, column.id, pointerX);
        drop = target;
        const pinned = pinnedRef.current;
        const indicatorX = target
          ? Math.min(
              areaRect.width - pinned.end,
              Math.max(pinned.start, target.edge - areaRect.left),
            )
          : null;
        setDrag({ columnId: column.id, header: column.header, pointerX, pointerY, indicatorX });
      };

      const autoscroll = () => {
        const rect = viewport.getBoundingClientRect();
        const pinned = pinnedRef.current;
        const left = rect.left + pinned.start + AUTOSCROLL_EDGE_PX;
        const right = rect.right - pinned.end - AUTOSCROLL_EDGE_PX;
        let step = 0;
        if (pointerX < left)
          step = -Math.ceil(((left - pointerX) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_STEP_PX);
        else if (pointerX > right)
          step = Math.ceil(((pointerX - right) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_STEP_PX);
        if (step === 0) return false;
        const before = viewport.scrollLeft;
        viewport.scrollLeft =
          before + Math.max(-AUTOSCROLL_MAX_STEP_PX, Math.min(AUTOSCROLL_MAX_STEP_PX, step));
        return viewport.scrollLeft !== before;
      };

      const tick = () => {
        frame = 0;
        const scrolled = autoscroll();
        measure();
        // 停在边上不动也要继续滚：没有新的 pointermove，只能自己续帧。
        if (scrolled) frame = window.requestAnimationFrame(tick);
      };

      const onMove = (moveEvent: PointerEvent) => {
        pointerX = moveEvent.clientX;
        pointerY = moveEvent.clientY;
        if (!active) {
          const distance = fromGrip
            ? Math.hypot(pointerX - startX, pointerY - startY)
            : Math.abs(pointerX - startX);
          if (distance < (fromGrip ? 3 : DRAG_THRESHOLD_PX)) return;
          active = true;
          document.body.style.cursor = "grabbing";
          document.body.dataset.gridDragging = "true";
        }
        moveEvent.preventDefault();
        if (!frame) frame = window.requestAnimationFrame(tick);
      };

      const finish = (commitDrop: boolean) => {
        if (frame) window.cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        if (active) {
          document.body.style.cursor = previousCursor;
          delete document.body.dataset.gridDragging;
          swallowNextClick();
        }
        setDrag(null);
        if (commitDrop && active && drop) commit(column.id, drop.beforeId, false);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      // 拖到一半按 Esc：放弃，列回到原处。
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        finish(false);
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
    },
    [areaRef, commit, isMovable, pinnedRef, viewportRef],
  );

  const onGripKeyDown = useCallback(
    (column: DataGridColumn<T>, event: ReactKeyboardEvent<HTMLElement>) => {
      const ids = latest.current.movableIds;
      const index = ids.indexOf(column.id);
      if (index < 0) return;
      let beforeId: string | null;
      switch (event.key) {
        case "ArrowLeft":
          if (index === 0) return event.preventDefault();
          beforeId = ids[index - 1];
          break;
        case "ArrowRight":
          if (index === ids.length - 1) return event.preventDefault();
          beforeId = ids[index + 2] ?? null;
          break;
        case "Home":
          if (index === 0) return event.preventDefault();
          beforeId = ids[0];
          break;
        case "End":
          if (index === ids.length - 1) return event.preventDefault();
          beforeId = null;
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      commit(column.id, beforeId, true);
    },
    [commit],
  );

  return { order, isMovable, drag, startDrag, onGripKeyDown };
}
