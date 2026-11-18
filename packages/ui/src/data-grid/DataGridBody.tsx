import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ChevronRight, GripVertical } from "lucide-react";
import {
  Fragment,
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../feedback/EmptyState";
import { Skeleton } from "../feedback/Skeleton";
import { Button } from "../primitives/Button";
import { Checkbox } from "../primitives/Checkbox";
import { EASE_OUT } from "../utils/motion";
import { pinEdge, pinStyle } from "./DataGridHeader";
import { GridCellTooltip } from "./GridCellTooltip";
import { resolveCellTooltip } from "./gridCellText";
import {
  GRID_EXPAND_COLUMN_ID,
  GRID_REORDER_COLUMN_ID,
  GRID_SELECT_COLUMN_ID,
  ROW_HEIGHT,
  cellPadding,
} from "./gridLayout";
import type { GridColumnLayout } from "./gridModel";
import type { DataGridColumn, GridDensity, GridEmptyState, GridRowTone } from "./types";

const ALIGN_CELL: Record<"start" | "center" | "end", string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right",
};

const ALIGN_INNER: Record<"start" | "center" | "end", string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

/** 点到这些元素上不算「点行」：行里的按钮、链接、复选框各干各的事。 */
const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, label, [role='button'], [role='checkbox'], [role='menuitem'], [data-grid-stop]";

const TEXT_WIDTHS = ["w-3/5", "w-4/5", "w-1/2", "w-2/3", "w-3/4", "w-2/5"];
const NUMBER_WIDTHS = ["w-10", "w-12", "w-9", "w-14", "w-11"];

function SkeletonCell({ shape, seed, align }: { shape: string; seed: number; align: string }) {
  const justify = align === "end" ? "justify-end" : align === "center" ? "justify-center" : "";
  if (shape === "box") {
    return (
      <div className={`flex ${justify}`}>
        <Skeleton className="h-4 w-4" rounded="sm" />
      </div>
    );
  }
  if (shape === "pill") {
    return (
      <div className={`flex ${justify}`}>
        <Skeleton className="h-5 w-14" rounded="full" />
      </div>
    );
  }
  if (shape === "number") {
    return (
      <div className={`flex ${justify || "justify-end"}`}>
        <Skeleton className={`h-3 ${NUMBER_WIDTHS[seed % NUMBER_WIDTHS.length]}`} />
      </div>
    );
  }
  if (shape === "two-line") {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className={`h-3 ${TEXT_WIDTHS[seed % TEXT_WIDTHS.length]}`} />
        <Skeleton className={`h-2.5 ${TEXT_WIDTHS[(seed + 3) % TEXT_WIDTHS.length]} opacity-70`} />
      </div>
    );
  }
  return <Skeleton className={`h-3 ${TEXT_WIDTHS[seed % TEXT_WIDTHS.length]}`} />;
}

/**
 * 展开行：详情面板高度从 0 长到内容高，收起时反过来、动画结束再卸载。
 * 面板本身 sticky 在视口左缘、宽度等于视口：表格横向滚到哪儿，详情都完整地待在眼前，
 * 不会跟着很宽的表格一起被滚出去一半。
 */
function ExpandedRow({
  open,
  colSpan,
  width,
  render,
}: {
  open: boolean;
  colSpan: number;
  width: number;
  /** 只在详情挂着（展开中、收起动画中）时才调用，收起的几十行不白白渲染详情。 */
  render: () => ReactNode;
}) {
  const [present, setPresent] = useState(open);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (open) setPresent(true);
  }, [open]);
  if (!present) return null;
  return (
    <tr className="cp-grid-detail-row" data-grid-detail="">
      <td colSpan={colSpan} className="cp-grid-cell p-0 [--grid-cell-bg:var(--grid-row-expanded)]">
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.26, ease: EASE_OUT }}
          onAnimationComplete={() => {
            if (!open) setPresent(false);
          }}
          className="sticky left-0 overflow-hidden"
          style={{ width: width || undefined }}
        >
          {render()}
        </motion.div>
      </td>
    </tr>
  );
}

