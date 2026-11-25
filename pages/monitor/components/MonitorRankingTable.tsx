import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "@code-proxy/ui/icons";
import type { MonitorBreakdownRow } from "@code-proxy/api-client";
import { Button, DataGrid, type DataGridColumn } from "@code-proxy/ui";
import { useMediaQuery } from "../hooks/useMediaQuery";

export type RankingBreakpoint = "sm" | "md" | "lg" | "xl" | "2xl";

export interface RankingColumn {
  key: string;
  header: string;
  /** 指标口径：表头文字带点状下划线，悬停看说明。 */
  headerHint?: ReactNode;
  align?: "left" | "right";
  /** 设计像素宽度。第一列（名称）是它的最小宽度，其余列剩下的宽度都给它。 */
  width?: number;
  /** 窗口达到某个断点后的宽度（名称列在宽屏上多留一些）。 */
  widthAt?: Partial<Record<RankingBreakpoint, number>>;
  /** 窗口达到这个断点才显示：窄屏按重要性收起次要列，而不是让表格横向滚出卡片。 */
  minBreakpoint?: RankingBreakpoint;
  render: (row: MonitorBreakdownRow, index: number) => ReactNode;
}

const BREAKPOINTS: readonly RankingBreakpoint[] = ["sm", "md", "lg", "xl", "2xl"];

/** 与 Tailwind 的断点一致（rem 按浏览器初始字号算，不随面板根字号变）。 */
function useBreakpoints(): Record<RankingBreakpoint, boolean> {
  const sm = useMediaQuery("(min-width: 40rem)");
  const md = useMediaQuery("(min-width: 48rem)");
  const lg = useMediaQuery("(min-width: 64rem)");
  const xl = useMediaQuery("(min-width: 80rem)");
  const xxl = useMediaQuery("(min-width: 96rem)");
  return { sm, md, lg, xl, "2xl": xxl };
}

/**
 * 三张排行（模型、渠道、门户用户）共用的表格：第一列是可聚焦的按钮（键盘也能筛选），整行可点，
 * 已筛选的行是选中行的底色。默认显示前 10 行，可展开到后端给的全部（最多 50）。
 * 卡片里的小表：不套外框、按行收高；窄屏按断点收起次要列，名称列吃掉剩下的宽度并截断。
 */
export function MonitorRankingTable({
  rows,
  columns,
  selected,
  onSelect,
  primary,
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
  initialLimit?: number;
  /** 时间窗内的总数（后端只返回最重的一部分）。 */
  total: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const screens = useBreakpoints();
  // 当前命中的断点，拼成字符串当依赖：screens 每次渲染都是新对象。
  const screenKey = BREAKPOINTS.filter((breakpoint) => screens[breakpoint]).join(",");
  const visible = expanded ? rows : rows.slice(0, initialLimit);
  const hiddenCount = rows.length - visible.length;

  const gridColumns = useMemo<DataGridColumn<MonitorBreakdownRow>[]>(() => {
    const active = new Set(screenKey.split(","));
    return columns.map((column, columnIndex) => {
        let width = column.width;
        for (const breakpoint of BREAKPOINTS) {
          const value = column.widthAt?.[breakpoint];
          if (value !== undefined && active.has(breakpoint)) width = value;
        }
        const first = columnIndex === 0;
        return {
          id: column.key,
          header: column.header,
          headerHint: column.headerHint,
          align: column.align === "right" ? "end" : "start",
          width,
          grow: first,
          overflowTooltip: false,
          cell: (row, { rowIndex }) => {
            if (!first) return column.render(row, rowIndex);
            return onSelect && row.key !== "" ? (
              <button
                type="button"
                aria-pressed={selected.includes(row.key)}
                title={t("monitor_center.click_to_filter")}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect?.(row.key);
                }}
                className="block w-full min-w-0 rounded-lg text-left focus-visible:-outline-offset-2"
              >
                {primary(row, rowIndex)}
              </button>
            ) : (
              <span className="block w-full min-w-0">{primary(row, rowIndex)}</span>
            );
          },
        } satisfies DataGridColumn<MonitorBreakdownRow>;
      });
  }, [columns, onSelect, primary, screenKey, selected, t]);
  const hidden = useMemo(() => {
    const active = new Set(screenKey.split(","));
    return new Set(
      columns
        .filter((column) => column.minBreakpoint && !active.has(column.minBreakpoint))
        .map((column) => column.key),
    );
  }, [columns, screenKey]);

  return (
    <DataGrid<MonitorBreakdownRow>
      frame={false}
      label={columns[0]?.header ?? ""}
      columns={gridColumns}
      rows={visible}
      // 「其他」这类汇总行可能 key、label 都相同：带上位置保证唯一。
      rowKey={(row) => `${row.key}:${row.label}:${rows.indexOf(row)}`}
      hiddenColumnIds={hidden}
      resizable={false}
      columnReorder={false}
      onRowClick={
        onSelect
          ? (row) => {
              if (row.key !== "") onSelect(row.key);
            }
          : undefined
      }
      isRowActive={(row) => row.key !== "" && selected.includes(row.key)}
      footer={
        hiddenCount > 0 || expanded || total > rows.length ? (
          <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
            <span>
              {total > rows.length
                ? t("monitor_center.ranking.showing_top", { shown: rows.length, total })
                : null}
            </span>
            {hiddenCount > 0 || expanded ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? t("monitor_center.ranking.collapse")
                  : t("monitor_center.ranking.expand", { count: rows.length })}
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={`transition-[rotate] duration-200 ${expanded ? "rotate-180" : ""}`}
                />
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    />
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
