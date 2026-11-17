import { Search } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "../primitives/Checkbox";
import { TextInput } from "../primitives/Input";
import { formatInteger } from "./gridFormat";
import type { GridColumnFilter, GridFilterOption, GridFilterValue } from "./types";

/**
 * 三种筛选的编辑器：选项（多选 + 搜索 + 占比条）、区间（预设 + 最小 / 最大）、文字（包含）。
 * 只编辑草稿，「应用」由外层面板决定——表头菜单和筛选区的分面按钮共用它们，
 * 两个入口改的是同一份筛选状态，芯片、表头的激活标记都跟着它走。
 */

type OptionsFilter = Extract<GridColumnFilter, { type: "options" }>;
type RangeFilter = Extract<GridColumnFilter, { type: "range" }>;

/** 选项超过这个数才显示搜索框，几个选项还要先搜一下是负担。 */
const SEARCH_THRESHOLD = 7;

export function OptionsFilterEditor({
  filter,
  values,
  onChange,
  onSubmit,
}: {
  filter: OptionsFilter;
  values: readonly string[];
  onChange: (values: string[]) => void;
  onSubmit?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const showSearch = filter.searchable ?? filter.options.length > SEARCH_THRESHOLD;
  const selected = useMemo(() => new Set(values), [values]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(
    () =>
      normalizedQuery
        ? filter.options.filter((option) =>
            `${option.label} ${option.value} ${option.searchText ?? ""}`
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        : filter.options,
    [filter.options, normalizedQuery],
  );
  const maxCount = useMemo(
    () => Math.max(0, ...filter.options.map((option) => option.count ?? 0)),
    [filter.options],
  );

  const toggle = (option: GridFilterOption) => {
    const next = new Set(selected);
    if (next.has(option.value)) next.delete(option.value);
    else next.add(option.value);
    // 保持选项原有顺序，芯片里的文字才稳定。
    onChange(filter.options.map((item) => item.value).filter((value) => next.has(value)));
  };

  const selectVisible = () => {
    const next = new Set(selected);
    for (const option of visible) next.add(option.value);
    onChange(filter.options.map((item) => item.value).filter((value) => next.has(value)));
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {showSearch ? (
        <TextInput
          data-autofocus
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={t("data_grid.search_options")}
          startAdornment={<Search size={14} className="text-ink-3" aria-hidden="true" />}
        />
      ) : null}
      <div className="flex items-center justify-between px-2 pt-0.5 text-xs text-ink-3">
        <span aria-live="polite">
          {values.length > 0
            ? t("data_grid.selected_count", { count: values.length })
            : t("data_grid.all_values")}
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-md font-medium text-ink-2 transition-colors hover:text-ink"
            onClick={selectVisible}
          >
            {normalizedQuery ? t("data_grid.select_matching") : t("data_grid.select_all")}
          </button>
          <button
            type="button"
            className="rounded-md font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
            onClick={() => onChange([])}
            disabled={values.length === 0}
          >
            {t("data_grid.clear")}
          </button>
        </span>
      </div>
      <div className="-mx-1 max-h-64 overflow-y-auto px-1" role="group">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-3">{t("data_grid.no_options")}</p>
        ) : (
          visible.map((option) => {
            const checked = selected.has(option.value);
            const share = maxCount > 0 && option.count ? option.count / maxCount : 0;
            return (
              <label
                key={option.value}
                className="group/option relative flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink has-[:checked]:text-ink"
              >
                {/* 占比条：一眼看出哪个取值占大头，筛之前就知道会剩多少行。 */}
                {share > 0 ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-1 left-0 rounded-md bg-ink/[0.045] transition-[width] duration-300 ease-soft dark:bg-white/[0.05]"
                    style={{ width: `${Math.max(4, share * 100)}%` }}
                  />
                ) : null}
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(option)}
                  className="relative"
                />
                {option.icon ? (
                  <span className="relative flex shrink-0 items-center">{option.icon}</span>
                ) : null}
                <span className="relative min-w-0 flex-1 truncate">{option.label}</span>
                {typeof option.count === "number" ? (
                  <span className="relative shrink-0 text-xs tabular-nums text-ink-3">
                    {formatInteger(option.count, i18n.resolvedLanguage)}
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

const parseNumber = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
};

export function RangeFilterEditor({
  filter,
  value,
  onChange,
  onSubmit,
}: {
  filter: RangeFilter;
  value: { min?: number; max?: number };
  onChange: (value: { min?: number; max?: number }) => void;
  onSubmit?: () => void;
}) {
  const { t } = useTranslation();
  const [minText, setMinText] = useState(value.min === undefined ? "" : String(value.min));
  const [maxText, setMaxText] = useState(value.max === undefined ? "" : String(value.max));
  const invalid = value.min !== undefined && value.max !== undefined && value.min > value.max;

  const update = (nextMin: string, nextMax: string) => {
    setMinText(nextMin);
    setMaxText(nextMax);
    onChange({ min: parseNumber(nextMin), max: parseNumber(nextMax) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !invalid) {
      event.preventDefault();
      onSubmit?.();
    }
  };

  const unit = filter.unit ? (
    <span className="text-xs text-ink-3" aria-hidden="true">
      {filter.unit}
    </span>
  ) : null;

  return (
    <div className="flex flex-col gap-3 px-1">
      {filter.presets?.length ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("data_grid.presets")}>
          {filter.presets.map((preset) => {
            const active = preset.min === value.min && preset.max === value.max;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  update(
                    preset.min === undefined ? "" : String(preset.min),
                    preset.max === undefined ? "" : String(preset.max),
                  )
                }
                className={[
                  "h-7 rounded-full px-2.5 text-xs font-medium tabular-nums transition-[background-color,color,box-shadow,scale] duration-150 ease-soft active:scale-[0.96]",
                  active
                    ? "bg-accent text-accent-fg"
                    : "bg-ink/[0.05] text-ink-2 hover:bg-ink/[0.08] hover:text-ink dark:bg-white/[0.07] dark:hover:bg-white/[0.1]",
                ].join(" ")}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TextInput
          data-autofocus
          size="sm"
          inputMode="decimal"
          value={minText}
          onChange={(event) => update(event.currentTarget.value, maxText)}
          onKeyDown={onKeyDown}
          placeholder={t("data_grid.min")}
          aria-label={t("data_grid.min")}
          invalid={invalid}
          endAdornment={unit}
          className="tabular-nums"
        />
        <span className="text-ink-4" aria-hidden="true">
          –
        </span>
        <TextInput
          size="sm"
          inputMode="decimal"
          value={maxText}
          onChange={(event) => update(minText, event.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={t("data_grid.max")}
          aria-label={t("data_grid.max")}
          invalid={invalid}
          endAdornment={unit}
          className="tabular-nums"
        />
      </div>
      {invalid ? (
        <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
          {t("data_grid.range_invalid")}
        </p>
      ) : null}
    </div>
  );
}

export function TextFilterEditor({
  placeholder,
  query,
  onChange,
  onSubmit,
}: {
  placeholder?: string;
  query: string;
  onChange: (query: string) => void;
  onSubmit?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-1">
      <TextInput
        data-autofocus
        size="sm"
        value={query}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder ?? t("data_grid.contains_placeholder")}
        startAdornment={<Search size={14} className="text-ink-3" aria-hidden="true" />}
      />
    </div>
  );
}

/** 列筛选声明对应的空草稿。 */
export function emptyFilterDraft(filter: GridColumnFilter): GridFilterValue {
  switch (filter.type) {
    case "options":
      return { type: "options", values: [] };
    case "range":
      return { type: "range" };
    case "text":
    default:
      return { type: "text", query: "" };
  }
}

/** 区间草稿是否非法（最小值大于最大值）——非法时「应用」按钮禁用。 */
export function isFilterDraftInvalid(draft: GridFilterValue): boolean {
  return (
    draft.type === "range" &&
    draft.min !== undefined &&
    draft.max !== undefined &&
    draft.min > draft.max
  );
}

export function GridFilterEditor({
  filter,
  draft,
  onDraftChange,
  onSubmit,
}: {
  filter: GridColumnFilter;
  draft: GridFilterValue;
  onDraftChange: (draft: GridFilterValue) => void;
  onSubmit?: () => void;
}) {
  if (filter.type === "options") {
    return (
      <OptionsFilterEditor
        filter={filter}
        values={draft.type === "options" ? draft.values : []}
        onChange={(values) => onDraftChange({ type: "options", values })}
        onSubmit={onSubmit}
      />
    );
  }
  if (filter.type === "range") {
    return (
      <RangeFilterEditor
        filter={filter}
        value={draft.type === "range" ? draft : {}}
        onChange={(value) => onDraftChange({ type: "range", ...value })}
        onSubmit={onSubmit}
      />
    );
  }
  return (
    <TextFilterEditor
      placeholder={filter.placeholder}
      query={draft.type === "text" ? draft.query : ""}
      onChange={(query) => onDraftChange({ type: "text", query })}
      onSubmit={onSubmit}
    />
  );
}
