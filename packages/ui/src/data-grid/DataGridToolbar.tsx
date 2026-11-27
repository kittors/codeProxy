import { Icon } from "satin-ui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { GridPopover } from "./GridPopover";
import { OptionsFilterEditor } from "./GridFilterEditors";
import { listGridFilterChips } from "./gridFilterText";
import { isGridFilterActive, setGridFilter } from "./gridModel";
import type { DataGridColumn, GridFilterOption, GridFilters } from "./types";

/**
 * 表格上方独立的筛选区。
 *
 * 第一行：搜索框 + 常用维度的分面按钮（用户、模型、渠道、状态）+ 右侧工具；
 * 第二行：已生效筛选的芯片（来自分面按钮和表头菜单的同一份筛选状态）与「清除全部」。
 * 筛选区和表头菜单是同一份筛选的两个入口，所以芯片能说清「现在表里到底筛了什么」——
 * 旧页面的筛选散落在一排下拉里，收起以后看不出哪些下拉被动过。
 */
export function DataGridToolbar({
  children,
  end,
  chips,
}: {
  /** 搜索框与分面按钮。 */
  children: ReactNode;
  /** 右侧工具（视图设置、导出、刷新）。 */
  end?: ReactNode;
  /** 已生效筛选的芯片行，一般是 <GridFilterChips>。 */
  chips?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" role="search">
      {/* 左侧换行时，右侧工具留在第一行（self-start），不悬在两行中间。 */}
      <div className="-m-1 flex items-start gap-2 p-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
        {end ? <div className="flex shrink-0 items-center gap-1.5 self-start">{end}</div> : null}
      </div>
      {chips}
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/** 搜索框：按「/」从页面任何地方聚焦（正在输入时不抢），Esc 清空。 */
export function GridSearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={[
        "sn-ib sn-has-pre sn-has-post min-w-[12rem]",
        value ? "sn-filled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="sn-pre flex items-center justify-center" aria-hidden="true">
        <Icon name="search" size={14} />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="sn-input sn-sm !h-8 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="sn-post">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label={t("data_grid.clear_search")}
            className="sn-clear"
          >
            <Icon name="x" size={12} />
          </button>
        ) : focused ? null : (
          <kbd aria-hidden="true" className="sn-kbd">
            /
          </kbd>
        )}
      </span>
    </div>
  );
}

/**
 * 分面筛选按钮：没筛时是 Satin 8px 描边按钮「模型 ▾」；筛了以后变成淡底高亮，标签后面亮出选中个数。
 *
 * 宽度在筛与不筛之间完全不变：个数徽标的位置一直留着（没筛时透明），数字用等宽数字。
 * 以前这里写出第一个选中值，按钮随值的长短伸缩，把后面的按钮挤得跳来跳去（用户 11-18 反馈）；
 * 选中了什么交给下面那行芯片去写。
 */
