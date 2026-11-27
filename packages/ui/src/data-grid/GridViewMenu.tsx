import { Icon } from "satin-ui/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { Checkbox } from "../primitives/Checkbox";
import { SegmentedControl } from "../forms/SegmentedControl";
import { GridPopover } from "./GridPopover";
import type { DataGridColumn, GridDensity, GridLines } from "./types";

const DENSITIES: readonly GridDensity[] = ["compact", "default", "comfortable"];
const LINES_OPTIONS: readonly GridLines[] = ["row", "grid"];

/** 三条横线的间距示意三档密度，比文字更快认出来。 */
function DensityGlyph({ density }: { density: GridDensity }) {
  const gap = density === "compact" ? 2.5 : density === "default" ? 3.5 : 4.5;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x="2"
          y={7 - gap + index * gap - 0.6}
          width="10"
          height="1.2"
          rx="0.6"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

/**
 * 视图设置：行密度、显示哪些列、恢复默认视图（同时清掉拖过的列宽）。
 * 冻结列和声明了不可隐藏的列带锁、不能取消勾选——表格不能把自己的主键列藏没了。
 */
export function GridViewMenu<T>({
  columns,
  density,
  onDensityChange,
  lines,
  onLinesChange,
  hiddenColumnIds,
  onHiddenColumnIdsChange,
  onReset,
}: {
  columns: readonly DataGridColumn<T>[];
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  /** Satin 表格线型（行线 / 网格）；传入后在视图菜单中提供分段切换。 */
  lines?: GridLines;
  onLinesChange?: (lines: GridLines) => void;
  hiddenColumnIds: ReadonlySet<string>;
  onHiddenColumnIdsChange: (ids: Set<string>) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const hiddenCount = columns.filter((column) => hiddenColumnIds.has(column.id)).length;

  const toggleColumn = (columnId: string) => {
    const next = new Set(hiddenColumnIds);
    if (next.has(columnId)) next.delete(columnId);
    else next.add(columnId);
    onHiddenColumnIdsChange(next);
  };

  return (
    <>
      <Button
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        className="h-8 px-3 text-xs"
      >
        <Icon name="sliders-horizontal" size={13} />
        {t("data_grid.view")}
        {hiddenCount > 0 ? (
          <span className="sn-badge sn-soft ml-0.5 tabular-nums">
            {t("data_grid.hidden_count", { count: hiddenCount })}
          </span>
        ) : null}
      </Button>
      <GridPopover
        anchor={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        align="end"
        label={t("data_grid.view")}
      >
        <div className="flex w-64 flex-col p-2.5">
          <p className="px-1.5 pb-1.5 pt-0.5 text-xs font-semibold text-[var(--sn-label)]">
            {t("data_grid.density")}
          </p>
          <SegmentedControl
            size="sm"
            value={density}
            onChange={onDensityChange}
            ariaLabel={t("data_grid.density")}
            className="w-full"
            options={DENSITIES.map((item) => ({
              value: item,
              label: (
                <>
                  <DensityGlyph density={item} />
                  {t(`data_grid.density_${item}`)}
                </>
              ),
            }))}
          />

          {lines && onLinesChange ? (
            <>
              <p className="mt-3 border-t border-[var(--sn-line)] px-1.5 pb-1.5 pt-3 text-xs font-semibold text-[var(--sn-label)]">
                {t("data_grid.lines")}
              </p>
              <SegmentedControl
                size="sm"
                value={lines}
                onChange={onLinesChange}
                ariaLabel={t("data_grid.lines")}
                className="w-full"
                options={LINES_OPTIONS.map((item) => ({
                  value: item,
                  label: (
                    <>
                      <Icon name={item === "grid" ? "layout-grid" : "rows-3"} size={13} />
                      {t(`data_grid.lines_${item}`)}
                    </>
                  ),
                }))}
              />
            </>
          ) : null}

          <p className="mt-3 border-t border-[var(--sn-line)] px-1.5 pb-1 pt-3 text-xs font-semibold text-[var(--sn-label)]">
            {t("data_grid.columns")}
          </p>
          <div
            className="-mx-1 max-h-[min(26rem,50vh)] overflow-y-auto px-1"
            role="group"
            aria-label={t("data_grid.columns")}
          >
            {columns.map((column) => {
              const locked = Boolean(column.pin) || column.hideable === false;
              const visible = !hiddenColumnIds.has(column.id);
              return (
                <label
                  key={column.id}
                  className={[
                    "flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    locked
                      ? "cursor-default text-sn-label3"
                      : "cursor-pointer text-sn-label2 hover:bg-sn-hover hover:text-sn-label",
                  ].join(" ")}
                >
                  <Checkbox
                    checked={visible}
                    disabled={locked}
                    onCheckedChange={() => toggleColumn(column.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{column.header}</span>
                  {locked ? (
                    <span
                      className="inline-flex shrink-0 items-center text-sn-label-off"
                      role="img"
                      aria-label={t("data_grid.column_locked")}
                    >
                      <Icon name="lock" size={12} />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-2 border-t border-sn-line pt-2">
            <button
              type="button"
              onClick={() => {
                onReset();
                setAnchor(null);
              }}
              className="inline-flex h-8 w-full items-center gap-2 rounded-lg px-2 text-xs font-medium text-sn-label2 transition-colors hover:bg-sn-hover hover:text-sn-label"
            >
              <Icon name="rotate-ccw" size={13} />
              {t("data_grid.reset_view")}
            </button>
          </div>
        </div>
      </GridPopover>
    </>
  );
}