/** 行首拖动把手（rowReorder 开启时）。 */
export interface GridRowGripProps {
  enabled: boolean;
  draggingKey: string | null;
  onPointerDown: (key: string, event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (key: string, event: KeyboardEvent<HTMLElement>) => void;
}

/** 单元格内容：纯文本套一层可截断的 span；内容被截断时悬停显示全文。 */
function CellContent({ content, tooltip }: { content: ReactNode; tooltip: string | null }) {
  const body =
    typeof content === "string" || typeof content === "number" ? (
      <span className="min-w-0 truncate">{content}</span>
    ) : (
      content
    );
  if (!tooltip) return <>{body}</>;
  return (
    <GridCellTooltip overflowOnly content={tooltip}>
      {body}
    </GridCellTooltip>
  );
}

export interface DataGridBodyProps<T> {
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  columns: readonly DataGridColumn<T>[];
  layout: GridColumnLayout;
  density: GridDensity;
  rows: readonly T[];
  rowKey: (row: T) => string;
  selectable: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleRow: (key: string, range: boolean) => void;
  expandable: boolean;
  expandedKeys?: ReadonlySet<string>;
  onToggleExpand: (key: string) => void;
  renderExpanded?: (row: T) => ReactNode;
  sortColumnId: string | null;
  status: "skeleton" | "empty" | "error" | "rows";
  skeletonRows: number;
  empty?: GridEmptyState;
  error?: string | null;
  onRetry?: () => void;
  /** 空态、错误态这块占多高（像素）：整页表格铺满表体，嵌入小表给个固定高。 */
  stateHeight: number;
  viewportWidth: number;
  focusedKey: string | null;
  onFocusRow: (key: string) => void;
  onRowKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, key: string, index: number) => void;
  /** 哪些行在这次更新里新进来、哪些在淡出（useRowMotion）。表体不再按行集合整体重挂。 */
  motion: { entering: ReadonlySet<string>; stagger: boolean; leaving: ReadonlySet<string>; unfold: boolean };
  dimmed: boolean;
  onRowClick?: (row: T) => void;
  isRowActive?: (row: T) => boolean;
  rowClassName?: (row: T) => string | undefined;
  rowTone?: (row: T) => GridRowTone | undefined;
  rowLabel?: (row: T) => string;
  rowGrip: GridRowGripProps | null;
  /** 正在被拖动换位置的列：内容变淡，表示「它在被搬走」。 */
  draggingColumnId: string | null;
}

