import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ColumnResizePreview } from "./dataTableModel";

/**
 * 拖列宽时跟着指针走的竖线和「宽度 N px」提示。挂到 body 上：表格的滚动区会裁掉它。
 * 拖动中的位置由 DataTable 直接写 lineRef / tooltipRef 的样式，不经过渲染。
 */
export function ColumnResizePreviewOverlay({
  preview,
  lineRef,
  tooltipRef,
}: {
  preview: ColumnResizePreview | null;
  lineRef: RefObject<HTMLDivElement | null>;
  tooltipRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  if (!preview || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div
        ref={lineRef}
        data-vt-column-resize-preview-line
        aria-hidden="true"
        className="pointer-events-none fixed z-[1000] w-0.5 bg-slate-500/70"
        style={{
          left: preview.left,
          top: preview.top,
          height: preview.height,
          display: preview.visible ? undefined : "none",
        }}
      />
      <div
        ref={tooltipRef}
        data-vt-column-resize-preview-tooltip
        role="status"
        className="pointer-events-none fixed z-[1001] rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-neutral-950"
        style={{
          left: preview.left + 10,
          top: preview.tooltipTop,
          display: preview.visible ? undefined : "none",
        }}
      >
        {t("common.column_width_px", { width: preview.width })}
      </div>
    </>,
    document.body,
  );
}
