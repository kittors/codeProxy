import { useRef, useState, type ReactNode } from "react";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { getPaginationItems } from "./gridPagination";
import { Select } from "../primitives/Select";
import { useSatinFluidThumb } from "../utils/satinMotion";
import { formatInteger } from "./gridFormat";
import { getPageCount } from "./gridModel";

/**
 * 基于 Satin 流体滑块与按钮微动效的表格分页器：
 * - 翻页按钮与每页下拉、跳页输入全部对齐 Satin `sn-sm`（2rem）与 `var(--sn-btn-r)`（8px）圆角家族；
 * - 当前页滑块由 Satin `edgeFrames` Web Animations 驱动（前缘先走、后缘跟上、落定轻压），
 *   按钮自身在滑块就位后保持透明，彻底避免滑块与实底按钮互相遮挡。
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
  "sn-btn sn-ghost sn-sm sn-ibtn shrink-0 text-[var(--sn-label2)]";

const PAGE_BUTTON =
  "sn-btn sn-ghost sn-sm relative z-[1] min-w-8 !px-2 tabular-nums text-[var(--sn-label2)]";

/** 首尾页双箭头：复用 Satin Solar chevron 曲线与 .sn-ic-d 双色调层，避免额外引入 lucide。 */
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
  const pagesHostRef = useRef<HTMLSpanElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const pageCount = getPageCount(total, pageSize);
  const current = Math.min(pageCount, Math.max(1, Math.trunc(page)));
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const items = getPaginationItems(current, pageCount);
  const locale = i18n.resolvedLanguage;

  useSatinFluidThumb(pagesHostRef, thumbRef, '[aria-current="page"]', `${current}:${pageCount}`);

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
    <nav
      aria-label={t("data_grid.pagination")}
      className={["@container min-w-0", className ?? ""].join(" ")}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
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
          {info}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${ARROW_BUTTON} hidden @2xl:inline-flex`}
            onClick={() => go(1)}
            disabled={current <= 1}
            aria-label={t("data_grid.first_page")}
          >
            <DoubleChevron direction="left" />
          </button>
          <button
            type="button"
            className={ARROW_BUTTON}
            onClick={() => go(current - 1)}
            disabled={current <= 1}
            aria-label={t("data_grid.prev_page")}
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <span
            className="px-2 text-xs font-medium text-[var(--sn-label2)] tabular-nums @xl:hidden"
            aria-hidden="true"
          >
            {current} / {pageCount}
          </span>
          <span
            ref={pagesHostRef}
            className="group/pages relative hidden items-center gap-1 @xl:flex"
          >
            <span
              ref={thumbRef}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 h-8 origin-left rounded-[var(--sn-btn-r)] bg-[var(--sn-accent)] opacity-0 will-change-transform"
            />
            {items.map((item, index) =>
              item === "..." ? (
                <span
                  key={`gap-${index}`}
                  className="inline-flex h-8 w-6 items-center justify-center text-xs text-[var(--sn-label-off)] select-none"
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
                  className={[
                    PAGE_BUTTON,
                    item === current
                      ? "bg-[var(--sn-accent)] font-semibold !text-[var(--sn-on-primary)] hover:!bg-transparent hover:!text-[var(--sn-on-primary)] group-data-[thumb-ready=true]/pages:!bg-transparent"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="relative">{item}</span>
                </button>
              ),
            )}
          </span>
          <button
            type="button"
            className={ARROW_BUTTON}
            onClick={() => go(current + 1)}
            disabled={current >= pageCount}
            aria-label={t("data_grid.next_page")}
          >
            <Icon name="chevron-right" size={14} />
          </button>
          <button
            type="button"
            className={`${ARROW_BUTTON} hidden @2xl:inline-flex`}
            onClick={() => go(pageCount)}
            disabled={current >= pageCount}
            aria-label={t("data_grid.last_page")}
          >
            <DoubleChevron direction="right" />
          </button>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-3 text-xs text-[var(--sn-label3)]">
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
                className="w-18"
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
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (jump.trim()) submitJump();
                }}
                placeholder={String(current)}
                aria-label={t("data_grid.go_to_page")}
                className="sn-input sn-sm !w-12 !px-2 text-center tabular-nums"
              />
            </label>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
