import { Icon } from "satin-ui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { isGridFilterActive } from "./gridModel";
import { emptyFilterDraft, GridFilterEditor, isFilterDraftInvalid } from "./GridFilterEditors";
import type { DataGridColumn, GridFilterValue, GridSort, GridSortDirection } from "./types";

/**
 * 表头的列菜单：排序（升 / 降，再点一次取消）、筛选编辑器、隐藏此列。
 * 筛选改的是草稿，按「应用」或回车才生效，换列、点外部关闭都会丢弃草稿——
 * 服务端分页的表每次生效都要发请求，边勾边查会连发一串请求。
 */
export function GridColumnMenu<T>({
  column,
  sort,
  onSortChange,
  filterValue,
  onApplyFilter,
  onHide,
  onClose,
}: {
  column: DataGridColumn<T>;
  sort: GridSort | null | undefined;
  onSortChange?: (sort: GridSort | null) => void;
  filterValue: GridFilterValue | undefined;
  onApplyFilter?: (value: GridFilterValue | undefined) => void;
  onHide?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const filter = column.filter;
  const [draft, setDraft] = useState<GridFilterValue | null>(() =>
    filter ? (filterValue ?? emptyFilterDraft(filter)) : null,
  );
  const activeDirection = sort?.columnId === column.id ? sort.direction : null;
  const canSort = Boolean(column.sortable && onSortChange);
  const canFilter = Boolean(filter && draft && onApplyFilter);

  const chooseSort = (direction: GridSortDirection) => {
    if (!onSortChange) return;
    onSortChange(activeDirection === direction ? null : { columnId: column.id, direction });
  };

  const apply = () => {
    if (!draft || !onApplyFilter || isFilterDraftInvalid(draft)) return;
    onApplyFilter(isGridFilterActive(draft) ? draft : undefined);
    onClose();
  };

  const reset = () => {
    if (!filter) return;
    setDraft(emptyFilterDraft(filter));
    if (isGridFilterActive(filterValue)) {
      onApplyFilter?.(undefined);
      onClose();
    }
  };

  const sortButton = (direction: GridSortDirection) => {
    const active = activeDirection === direction;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => chooseSort(direction)}
        className={[
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ease-soft",
          active
            ? "bg-surface text-ink shadow-control"
            : "text-ink-2 hover:bg-hover hover:text-ink",
        ].join(" ")}
      >
        <Icon name={direction === "asc" ? "arrow-up" : "arrow-down"} size={13} />
        {direction === "asc" ? t("data_grid.sort_asc") : t("data_grid.sort_desc")}
      </button>
    );
  };

  return (
    <div className="flex w-[18.5rem] max-w-[calc(100vw-2rem)] flex-col p-2">
      <div className="flex min-h-7 items-center justify-between gap-2 px-2 pb-1.5">
        <span className="truncate text-xs font-semibold text-ink">{column.header}</span>
        {onHide ? (
          <button
            type="button"
            onClick={() => {
              onHide();
              onClose();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs text-ink-3 transition-colors hover:text-ink"
          >
            <Icon name="eye-off" size={12} />
            {t("data_grid.hide_column")}
          </button>
        ) : null}
      </div>

      {canSort ? (
        <div
          className="grid grid-cols-2 gap-1 rounded-[var(--sn-btn-r)] bg-track p-1"
          role="group"
          aria-label={t("data_grid.sort")}
        >
          {sortButton("asc")}
          {sortButton("desc")}
        </div>
      ) : null}

      {canFilter && filter && draft ? (
        <>
          <div className={canSort ? "mt-2 border-t border-line pt-2.5" : "pt-1"}>
            <GridFilterEditor
              filter={filter}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={apply}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-line pt-2">
            <Button size="xs" variant="ghost" onClick={reset}>
              {t("data_grid.reset")}
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={apply}
              disabled={isFilterDraftInvalid(draft)}
            >
              {t("data_grid.apply")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
