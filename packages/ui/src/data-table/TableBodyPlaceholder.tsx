import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../feedback/EmptyState";
import { scaleDesignPx } from "./tableStorage";

/** 骨架行的高度上限（设计 px）：py-3 上下各 12、h-3 的条 12，再多算 4，宁可少一行也不撑出滚动条。 */
const SKELETON_ROW_DESIGN_PX = 40;
/** 铺满时给横向滚动条通道（pb-3.5）和取整误差留的余量。 */
const SKELETON_FILL_RESERVE_PX = 16;

interface PlaceholderColumn {
  key: string;
  cellClassName?: string;
}

/**
 * 首次加载时的骨架行：读屏只播一句「加载中」，骨架本身对读屏隐藏。
 * fillHeight 是整页列表（fill）的表体高度：给了就按它铺满，数据回来时框不变、不跳；
 * 按行收高的表画五行。
 */
export function TableLoadingRows({
  columns,
  colCount,
  fillHeight,
}: {
  columns: readonly PlaceholderColumn[];
  colCount: number;
  fillHeight?: number;
}) {
  const { t } = useTranslation();
  // 至少五行：页面在窄屏随内容流动时表体高度就是骨架自己撑出来的，按它往下算会一轮比一轮少。
  const rowCount = fillHeight
    ? Math.max(
        5,
        Math.floor((fillHeight - SKELETON_FILL_RESERVE_PX) / scaleDesignPx(SKELETON_ROW_DESIGN_PX)),
      )
    : 5;
  return (
    <>
      <tr>
        <td colSpan={colCount} className="p-0">
          <span role="status" className="sr-only">
            {t("common.loading")}
          </span>
        </td>
      </tr>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
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
 * 没有数据时的整行空态。
 * - 整页列表（fill）传 fillHeight（表体高度）：空态铺满表体、在整个框里居中，和有数据时同一个框。
 *   高度还没量出来或页面在窄屏随内容流动时，min-h-48 保底。
 * - 按行收高的表不传：空态自己带一个最小高度，在矮窗口或嵌在表单里时跟着视口缩小，
 *   不会把下面的分页条和内容顶开。
 */
export function TableEmptyRow({
  colCount,
  title,
  description,
  icon,
  action,
  fillHeight,
}: {
  colCount: number;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  fillHeight?: number;
}) {
  const { t } = useTranslation();
  const fills = fillHeight !== undefined;
  return (
    <tr data-vt-empty-row>
      <td
        colSpan={colCount}
        className={fills ? "p-0 align-middle" : "px-4 py-8 align-middle sm:px-6 sm:py-10"}
      >
        <div
          className={
            fills
              ? "flex min-h-48 w-full items-center justify-center px-4 py-6"
              : "flex min-h-[min(18rem,calc(100dvh-28rem))] w-full items-center justify-center"
          }
          style={fills ? { height: fillHeight } : undefined}
        >
          <EmptyState title={title || t("common.no_data")} description={description} icon={icon} action={action} />
        </div>
      </td>
    </tr>
  );
}
