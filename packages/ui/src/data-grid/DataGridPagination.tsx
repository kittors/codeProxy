import { useMemo, useState, type ReactNode } from "react";
import { Pager as SatinPager, Select as SatinSelect } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { formatInteger } from "./gridFormat";
import { getPageCount } from "./gridModel";

/**
 * 基于 Satin 原生 `Pager`（`mountPager` + 流体 `.sn-cur` 滑块）与原生 `Select`（`mountSelect` 向上弹性下拉）
 * 的统一分页栏，同时服务于 `<DataGrid>` 贴底页脚与独立卡片列表分页。
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

const ARROW_BUTTON =
  "sn-btn sn-ghost sn-sm sn-ibtn sn-round shrink-0 text-[var(--sn-label2)]";

function DoubleChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="sn-ic"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? (
        <>
          <path d="m11 5-6 7 6 7" />
          <path d="m18 5-6 7 6 7" className="sn-ic-d" />
        </>
      ) : (
        <>
          <path d="m6 5 6 7-6 7" className="sn-ic-d" />
          <path d="m13 5 6 7-6 7" />
        </>
      )}
    </svg>
  );
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
  const [jump, setJump] = useState("");
  const pageCount = getPageCount(total, pageSize);
  const current = Math.min(pageCount, Math.max(1, Math.trunc(page)));
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const locale = i18n.resolvedLanguage;

  const go = (target: number) => {
    const next = Math.min(pageCount, Math.max(1, Math.trunc(target)));
    if (next !== current) onPageChange(next);
  };

  const submitJump = () => {
    const value = Number(jump.trim());
    if (Number.isFinite(value) && value >= 1) go(value);
    setJump("");
  };

  const pageSizeItems = useMemo(
    () => pageSizeOptions.map((size) => ({ value: String(size), label: String(size) })),
    [pageSizeOptions],
  );

  const pageLabel = useMemo(
    () => (pageNum: number) => t("data_grid.page_n", { page: pageNum }),
    [t],
  );

  return (
    <nav
      aria-label={t("data_grid.pagination")}
      className={["@container min-w-0", className ?? ""].join(" ")}
    >
      {/* 对齐 Satin 官方工作台 .sn-tbl-foot 简洁两栏结构：左栏汇总与每页条数，右栏流体圆滑块页码。 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3 text-xs text-[var(--sn-label3)]">
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
            <label className="flex items-center gap-1.5">
              <span className="sr-only">{t("data_grid.rows_per_page")}</span>
              <span className="sn-tbl-ps inline-flex w-[4.5rem]">
                <SatinSelect
                  size="sm"
                  up
                  value={String(pageSize)}
                  items={pageSizeItems}
                  label={t("data_grid.rows_per_page")}
                  onChange={(value) => onPageSizeChange(Number(value))}
                />
              </span>
            </label>
          ) : null}
          {info}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {pageCount > 7 ? (
            <button
              type="button"
              className={`${ARROW_BUTTON} hidden @3xl:inline-flex`}
              onClick={() => go(1)}
              disabled={current <= 1}
              aria-label={t("data_grid.first_page")}
            >
              <DoubleChevron direction="left" />
            </button>
          ) : null}
          <SatinPager
            total={pageCount}
            page={current}
            prevLabel={t("data_grid.prev_page")}
            nextLabel={t("data_grid.next_page")}
            pageLabel={pageLabel}
            onChange={(nextPage) => go(nextPage)}
          />
          {pageCount > 7 ? (
            <button
              type="button"
              className={`${ARROW_BUTTON} hidden @3xl:inline-flex`}
              onClick={() => go(pageCount)}
              disabled={current >= pageCount}
              aria-label={t("data_grid.last_page")}
            >
              <DoubleChevron direction="right" />
            </button>
          ) : null}
          {pageCount > 7 ? (
            <label className="ml-1 hidden items-center gap-1.5 text-xs text-[var(--sn-label3)] @4xl:flex">
              <span className="whitespace-nowrap">{t("data_grid.go_to_page")}</span>
              <input
                value={jump}
                inputMode="numeric"
                onChange={(event) => setJump(event.currentTarget.value.replace(/[^\d]/g, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitJump();
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (jump.trim()) submitJump();
                }}
                placeholder={String(current)}
                aria-label={t("data_grid.go_to_page")}
                className="sn-input sn-sm !h-[30px] !w-12 !px-2 text-center tabular-nums"
              />
            </label>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
