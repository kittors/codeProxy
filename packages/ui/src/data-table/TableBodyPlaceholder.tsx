import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../feedback/EmptyState";

interface PlaceholderColumn {
  key: string;
  cellClassName?: string;
}

/** 首次加载时的骨架行：读屏只播一句「加载中」，骨架本身对读屏隐藏。 */
export function TableLoadingRows({
  columns,
  colCount,
}: {
  columns: readonly PlaceholderColumn[];
  colCount: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      <tr>
        <td colSpan={colCount} className="p-0">
          <span role="status" className="sr-only">
            {t("common.loading")}
          </span>
        </td>
      </tr>
      {Array.from({ length: 5 }, (_, rowIndex) => (
        <tr key={`loading-${rowIndex}`} aria-hidden="true">
          {columns.map((col, colIndex) => (
            <td
              key={col.key}
              data-vt-column-key={col.key}
              className={`overflow-hidden px-4 py-3 align-middle ${col.cellClassName ?? ""}`}
            >
              <div
                className={[
                  "h-3 animate-pulse rounded-full bg-slate-200 dark:bg-white/10",
                  colIndex === 0 ? "w-2/3" : "w-4/5",
                ].join(" ")}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * 没有数据时的整行空态。表格按内容收高，空态自己带一个最小高度：在整页表格里像一块
 * 居中的提示，在矮窗口或嵌在表单里时跟着视口缩小，不会把下面的分页条和内容顶开。
 */
export function TableEmptyRow({
  colCount,
  title,
  description,
  icon,
  action,
}: {
  colCount: number;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <tr data-vt-empty-row>
      <td colSpan={colCount} className="px-4 py-8 align-middle sm:px-6 sm:py-10">
        <div className="flex min-h-[min(18rem,calc(100dvh-28rem))] w-full items-center justify-center">
          <EmptyState title={title || t("common.no_data")} description={description} icon={icon} action={action} />
        </div>
      </td>
    </tr>
  );
}
