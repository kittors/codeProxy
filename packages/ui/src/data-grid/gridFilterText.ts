import { isGridFilterActive } from "./gridModel";
import type { DataGridColumn, GridColumnFilter, GridFilterValue, GridFilters } from "./types";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface GridFilterChip {
  columnId: string;
  label: string;
}

/** 区间值的显示：列上给了 formatValue 就用它，否则数字 + 单位。 */
export function formatRangeValue(filter: GridColumnFilter | undefined, value: number): string {
  if (filter?.type === "range") {
    if (filter.formatValue) return filter.formatValue(value);
    if (filter.unit) return `${value} ${filter.unit}`;
  }
  return String(value);
}

/**
 * 一条筛选的芯片文字：「模型：a、b +2」「耗时 ≥ 10s」「渠道 包含「abc」」。
 * 选项超过两个只列前两个，其余折成 +N，芯片不会被长名字撑满一行。
 */
export function describeGridFilter<T>(
  column: DataGridColumn<T> | undefined,
  columnId: string,
  value: GridFilterValue,
  t: Translate,
): string {
  const header = column?.header ?? columnId;
  if (value.type === "options") {
    const filter = column?.filter;
    const labels = value.values.map((item) =>
      filter?.type === "options"
        ? (filter.options.find((option) => option.value === item)?.label ?? item)
        : item,
    );
    const shown = labels.slice(0, 2).join(t("data_grid.list_separator"));
    const rest = labels.length - 2;
    return rest > 0
      ? t("data_grid.chip_options_more", { column: header, values: shown, rest })
      : t("data_grid.chip_options", { column: header, values: shown });
  }
  if (value.type === "range") {
    const filter = column?.filter;
    const hasMin = Number.isFinite(value.min);
    const hasMax = Number.isFinite(value.max);
    if (hasMin && hasMax) {
      return t("data_grid.chip_between", {
        column: header,
        min: formatRangeValue(filter, value.min as number),
        max: formatRangeValue(filter, value.max as number),
      });
    }
    if (hasMin) {
      return t("data_grid.chip_min", {
        column: header,
        value: formatRangeValue(filter, value.min as number),
      });
    }
    return t("data_grid.chip_max", {
      column: header,
      value: formatRangeValue(filter, value.max as number),
    });
  }
  return t("data_grid.chip_contains", { column: header, query: value.query.trim() });
}

/** 按列声明顺序列出所有生效的筛选芯片。 */
export function listGridFilterChips<T>(
  columns: readonly DataGridColumn<T>[],
  filters: GridFilters | undefined,
  t: Translate,
): GridFilterChip[] {
  if (!filters) return [];
  const order = new Map(columns.map((column, index) => [column.id, index]));
  return Object.entries(filters)
    .filter(([, value]) => isGridFilterActive(value))
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    .map(([columnId, value]) => ({
      columnId,
      label: describeGridFilter(
        columns.find((column) => column.id === columnId),
        columnId,
        value,
        t,
      ),
    }));
}
