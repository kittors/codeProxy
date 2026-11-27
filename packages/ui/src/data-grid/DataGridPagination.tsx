import { useMemo, type ReactNode } from "react";
import { Pager as SatinPager, Select as SatinSelect } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { formatInteger } from "./gridFormat";
import { getPageCount } from "./gridModel";

/**
 * 基于 Satin 原生 `Pager`（`mountPager` + 流体 `.sn-cur` 滑块）与原生 `Select`（`.sn-tbl-ps` 向上弹性下拉）
 * 的统一分页栏，100% 对齐 Satin 官方工作台 `.sn-tbl-foot` 简洁两栏结构：
 * - 左栏：条数区间与总条数 + `N 条 / 页` 下拉选择（无裸数字、无系统原生 select）；
 * - 右栏：纯净 Satin `<SatinPager>`（自带首页、邻页、省略号、末页与上下翻页，摒弃陈旧双尖括号与跳页输入框）。
 */
export interface DataGridPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  pending?: boolean;
  /** 左侧条数信息之后追加的内容（例如「已选 3 项」）。 */
  info?: ReactNode;
  className?: string;
}

export function DataGridPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
  pending = false,
  info,
  className,
}: DataGridPaginationProps) {
  const { t, i18n } = useTranslation();
  const pageCount = getPageCount(total, pageSize);
  const current = Math.min(pageCount, Math.max(1, Math.trunc(page)));
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const locale = i18n.resolvedLanguage;

  const go = (target: number) => {
    const next = Math.min(pageCount, Math.max(1, Math.trunc(target)));
    if (next !== current) onPageChange(next);
  };

  const pageSizeItems = useMemo(
    () =>
      pageSizeOptions.map((size) => ({
        value: String(size),
        label: t("data_grid.page_size_option", {
          count: size,
          defaultValue: `${size} / page`,
        }),
      })),
    [pageSizeOptions, t],
  );

  const pageLabel = useMemo(
    () => (pageNum: number) => t("data_grid.page_n", { page: pageNum }),
    [t],
  );

  return (
    <nav
      aria-label={t("data_grid.pagination")}
      className={["min-w-0", className ?? ""].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="sn-tbl-foot-l min-w-0 text-xs text-[var(--sn-label3)]">
          <span className="truncate whitespace-nowrap tabular-nums" aria-live="polite">
            {pending
              ? "—"
              : total === 0
                ? t("data_grid.page_empty")
                : t("data_grid.page_range", {
                    start: formatInteger(start, locale),
                    end: formatInteger(end, locale),
                    total: formatInteger(total, locale),
                  })}
          </span>
          {onPageSizeChange ? (
            <SatinSelect
              className="sn-tbl-ps"
              size="sm"
              up
              value={String(pageSize)}
              items={pageSizeItems}
              label={t("data_grid.rows_per_page")}
              onChange={(value) => onPageSizeChange(Number(value))}
            />
          ) : null}
          {info}
        </div>

        <div className="ml-auto flex items-center">
          <SatinPager
            total={pageCount}
            page={current}
            prevLabel={t("data_grid.prev_page")}
            nextLabel={t("data_grid.next_page")}
            pageLabel={pageLabel}
            onChange={(nextPage) => go(nextPage)}
          />
        </div>
      </div>
    </nav>
  );
}
