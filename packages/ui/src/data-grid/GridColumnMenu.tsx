import { Icon } from "satin-ui/react";
import { initSeg } from "satin-ui";
import { useLayoutEffect, useRef, useState } from "react";
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
  const sortSegRef = useRef<HTMLDivElement | null>(null);
  const sortApiRef = useRef<ReturnType<typeof initSeg> | null>(null);
  const activeSortIndex = activeDirection === "asc" ? 0 : activeDirection === "desc" ? 1 : -1;
  const activeSortIndexRef = useRef(activeSortIndex);
  activeSortIndexRef.current = activeSortIndex;

  useLayoutEffect(() => {
    const el = sortSegRef.current;
    if (!canSort || !el) return undefined;
    const api = initSeg(el, undefined, activeSortIndexRef.current, {
      role: "none",
      controlled: true,
      fitScroll: false,
      keyboard: false,
    });
    sortApiRef.current = api;
    return () => {
      api.destroy();
      if (sortApiRef.current === api) sortApiRef.current = null;
    };
  }, [canSort]);

  useLayoutEffect(() => {
    sortApiRef.current?.sync(activeSortIndex, false);
  }, [activeSortIndex]);

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
        aria-selected={active}
        onClick={() => chooseSort(direction)}
        className="!inline-flex items-center justify-center gap-1.5 !px-2"
      >
        <Icon name={direction === "asc" ? "arrow-up" : "arrow-down"} size={13} />
        {direction === "asc" ? t("data_grid.sort_asc") : t("data_grid.sort_desc")}
      </button>
    );
  };

  return (
    <div className="flex w-[18.5rem] max-w-[calc(100vw-2rem)] flex-col p-2.5">
      <div className="flex min-h-7 items-center justify-between gap-2 px-1.5 pb-1.5">
        <span className="truncate text-xs font-semibold text-[var(--sn-label)]">{column.header}</span>
        {onHide ? (
          <button
            type="button"
            onClick={() => {
              onHide();
              onClose();
            }}
            className="sn-textbtn sn-quiet !h-6 !text-xs"
          >
            <Icon name="eye-off" size={12} />
            {t("data_grid.hide_column")}
          </button>
        ) : null}
      </div>

      {canSort ? (
        <div
          ref={sortSegRef}
          className="sn-seg sn-sm !grid w-full"
          role="group"
          aria-label={t("data_grid.sort")}
        >
          <span aria-hidden="true" className="sn-thumb" style={{ opacity: 0 }} />
          {sortButton("asc")}
          {sortButton("desc")}
        </div>
      ) : null}

      {canFilter && filter && draft ? (
        <>
          <div className={canSort ? "mt-2 border-t border-sn-line pt-2.5" : "pt-1"}>
            <GridFilterEditor
              filter={filter}
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={apply}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-sn-line pt-2">
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
