import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Select } from "../primitives/Select";
import { cn } from "../utils/selectStyles";

export interface PaginationRangeInfo {
  start: number;
  end: number;
  total: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}

export interface PaginationBarLabels {
  firstPage: string;
  previousPage: string;
  nextPage: string;
  lastPage: string;
  rowsPerPage?: string;
  pageInfo: (info: PaginationRangeInfo) => ReactNode;
}

export interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  labels: PaginationBarLabels;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  showFirstLast?: boolean;
  showPageNumbers?: boolean;
  showPageSize?: boolean;
  align?: "split" | "center";
}

export const getPaginationItems = (
  currentPage: number,
  totalPages: number,
): (number | "...")[] => {
  const safeTotalPages = Math.max(1, Math.trunc(totalPages));
  const safeCurrentPage = Math.min(safeTotalPages, Math.max(1, Math.trunc(currentPage)));
  const pages: (number | "...")[] = [];

  if (safeTotalPages <= 7) {
    for (let i = 1; i <= safeTotalPages; i += 1) pages.push(i);
    return pages;
  }

  pages.push(1);
  if (safeCurrentPage > 3) pages.push("...");

  const rangeStart = Math.max(2, safeCurrentPage - 1);
  const rangeEnd = Math.min(safeTotalPages - 1, safeCurrentPage + 1);
  for (let i = rangeStart; i <= rangeEnd; i += 1) pages.push(i);

  if (safeCurrentPage < safeTotalPages - 2) pages.push("...");
  pages.push(safeTotalPages);

  return pages;
};

export function PaginationBar({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  labels,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [],
  className,
  showFirstLast = true,
  showPageNumbers = true,
  showPageSize = Boolean(onPageSizeChange && pageSizeOptions.length > 0),
  align = "split",
}: PaginationBarProps) {
  const safeTotalPages = Math.max(1, Math.trunc(totalPages));
  const safeCurrentPage = Math.min(safeTotalPages, Math.max(1, Math.trunc(currentPage)));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const start = totalCount === 0 ? 0 : (safeCurrentPage - 1) * safePageSize + 1;
  const end = Math.min(safeCurrentPage * safePageSize, totalCount);
  const pageNumbers = useMemo(
    () => getPaginationItems(safeCurrentPage, safeTotalPages),
    [safeCurrentPage, safeTotalPages],
  );

  const btnBase =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35";
  const btnNormal =
    "text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10";
  const btnActive = "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-neutral-950";
  const disabledPrev = safeCurrentPage <= 1;
  const disabledNext = safeCurrentPage >= safeTotalPages;

  return (
    <div
      className={cn(
        "grid flex-shrink-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center",
        align === "center" && "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
        className,
      )}
    >
      <span className="justify-self-start text-xs text-slate-500 dark:text-white/50 tabular-nums whitespace-nowrap">
        {labels.pageInfo({
          start,
          end,
          total: totalCount,
          currentPage: safeCurrentPage,
          totalPages: safeTotalPages,
          pageSize: safePageSize,
        })}
      </span>

      <div className="flex max-w-full items-center justify-self-center gap-1 overflow-x-auto">
        {showFirstLast ? (
          <button
            type="button"
            className={cn(btnBase, btnNormal)}
            disabled={disabledPrev}
            onClick={() => onPageChange(1)}
            title={labels.firstPage}
            aria-label={labels.firstPage}
          >
            <ChevronsLeft size={14} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className={cn(btnBase, btnNormal)}
          disabled={disabledPrev}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          title={labels.previousPage}
          aria-label={labels.previousPage}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>

        {showPageNumbers
          ? pageNumbers.map((page, index) =>
              page === "..." ? (
                <span
                  key={`dots-${index}`}
                  className="px-1 text-xs text-slate-400 dark:text-white/30"
                >
                  …
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  aria-current={page === safeCurrentPage ? "page" : undefined}
                  className={cn(btnBase, page === safeCurrentPage ? btnActive : btnNormal)}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </button>
              ),
            )
          : null}

        <button
          type="button"
          className={cn(btnBase, btnNormal)}
          disabled={disabledNext}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          title={labels.nextPage}
          aria-label={labels.nextPage}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
        {showFirstLast ? (
          <button
            type="button"
            className={cn(btnBase, btnNormal)}
            disabled={disabledNext}
            onClick={() => onPageChange(safeTotalPages)}
            title={labels.lastPage}
            aria-label={labels.lastPage}
          >
            <ChevronsRight size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showPageSize && onPageSizeChange && labels.rowsPerPage ? (
        <div className="flex items-center justify-self-end gap-1.5">
          <span className="text-xs text-slate-500 dark:text-white/50 whitespace-nowrap">
            {labels.rowsPerPage}
          </span>
          <Select
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            options={pageSizeOptions.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            aria-label={labels.rowsPerPage}
            className="w-[88px]"
          />
        </div>
      ) : null}
    </div>
  );
}
