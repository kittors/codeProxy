import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  baseColumnWidth,
  clampColumnWidth,
  computeGridLayout,
  type GridColumnLayout,
  type GridLayoutColumn,
} from "./gridModel";
import { readGridPreferences, useGridPreferenceEvents, writeGridPreferences } from "./gridStorage";
import type { DataGridColumn } from "./types";

/** 实际根字号 / 16。面板默认 14.4px（0.9），Windows 16px，外观里还能再调。 */
export function readRootScale(): number {
  if (typeof window === "undefined") return 1;
  const size = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size / 16 : 1;
}

export interface ColumnResizeState {
  columnId: string;
  /** 拖动中这一列的设计宽度。 */
  width: number;
}

interface SizingOptions<T> {
  id?: string;
  columns: readonly DataGridColumn<T>[];
  /** 复选框、展开这类合成列，宽度固定、不参与拖拽。 */
  leadingColumns: readonly GridLayoutColumn[];
  viewportWidth: number;
  scale: number;
}

export interface ColumnSizing {
  layout: GridColumnLayout;
  /** 当前每列的设计宽度（拖拽、键盘调整的起点）。 */
  designWidths: Record<string, number>;
  resizing: ColumnResizeState | null;
  startResize: (columnId: string, event: ReactPointerEvent<HTMLElement>, invert?: boolean) => void;
  resizeBy: (columnId: string, deltaDesignPx: number) => void;
  setWidth: (columnId: string, designPx: number | null) => void;
}

/**
 * 列宽：读写持久化的设计像素，处理拖拽与键盘调整，产出布局。
 *
 * 拖拽期间实时改这一列的宽度（不是只画一条参考线等松手再变）：table-layout: fixed 下改一列宽度
 * 只重排这一列，几十行的表跟手；松手才写 localStorage，只按下不拖不写。
 */
export function useColumnSizing<T>({
  id,
  columns,
  leadingColumns,
  viewportWidth,
  scale,
}: SizingOptions<T>): ColumnSizing {
  const [overrides, setOverrides] = useState<Record<string, number>>(
    () => readGridPreferences(id).widths ?? {},
  );
  const [resizing, setResizing] = useState<ColumnResizeState | null>(null);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  const reload = useCallback(() => setOverrides(readGridPreferences(id).widths ?? {}), [id]);
  useGridPreferenceEvents(id, reload);
  useEffect(() => {
    reload();
  }, [reload]);

  const columnsById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  const designWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    for (const column of columns) widths[column.id] = baseColumnWidth(column, overrides);
    if (resizing) widths[resizing.columnId] = resizing.width;
    return widths;
  }, [columns, overrides, resizing]);

  const layout = useMemo(
    () =>
      computeGridLayout(
        [
          ...leadingColumns,
          ...columns.map((column) => ({
            id: column.id,
            width: designWidths[column.id],
            pin: column.pin,
            grow: column.grow,
          })),
        ],
        scale,
        viewportWidth,
      ),
    [columns, designWidths, leadingColumns, scale, viewportWidth],
  );

  const persist = useCallback(
    (next: Record<string, number>) => {
      setOverrides(next);
      writeGridPreferences(id, { widths: next });
    },
    [id],
  );

  const setWidth = useCallback(
    (columnId: string, designPx: number | null) => {
      const column = columnsById.get(columnId);
      if (!column) return;
      const next = { ...overridesRef.current };
      if (designPx === null) delete next[columnId];
      else next[columnId] = clampColumnWidth(column, designPx);
      persist(next);
    },
    [columnsById, persist],
  );

  const resizeBy = useCallback(
    (columnId: string, deltaDesignPx: number) => {
      const column = columnsById.get(columnId);
      if (!column) return;
      setWidth(columnId, baseColumnWidth(column, overridesRef.current) + deltaDesignPx);
    },
    [columnsById, setWidth],
  );

  const startResize = useCallback(
    (columnId: string, event: ReactPointerEvent<HTMLElement>, invert = false) => {
      const column = columnsById.get(columnId);
      if (!column || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      handle.setPointerCapture?.(pointerId);
      const startX = event.clientX;
      const startWidth = baseColumnWidth(column, overridesRef.current);
      let current = startWidth;
      let frame = 0;
      const previousCursor = document.body.style.cursor;
      document.body.style.cursor = "col-resize";
      document.body.dataset.gridResizing = "true";
      setResizing({ columnId, width: startWidth });

      const onMove = (moveEvent: PointerEvent) => {
        const delta = (moveEvent.clientX - startX) / (scale || 1);
        current = clampColumnWidth(column, startWidth + (invert ? -delta : delta));
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          setResizing({ columnId, width: current });
        });
      };
      const finish = (commit: boolean) => {
        if (frame) window.cancelAnimationFrame(frame);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        handle.releasePointerCapture?.(pointerId);
        document.body.style.cursor = previousCursor;
        delete document.body.dataset.gridResizing;
        setResizing(null);
        if (commit && current !== startWidth) {
          persist({ ...overridesRef.current, [columnId]: current });
        }
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      // 拖到一半按 Esc：放弃这次拖拽，列宽回到按下之前。
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        finish(false);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
    },
    [columnsById, persist, scale],
  );

  return { layout, designWidths, resizing, startResize, resizeBy, setWidth };
}
