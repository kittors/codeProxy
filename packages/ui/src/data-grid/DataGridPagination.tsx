import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getPaginationItems } from "./gridPagination";
import { Select } from "../primitives/Select";
import { formatInteger } from "./gridFormat";
import { getPageCount } from "./gridModel";

/**
 * 表格分页器：左边「第 1–50 条，共 1,354 条」，中间页码，右边每页条数与跳页。
 *
 * - 当前页的实心胶囊在页码之间滑动（共享布局动画），翻页时视线跟着走；
 * - 页码按钮等宽、数字等宽，翻到两位数、三位数页时整排不左右抖；
 * - 总数还没回来时（pending）只显示占位，不显示「共 0 条」这种像是真没数据的字样。
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

const NAV_BUTTON =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-medium tabular-nums text-ink-2 transition-[background-color,color,scale] duration-150 ease-soft hover:bg-hover hover:text-ink active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35";

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
  const layoutId = useId();
  const reduceMotion = useReducedMotion();
  const [jump, setJump] = useState("");
  const pageCount = getPageCount(total, pageSize);
  const current = Math.min(pageCount, Math.max(1, Math.trunc(page)));
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const items = getPaginationItems(current, pageCount);
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

  return (
    // 三栏网格：左边条数、中间页码、右边每页条数。中间一栏永远居中，左边文字长短变化
    // （「共 1,354 条」→「共 17 条」）不会把页码推来推去。按容器宽度逐级收起：
    // 跳页 → 首页 / 末页与「每页」二字 → 页码换成「3 / 28」，窄到放不下也不会横向溢出。
    <nav
      aria-label={t("data_grid.pagination")}
      className={["@container min-w-0", className ?? ""].join(" ")}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
        <div className="flex min-w-0 items-center gap-3 text-xs text-ink-3">
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
          {info}
        </div>

        <LayoutGroup id={layoutId}>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className={`${NAV_BUTTON} hidden @2xl:inline-flex`}
              onClick={() => go(1)}
              disabled={current <= 1}
              aria-label={t("data_grid.first_page")}
            >
              <ChevronsLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={NAV_BUTTON}
              onClick={() => go(current - 1)}
              disabled={current <= 1}
              aria-label={t("data_grid.prev_page")}
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span className="px-2 text-xs tabular-nums text-ink-2 @xl:hidden" aria-hidden="true">
              {current} / {pageCount}
            </span>
            <span className="hidden items-center gap-0.5 @xl:flex">
              {items.map((item, index) =>
                item === "..." ? (
                  <span
                    key={`gap-${index}`}
                    className="w-6 text-center text-xs text-ink-4"
                    aria-hidden="true"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    aria-current={item === current ? "page" : undefined}
                    aria-label={t("data_grid.page_n", { page: item })}
                    onClick={() => go(item)}
                    className={`${NAV_BUTTON} relative ${item === current ? "text-accent-fg hover:bg-transparent hover:text-accent-fg" : ""}`}
                  >
                    {item === current ? (
                      <motion.span
                        layoutId="active-page"
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full bg-accent"
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 520, damping: 38 }
                        }
                      />
                    ) : null}
                    <span className="relative">{item}</span>
                  </button>
                ),
              )}
            </span>
            <button
              type="button"
              className={NAV_BUTTON}
              onClick={() => go(current + 1)}
              disabled={current >= pageCount}
              aria-label={t("data_grid.next_page")}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${NAV_BUTTON} hidden @2xl:inline-flex`}
              onClick={() => go(pageCount)}
              disabled={current >= pageCount}
              aria-label={t("data_grid.last_page")}
            >
              <ChevronsRight size={14} aria-hidden="true" />
            </button>
          </div>
        </LayoutGroup>

        <div className="flex min-w-0 items-center justify-end gap-3 text-xs text-ink-3">
          {onPageSizeChange ? (
            <label className="flex items-center gap-1.5">
              <span className="hidden whitespace-nowrap @2xl:inline">
                {t("data_grid.rows_per_page")}
              </span>
              <Select
                fullWidth={false}
                size="sm"
                value={String(pageSize)}
                onChange={(value) => onPageSizeChange(Number(value))}
                options={pageSizeOptions.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                aria-label={t("data_grid.rows_per_page")}
                className="w-[4.75rem]"
              />
            </label>
          ) : null}
          {pageCount > 7 ? (
            <label className="hidden items-center gap-1.5 @4xl:flex">
              <span className="whitespace-nowrap">{t("data_grid.go_to_page")}</span>
              <input
                value={jump}
                inputMode="numeric"
                onChange={(event) => setJump(event.currentTarget.value.replace(/[^\d]/g, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitJump();
                  }
                }}
                onBlur={() => setJump("")}
                placeholder={String(current)}
                aria-label={t("data_grid.go_to_page")}
                className="h-8 w-12 rounded-full bg-field px-2 text-center text-xs tabular-nums text-ink shadow-control outline-none transition-shadow placeholder:text-ink-4 hover:shadow-control-hover focus-visible:shadow-control-focus"
              />
            </label>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