export function GridFacetFilter({
  columnId,
  label,
  icon,
  options,
  filters,
  onFiltersChange,
}: {
  columnId: string;
  label: string;
  icon?: ReactNode;
  options: readonly GridFilterOption[];
  filters: GridFilters | undefined;
  onFiltersChange: (filters: GridFilters) => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = filters?.[columnId];
  const values = current?.type === "options" ? current.values : [];
  const [draft, setDraft] = useState<string[]>([]);
  const open = Boolean(anchor);
  const active = isGridFilterActive(current);

  const close = () => setAnchor(null);
  const apply = () => {
    onFiltersChange(
      setGridFilter(
        filters,
        columnId,
        draft.length ? { type: "options", values: draft } : undefined,
      ),
    );
    close();
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={active ? "true" : undefined}
        onClick={(event) => {
          if (open) {
            close();
            return;
          }
          setDraft([...values]);
          setAnchor(event.currentTarget);
        }}
        className={[
          "sn-btn sn-secondary sn-sm !h-8 shrink-0 !pl-3.5 !pr-2.5",
          open ? "sn-is-open" : "",
          active ? "!bg-[var(--sn-fill-active)] !text-[var(--sn-label)]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {icon ? <span className="flex shrink-0 items-center text-[var(--sn-label3)]">{icon}</span> : null}
        <span className="shrink-0">{label}</span>
        {/* 箭头与个数徽标共用一个固定宽度的位置：没筛时是箭头，筛了以后换成个数，按钮宽度不变。 */}
        <span className="relative inline-flex h-4 w-[1.375rem] shrink-0 items-center justify-center">
          <Icon
            name="chevron-down"
            size={13}
            className={[
              "text-[var(--sn-label3)] transition-[rotate,opacity,scale] duration-200 ease-sn-strong",
              open ? "rotate-180" : "",
              active ? "scale-75 opacity-0" : "opacity-100",
            ].join(" ")}
          />
          <span
            aria-hidden={active ? undefined : true}
            className={[
              "absolute inset-0 inline-flex items-center justify-center rounded-full text-2xs font-semibold tabular-nums transition-[opacity,scale] duration-200 ease-sn-strong",
              active
                ? "bg-[var(--sn-accent)] text-[var(--sn-on-primary)] opacity-100"
                : "scale-75 opacity-0",
            ].join(" ")}
          >
            {active ? (values.length > 99 ? "99+" : values.length) : null}
          </span>
        </span>
      </button>
      <GridPopover
        anchor={anchor}
        open={open}
        onClose={close}
        label={t("data_grid.filter_column", { column: label })}
      >
        <div className="flex w-[18.5rem] max-w-[calc(100vw-2rem)] flex-col p-2">
          <OptionsFilterEditor
            filter={{ type: "options", options, searchable: options.length > 7 }}
            values={draft}
            onChange={setDraft}
            onSubmit={apply}
          />
          <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-sn-line pt-2">
            <Button size="xs" variant="ghost" onClick={() => setDraft([])}>
              {t("data_grid.reset")}
            </Button>
            <Button size="xs" variant="primary" onClick={apply}>
              {t("data_grid.apply")}
            </Button>
          </div>
        </div>
      </GridPopover>
    </>
  );
}

/**
 * 已生效筛选的芯片；每个芯片单独移除，最后是「清除全部」。
 *
 * 这一行高度固定、只占一行：没有筛选时显示一句淡色提示占位，芯片多了就在行内横向滚动，
 * 不换行。以前没有筛选时整行收起、芯片多了换成两行，筛选一变下面的表格就跟着变矮变高
 * （用户 11-18 反馈「表格高度变形」）。
 */
export function GridFilterChips<T>({
  columns,
  filters,
  onFiltersChange,
  extra,
  placeholder,
}: {
  columns: readonly DataGridColumn<T>[];
  filters: GridFilters | undefined;
  onFiltersChange: (filters: GridFilters) => void;
  /** 不属于列的筛选（例如搜索词）也想显示成芯片时传进来。 */
  extra?: readonly { id: string; label: string; onRemove: () => void }[];
  /** 没有筛选时占位的提示文字。 */
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const chips = [
    ...(extra ?? []).map((chip) => ({
      id: `extra:${chip.id}`,
      label: chip.label,
      onRemove: chip.onRemove,
    })),
    ...listGridFilterChips(columns, filters, t).map((chip) => ({
      id: chip.columnId,
      label: chip.label,
      onRemove: () => onFiltersChange(setGridFilter(filters, chip.columnId, undefined)),
    })),
  ];

  return (
    <div className="relative h-7 min-w-0">
      {chips.length === 0 ? (
        <p className="absolute inset-0 flex items-center px-1 text-xs text-sn-label3 transition-opacity duration-150 ease-sn-out">
          {placeholder ?? t("data_grid.no_active_filters")}
        </p>
      ) : null}
      <ul
        className="flex h-7 min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("data_grid.active_filters")}
      >
        {chips.map((chip) => (
          <li
            key={chip.id}
            className="sn-chip sn-tag sn-pop-in !h-7 max-w-[22rem] shrink-0 !gap-1.5 !text-xs"
          >
            <span className="min-w-0 truncate">{chip.label}</span>
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={t("data_grid.remove_filter", { filter: chip.label })}
              className="sn-x"
            >
              <Icon name="x" size={11} />
            </button>
          </li>
        ))}
        {chips.length > 0 ? (
          <li key="clear-all" className="shrink-0">
            <button
              type="button"
              onClick={() => {
                onFiltersChange({});
                for (const chip of extra ?? []) chip.onRemove();
              }}
              className="sn-btn sn-ghost sn-sm !h-7 whitespace-nowrap"
            >
              {t("data_grid.clear_all_filters")}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