export function DataGridBody<T>({
  bodyRef,
  columns,
  layout,
  density,
  rows,
  rowKey,
  selectable,
  selectedKeys,
  onToggleRow,
  expandable,
  expandedKeys,
  onToggleExpand,
  renderExpanded,
  sortColumnId,
  status,
  skeletonRows,
  empty,
  error,
  onRetry,
  stateHeight,
  viewportWidth,
  focusedKey,
  onFocusRow,
  onRowKeyDown,
  motion,
  dimmed,
  onRowClick,
  isRowActive,
  rowClassName,
  rowTone,
  rowLabel,
  rowGrip,
  draggingColumnId,
}: DataGridBodyProps<T>) {
  const { t } = useTranslation();
  const hasLeading = selectable || expandable || Boolean(rowGrip);
  const totalColumns =
    columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0) + (rowGrip ? 1 : 0);
  const rowHeight = ROW_HEIGHT[density];

  const leadingCells = (
    key: string,
    selected: boolean,
    expanded: boolean,
    skeleton: boolean,
    rowIndex = 0,
    name?: string,
  ) => (
    <>
      {rowGrip ? (
        <td
          className="cp-grid-cell p-0"
          data-pin="start"
          data-pin-edge={pinEdge(GRID_REORDER_COLUMN_ID, layout)}
          style={pinStyle(GRID_REORDER_COLUMN_ID, "start", layout)}
        >
          {skeleton ? null : (
            <div className="flex h-full items-center justify-center">
              <button
                type="button"
                data-grid-row-grip=""
                disabled={!rowGrip.enabled}
                aria-label={t("common.reorder_row", { index: rowIndex + 1 })}
                title={t("common.reorder_row", { index: rowIndex + 1 })}
                onPointerDown={(event) => rowGrip.onPointerDown(key, event)}
                onKeyDown={(event) => rowGrip.onKeyDown(key, event)}
                className="inline-flex h-7 w-6 cursor-grab touch-none items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-hover hover:text-ink-2 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <GripVertical size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </td>
      ) : null}
      {selectable ? (
        <td
          className="cp-grid-cell p-0"
          data-pin="start"
          data-pin-edge={pinEdge(GRID_SELECT_COLUMN_ID, layout)}
          style={pinStyle(GRID_SELECT_COLUMN_ID, "start", layout)}
        >
          <div className="flex h-full items-center justify-center">
            {skeleton ? (
              <Skeleton className="h-4 w-4" rounded="sm" />
            ) : (
              <Checkbox
                checked={selected}
                tabIndex={-1}
                aria-label={name ? t("data_grid.select_named", { name }) : t("data_grid.select_row")}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleRow(key, event.shiftKey);
                }}
              />
            )}
          </div>
        </td>
      ) : null}
      {expandable ? (
        <td
          className="cp-grid-cell p-0"
          data-pin="start"
          data-pin-edge={pinEdge(GRID_EXPAND_COLUMN_ID, layout)}
          style={pinStyle(GRID_EXPAND_COLUMN_ID, "start", layout)}
        >
          {skeleton ? null : (
            <div className="flex h-full items-center justify-center">
              <button
                type="button"
                tabIndex={-1}
                aria-expanded={expanded}
                aria-label={expanded ? t("data_grid.collapse_row") : t("data_grid.expand_row")}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand(key);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className={`transition-[rotate] duration-200 ease-pop ${expanded ? "rotate-90" : ""}`}
                />
              </button>
            </div>
          )}
        </td>
      ) : null}
    </>
  );

  if (status === "skeleton") {
    return (
      <tbody ref={bodyRef} aria-hidden="true">
        {Array.from({ length: skeletonRows }, (_, rowIndex) => (
          <tr key={`skeleton-${rowIndex}`} className={`cp-grid-row ${rowHeight}`}>
            {leadingCells(`skeleton-${rowIndex}`, false, false, true)}
            {columns.map((column, index) => (
              <td
                key={column.id}
                className={`cp-grid-cell ${cellPadding(index, columns.length, hasLeading)}`}
                data-pin={column.pin}
                data-pin-edge={pinEdge(column.id, layout)}
                style={pinStyle(column.id, column.pin, layout)}
              >
                <SkeletonCell
                  shape={column.skeleton ?? (column.align === "end" ? "number" : "text")}
                  seed={rowIndex * 7 + index * 3}
                  align={column.align ?? "start"}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  }

  if (status === "empty" || status === "error") {
    const block: CSSProperties = { width: viewportWidth || undefined, height: stateHeight };
    return (
      <tbody ref={bodyRef}>
        <tr>
          <td colSpan={totalColumns} className="p-0">
            <div className="sticky left-0 flex items-center justify-center" style={block}>
              {status === "error" ? (
                <div role="alert">
                  <EmptyState
                    icon={<AlertTriangle aria-hidden="true" />}
                    title={t("data_grid.error_title")}
                    description={error ?? undefined}
                    action={
                      onRetry ? (
                        <Button size="sm" onClick={onRetry}>
                          {t("data_grid.retry")}
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <EmptyState
                  icon={empty?.icon}
                  title={empty?.title ?? t("data_grid.empty_title")}
                  description={empty?.description}
                  action={
                    empty?.details || empty?.action ? (
                      <div className="flex max-w-xl flex-col items-center gap-3">
                        {empty?.details}
                        {empty?.action}
                      </div>
                    ) : undefined
                  }
                />
              )}
            </div>
          </td>
        </tr>
      </tbody>
    );
  }

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T, key: string) => {
    if (!expandable && !onRowClick) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    // 正在拖选文字（复制模型名、渠道名）时不展开。
    if (window.getSelection?.()?.toString()) return;
    if (expandable) onToggleExpand(key);
    else onRowClick?.(row);
  };

  // 依次浮入只数这次新进来的行，第 n 个新行晚 n × 14ms。
  let enterIndex = 0;
  return (
    <tbody
      ref={bodyRef}
      className="cp-grid-body transition-opacity duration-150 ease-soft"
      style={{ opacity: dimmed ? 0.55 : 1 }}
    >
      {rows.map((row, rowIndex) => {
        const key = rowKey(row);
        const entering = motion.entering.has(key);
        const leaving = motion.leaving.has(key);
        if (entering) enterIndex += 1;
        const selected = selectedKeys?.has(key) ?? false;
        const expanded = expandedKeys?.has(key) ?? false;
        const active = isRowActive?.(row) ?? false;
        return (
          <Fragment key={key}>
            <tr
              data-row-key={key}
              data-entering={entering ? (motion.unfold ? "live" : "true") : undefined}
              data-leaving={leaving ? "true" : undefined}
              inert={leaving || undefined}
              aria-selected={selectable ? selected : isRowActive ? active : undefined}
              aria-expanded={expandable ? expanded : undefined}
              data-expanded={expanded ? "true" : undefined}
              data-active={active ? "true" : undefined}
              data-tone={rowTone?.(row)}
              data-dragging={rowGrip?.draggingKey === key ? "true" : undefined}
              tabIndex={focusedKey === key ? 0 : -1}
              onFocus={(event) => {
                if (event.target === event.currentTarget) onFocusRow(key);
              }}
              onKeyDown={(event) => onRowKeyDown(event, key, rowIndex)}
              onClick={(event) => handleRowClick(event, row, key)}
              className={[
                "cp-grid-row group/row",
                rowHeight,
                expandable || onRowClick ? "cursor-pointer" : "",
                rowClassName?.(row) ?? "",
              ].join(" ")}
              style={{ ["--row-index" as string]: entering && motion.stagger ? enterIndex - 1 : 0 }}
            >
              {leadingCells(key, selected, expanded, false, rowIndex, rowLabel?.(row))}
              {columns.map((column, index) => {
                const align = column.align ?? "start";
                const content = column.cell(row, { rowIndex, selected, expanded });
                return (
                  <td
                    key={column.id}
                    data-col={column.id}
                    data-pin={column.pin}
                    data-pin-edge={pinEdge(column.id, layout)}
                    data-sorted={sortColumnId === column.id ? "true" : undefined}
                    data-dragging={draggingColumnId === column.id ? "true" : undefined}
                    className={[
                      "cp-grid-cell align-middle text-sm text-ink",
                      cellPadding(index, columns.length, hasLeading),
                      ALIGN_CELL[align],
                      column.className ?? "",
                    ].join(" ")}
                    style={pinStyle(column.id, column.pin, layout)}
                  >
                    <div
                      data-cell-inner=""
                      className={`flex min-w-0 items-center overflow-hidden ${ALIGN_INNER[align]}`}
                    >
                      <CellContent
                        content={content}
                        tooltip={resolveCellTooltip(column, row, content)}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
            {expandable && renderExpanded ? (
              <ExpandedRow
                open={expanded}
                colSpan={totalColumns}
                width={viewportWidth}
                render={() => renderExpanded(row)}
              />
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}
