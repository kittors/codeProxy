import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { findDropTarget } from "./gridOrder";
import { swallowNextClick } from "./useColumnReorder";

const AUTOSCROLL_EDGE_PX = 40;
const AUTOSCROLL_MAX_STEP_PX = 16;

export interface RowDragState {
  key: string;
  /** 插入线相对表格区上缘的位置；null 表示放回原处。 */
  indicatorY: number | null;
}

interface Options {
  enabled: boolean;
  /** 当前显示顺序的行 key。 */
  keys: readonly string[];
  viewportRef: RefObject<HTMLDivElement | null>;
  areaRef: RefObject<HTMLDivElement | null>;
  headerHeightRef: RefObject<number>;
  onMove?: (fromIndex: number, toIndex: number) => void;
  /** 移动完成（viaKeyboard 为真时调用方要把焦点还给这一行的把手）。 */
  onMoved: (key: string, toIndex: number, viaKeyboard: boolean) => void;
}

/**
 * 拖动行调整先后：按住行首把手上下拖，松手落到插入线的位置；聚焦把手按 ↑/↓、Home/End 也能移动。
 * 表格本身不改数据，只把「从第几行移到第几行」交给页面（onMove），页面改完顺序再传回来。
 */
export function useRowReorder({
  enabled,
  keys,
  viewportRef,
  areaRef,
  headerHeightRef,
  onMove,
  onMoved,
}: Options) {
  const [drag, setDrag] = useState<RowDragState | null>(null);
  const latest = useRef({ keys, onMove, onMoved });
  latest.current = { keys, onMove, onMoved };

  const commit = useCallback((key: string, beforeKey: string | null, viaKeyboard: boolean) => {
    const { keys: current, onMove: move, onMoved: moved } = latest.current;
    const from = current.indexOf(key);
    if (from < 0 || !move) return;
    const insertion = beforeKey === null ? current.length : current.indexOf(beforeKey);
    if (insertion < 0) return;
    const to = insertion > from ? insertion - 1 : insertion;
    if (to === from) return;
    move(from, to);
    moved(key, to, viaKeyboard);
  }, []);

  const startDrag = useCallback(
    (key: string, event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      const viewport = viewportRef.current;
      const area = areaRef.current;
      if (!viewport || !area) return;
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      let pointerY = startY;
      let active = false;
      let frame = 0;
      let drop: { beforeId: string | null } | null = null;
      const previousCursor = document.body.style.cursor;

      const measure = () => {
        const areaRect = area.getBoundingClientRect();
        const items: { id: string; start: number; end: number }[] = [];
        for (const row of viewport.querySelectorAll<HTMLElement>("tbody > tr[data-row-key]")) {
          const rect = row.getBoundingClientRect();
          items.push({ id: row.dataset.rowKey ?? "", start: rect.top, end: rect.bottom });
        }
        const target = findDropTarget(items, key, pointerY);
        drop = target;
        const head = headerHeightRef.current ?? 0;
        const indicatorY = target
          ? Math.min(areaRect.height, Math.max(head, target.edge - areaRect.top))
          : null;
        setDrag({ key, indicatorY });
      };

      const autoscroll = () => {
        const rect = viewport.getBoundingClientRect();
        const top = rect.top + (headerHeightRef.current ?? 0) + AUTOSCROLL_EDGE_PX;
        const bottom = rect.bottom - AUTOSCROLL_EDGE_PX;
        let step = 0;
        if (pointerY < top)
          step = -Math.ceil(((top - pointerY) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_STEP_PX);
        else if (pointerY > bottom)
          step = Math.ceil(((pointerY - bottom) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_STEP_PX);
        if (step === 0) return false;
        const before = viewport.scrollTop;
        viewport.scrollTop =
          before + Math.max(-AUTOSCROLL_MAX_STEP_PX, Math.min(AUTOSCROLL_MAX_STEP_PX, step));
        return viewport.scrollTop !== before;
      };

      const tick = () => {
        frame = 0;
        const scrolled = autoscroll();
        measure();
        if (scrolled) frame = window.requestAnimationFrame(tick);
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        pointerY = moveEvent.clientY;
        if (!active) {
          if (Math.abs(pointerY - startY) < 3) return;
          active = true;
          document.body.style.cursor = "grabbing";
          document.body.dataset.gridDragging = "true";
        }
        moveEvent.preventDefault();
        if (!frame) frame = window.requestAnimationFrame(tick);
      };
      const finish = (commitDrop: boolean) => {
        if (frame) window.cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        if (active) {
          document.body.style.cursor = previousCursor;
          delete document.body.dataset.gridDragging;
          swallowNextClick();
        }
        setDrag(null);
        if (commitDrop && active && drop) commit(key, drop.beforeId, false);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        finish(false);
      };
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
    },
    [areaRef, commit, enabled, headerHeightRef, viewportRef],
  );

  const onGripKeyDown = useCallback(
    (key: string, event: ReactKeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      const current = latest.current.keys;
      const index = current.indexOf(key);
      if (index < 0) return;
      let beforeKey: string | null;
      switch (event.key) {
        case "ArrowUp":
          if (index === 0) return event.preventDefault();
          beforeKey = current[index - 1];
          break;
        case "ArrowDown":
          if (index === current.length - 1) return event.preventDefault();
          beforeKey = current[index + 2] ?? null;
          break;
        case "Home":
          if (index === 0) return event.preventDefault();
          beforeKey = current[0];
          break;
        case "End":
          if (index === current.length - 1) return event.preventDefault();
          beforeKey = null;
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      commit(key, beforeKey, true);
    },
    [commit, enabled],
  );

  return { drag, startDrag, onGripKeyDown };
}
