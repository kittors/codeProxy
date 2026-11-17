import {
  DataGridToolbar,
  GridFacetFilter,
  GridFilterChips,
  GridViewMenu,
  Tabs,
  TabsList,
  TabsTrigger,
  setGridFilter,
  type DataGridColumn,
  type GridFilterOption,
  type GridFilters,
  type UseGridPreferencesResult,
} from "@code-proxy/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RequestLogGuardFilter } from "./RequestLogGuardFilter";
import type { GuardFilterValue } from "./requestLogGuard";
import type { RequestLogsRow } from "./requestLogsRow";

type StatusTab = "all" | "success" | "failed";

function statusTabOf(filters: GridFilters): StatusTab {
  const value = filters.status;
  if (value?.type !== "options" || value.values.length !== 1) return "all";
  return value.values[0] === "success" || value.values[0] === "failed" ? value.values[0] : "all";
}

export interface RequestLogFacet {
  columnId: "identity" | "model" | "channel" | "agent";
  label: string;
  options: readonly GridFilterOption[];
}

/**
 * 请求日志的筛选区：一块淡底，和表格分开。第一行是状态页签与各分面按钮（用户 / Key、模型、渠道、
 * Agent、循环保护），右侧是视图菜单；第二行固定高度的芯片行写明当前到底筛了什么，没有筛选时
 * 是一行占位文字——芯片出现、消失都不会把下面的表格顶得上下跳。
 */
export function RequestLogFilterBar({
  columns,
  filters,
  onFiltersChange,
  facets,
  guard,
  prefs,
  end,
}: {
  columns: readonly DataGridColumn<RequestLogsRow>[];
  filters: GridFilters;
  onFiltersChange: (filters: GridFilters) => void;
  facets: readonly RequestLogFacet[];
  /** 循环保护的筛选；后端不支持或没有可筛的就不传（见 guardFilterVisible）。 */
  guard?: { value: GuardFilterValue; kinds: readonly string[]; onChange: (value: GuardFilterValue) => void };
  prefs: UseGridPreferencesResult;
  end?: ReactNode;
}) {
  const { t } = useTranslation();
  const status = statusTabOf(filters);
  return (
    <div className="rounded-2xl bg-subtle p-2">
      <DataGridToolbar
        end={
          <>
            {end}
            <GridViewMenu
              columns={columns}
              density={prefs.density}
              onDensityChange={prefs.setDensity}
              hiddenColumnIds={prefs.hiddenColumnIds}
              onHiddenColumnIdsChange={prefs.setHiddenColumnIds}
              onReset={prefs.resetView}
            />
          </>
        }
        chips={
          <GridFilterChips
            columns={columns}
            filters={filters}
            onFiltersChange={onFiltersChange}
            extra={
              guard && guard.value !== "all"
                ? [
                    {
                      id: "guard",
                      label: `${t("request_logs.guard_filter_label")}：${t(`request_logs.guard_filter_${guard.value}`)}`,
                      onRemove: () => guard.onChange("all"),
                    },
                  ]
                : []
            }
            placeholder={t("request_logs.no_active_filters")}
          />
        }
      >
        <Tabs
          value={status}
          onValueChange={(next) =>
            onFiltersChange(
              setGridFilter(
                filters,
                "status",
                next === "all" ? undefined : { type: "options", values: [next] },
              ),
            )
          }
        >
          <TabsList aria-label={t("request_logs.filter_status")}>
            <TabsTrigger value="all">{t("request_logs.status_all")}</TabsTrigger>
            <TabsTrigger value="success">{t("request_logs.status_success")}</TabsTrigger>
            <TabsTrigger value="failed">{t("request_logs.status_failed")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {facets.map((facet) => (
          <GridFacetFilter
            key={facet.columnId}
            columnId={facet.columnId}
            label={facet.label}
            options={facet.options}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        ))}
        {guard ? (
          <RequestLogGuardFilter
            value={guard.value}
            kinds={guard.kinds}
            onChange={guard.onChange}
            className="w-auto"
          />
        ) : null}
      </DataGridToolbar>
    </div>
  );
}
