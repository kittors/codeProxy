import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { EASE_POP } from "../utils/motion";
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
        "group/search relative flex h-8 min-w-[12rem] items-center rounded-full bg-field shadow-control transition-shadow duration-150 ease-soft hover:shadow-control-hover focus-within:shadow-control-focus",
        className ?? "",
      ].join(" ")}
    >
      <Search
        size={14}
        className="pointer-events-none absolute left-3 text-ink-3"
        aria-hidden="true"
      />
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
        className="h-full w-full min-w-0 rounded-full bg-transparent pl-8 pr-9 text-xs text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label={t("data_grid.clear_search")}
          className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : focused ? null : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 rounded-md bg-ink/[0.06] px-1.5 font-mono text-2xs text-ink-3 dark:bg-white/[0.08]"
        >
          /
        </kbd>
      )}
    </div>
  );
}

/**
 * 分面筛选按钮：没筛时是普通描边胶囊「模型 ▾」；筛了以后变成淡底高亮，
 * 写出选中的第一个值和 +N，不用点开就知道筛了什么。
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
  const firstLabel = active
    ? (options.find((option) => option.value === values[0])?.label ?? values[0])
    : null;

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
          "inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-[background-color,box-shadow,color,scale] duration-150 ease-soft active:scale-[0.97]",
          active
            ? "bg-accent-soft text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--cp-focus)_35%,transparent)]"
            : "bg-surface text-ink-2 shadow-control hover:bg-surface-hover hover:text-ink hover:shadow-control-hover",
        ].join(" ")}
      >
        {icon ? <span className="flex shrink-0 items-center text-ink-3">{icon}</span> : null}
        <span className="shrink-0">{label}</span>
        {active ? (
          <>
            <span className="h-3 w-px shrink-0 bg-line-strong" aria-hidden="true" />
            <span className="min-w-0 truncate font-normal text-ink-2">{firstLabel}</span>
            {values.length > 1 ? (
              <span className="shrink-0 rounded-full bg-ink/[0.08] px-1.5 text-2xs tabular-nums text-ink-2 dark:bg-white/[0.1]">
                +{values.length - 1}
              </span>
            ) : null}
          </>
        ) : null}
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`shrink-0 text-ink-3 transition-[rotate] duration-200 ease-pop ${open ? "rotate-180" : ""}`}
        />
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
          <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-line pt-2">
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

/** 已生效筛选的芯片；每个芯片单独移除，最后是「清除全部」。没有筛选时整行不占高度。 */
export function GridFilterChips<T>({
  columns,
  filters,
  onFiltersChange,
  extra,
}: {
  columns: readonly DataGridColumn<T>[];
  filters: GridFilters | undefined;
  onFiltersChange: (filters: GridFilters) => void;
  /** 不属于列的筛选（例如搜索词）也想显示成芯片时传进来。 */
  extra?: readonly { id: string; label: string; onRemove: () => void }[];
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
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
    <AnimatePresence initial={false}>
      {chips.length > 0 ? (
        <motion.div
          key="chips"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: EASE_POP }}
          className="-m-1 overflow-hidden p-1"
        >
          <ul
            className="flex flex-wrap items-center gap-1.5"
            aria-label={t("data_grid.active_filters")}
          >
            <AnimatePresence initial={false}>
              {chips.map((chip) => (
                <motion.li
                  key={chip.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.18, ease: EASE_POP }}
                  className="inline-flex h-7 max-w-[22rem] items-center gap-1 rounded-full bg-ink/[0.05] pl-2.5 pr-1 text-xs text-ink-2 dark:bg-white/[0.07]"
                >
                  <span className="min-w-0 truncate">{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={t("data_grid.remove_filter", { filter: chip.label })}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.08] hover:text-ink dark:hover:bg-white/[0.1]"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
            <motion.li layout={!reduceMotion} key="clear-all">
              <button
                type="button"
                onClick={() => {
                  onFiltersChange({});
                  for (const chip of extra ?? []) chip.onRemove();
                }}
                className="h-7 rounded-full px-2 text-xs font-medium text-ink-3 transition-colors hover:text-ink"
              >
                {t("data_grid.clear_all_filters")}
              </button>
            </motion.li>
          </ul>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
