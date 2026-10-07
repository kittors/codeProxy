import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { MonitorBreakdownRow } from "@code-proxy/api-client";

export interface RankingColumn {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** 列宽等额外类名（作用在 th / td 上）。 */
  className?: string;
  render: (row: MonitorBreakdownRow, index: number) => ReactNode;
}

/**
 * 名称列吃掉其余列剩下的宽度，名字按这个宽度截断。表格是自动布局，不加 max-w-0 时这一列的
 * 最小宽度就是整段名字的宽度——线上渠道名是 OAuth 账号邮箱，半宽卡片里会把表格撑出横向滚动。
 */
const NAME_COLUMN = "w-full max-w-0";

/**
 * 三张排行（模型、渠道、门户用户）共用的表格：语义化 table，第一列是可聚焦的按钮（键盘也能
 * 筛选），整行可点，已筛选的行高亮。默认显示前 10 行，可展开到后端给的全部（最多 50）。
 */
export function MonitorRankingTable({
  rows,
  columns,
  selected,
  onSelect,
  primary,
  minWidth = "min-w-[640px]",
  initialLimit = 10,
  total,
}: {
  rows: MonitorBreakdownRow[];
  columns: RankingColumn[];
  selected: readonly string[];
  /** 不传则行不可点（旧后端的分布数据没有可筛选的键）。 */
  onSelect?: (key: string) => void;
  /** 第一列内容（名称），包在按钮里。 */
  primary: (row: MonitorBreakdownRow, index: number) => ReactNode;
  minWidth?: string;
  initialLimit?: number;
  /** 时间窗内的总数（后端只返回最重的一部分）。 */
  total: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, initialLimit);
  const hiddenCount = rows.length - visible.length;

  return (
    <div className="min-w-0">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className={`w-full border-separate border-spacing-0 text-sm ${minWidth}`}>
          <thead>
            <tr>
              {columns.map((column, columnIndex) => (
                <th
                  key={column.key}
                  scope="col"
                  className={[
                    "border-b border-line px-2.5 pb-2 text-xs font-medium whitespace-nowrap text-ink-3",
                    column.align === "right" ? "text-right" : "text-left",
                    columnIndex === 0 ? NAME_COLUMN : "",
                    column.className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const clickable = Boolean(onSelect) && row.key !== "";
              const isSelected = row.key !== "" && selected.includes(row.key);
              return (
                <tr
                  key={`${row.key}:${row.label}:${index}`}
                  onClick={clickable ? () => onSelect?.(row.key) : undefined}
                  className={[
                    "group transition-colors",
                    clickable ? "cursor-pointer" : "",
                    isSelected ? "bg-selected" : clickable ? "hover:bg-hover" : "",
                  ].join(" ")}
                >
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.key}
                      className={[
                        "border-b border-line px-2.5 py-2.5 align-middle",
                        column.align === "right" ? "text-right tabular-nums" : "text-left",
                        columnIndex === 0 ? `rounded-l-xl ${NAME_COLUMN}` : "whitespace-nowrap",
                        columnIndex === columns.length - 1 ? "rounded-r-xl" : "",
                        column.className,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {columnIndex === 0 ? (
                        clickable ? (
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            title={t("monitor_center.click_to_filter")}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect?.(row.key);
                            }}
                            className="block w-full min-w-0 rounded-lg text-left focus-visible:-outline-offset-2"
                          >
                            {primary(row, index)}
                          </button>
                        ) : (
                          primary(row, index)
                        )
                      ) : (
                        column.render(row, index)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 || expanded || total > rows.length ? (
        <div className="flex items-center justify-between gap-2 pt-2.5 text-xs text-ink-3">
          <span>
            {total > rows.length
              ? t("monitor_center.ranking.showing_top", { shown: rows.length, total })
              : null}
          </span>
          {hiddenCount > 0 || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              {expanded
                ? t("monitor_center.ranking.collapse")
                : t("monitor_center.ranking.expand", { count: rows.length })}
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 名称下方的占比细条：宽度即该行请求占全部的比例。 */
export function ShareBar({ share, color }: { share: number; color: string }) {
  const width = Math.max(0, Math.min(100, share));
  return (
    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-track">
      <span
        className="block h-full rounded-full transition-[width] duration-700 ease-pop motion-safe:animate-[quota-bar-grow_900ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </span>
  );
}
