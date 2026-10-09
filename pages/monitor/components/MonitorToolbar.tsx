import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, KeyRound, RefreshCw, Timer, UserRound, X } from "lucide-react";
import {
  MONITOR_RANGE_KEYS,
  type MonitorFilterOption,
  type MonitorOverview,
  type MonitorRangeKey,
} from "@code-proxy/api-client";
import { VendorIcon } from "@code-proxy/assets";
import {
  iconHueClass,
  Button,
  SearchableCheckboxMultiSelect,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  type SearchableCheckboxMultiSelectOption,
} from "@code-proxy/ui";
import { isLegacyRangeSupported } from "../model/legacyOverview";
import { formatMonitorAgo, formatMonitorCompact, formatMonitorStamp } from "../model/monitorFormat";
import {
  MONITOR_REFRESH_SECONDS,
  hasMonitorFilters,
  type MonitorFilterDimension,
  type MonitorRefreshSeconds,
  type MonitorViewQuery,
} from "../model/monitorQueryState";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const DIMENSIONS: MonitorFilterDimension[] = ["consumers", "models", "channels"];

export interface MonitorToolbarProps {
  query: MonitorViewQuery;
  overview: MonitorOverview | null;
  legacy: boolean;
  refreshing: boolean;
  error: string | null;
  updatedAt: number | null;
  refreshSeconds: MonitorRefreshSeconds;
  onRangeChange: (range: MonitorRangeKey) => void;
  onFilterChange: (dimension: MonitorFilterDimension, values: string[]) => void;
  onToggleFilter: (dimension: MonitorFilterDimension, value: string) => void;
  onClearFilters: () => void;
  onRefreshSecondsChange: (value: MonitorRefreshSeconds) => void;
  onRefresh: () => void;
}

/**
 * 页头：标题、实时状态、自动刷新；下面一行是时间范围与三个维度的筛选。
 *
 * 页头直接落在外壳内容区上，不再包一张卡片：内容区本身就是页面的面板，页头再套一层卡、
 * 行与行之间再画分隔线，下面的指标卡就成了「卡片里的卡片」。行之间靠留白分开。
 */
export function MonitorToolbar(props: MonitorToolbarProps) {
  const { t } = useTranslation();
  const { query, overview, legacy } = props;

  return (
    <section className="relative space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
              <Activity size={18} aria-hidden="true" className={`text-ink-3 ${iconHueClass(Activity)}`} />
              {t("monitor_center.title")}
            </h2>
            <LiveStatus {...props} t={t} />
          </div>
          <p className="mt-1 text-xs text-ink-3">{rangeCaption(overview, legacy, t)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32">
            <Select
              size="sm"
              value={String(props.refreshSeconds)}
              onChange={(value) =>
                props.onRefreshSecondsChange(Number(value) as MonitorRefreshSeconds)
              }
              aria-label={t("monitor_center.auto_refresh")}
              options={MONITOR_REFRESH_SECONDS.map((seconds) => ({
                value: String(seconds),
                label: t(`monitor_center.auto_refresh_${seconds}`),
                triggerLabel: (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Timer size={14} className={`shrink-0 text-ink-3 ${iconHueClass(Timer)}`} aria-hidden="true" />
                    <span className="truncate">
                      {t(`monitor_center.auto_refresh_short_${seconds}`)}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>
          <Button size="sm" onClick={props.onRefresh} disabled={props.refreshing}>
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={props.refreshing ? "motion-safe:animate-spin" : undefined}
            />
            {t("monitor_center.refresh")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tabs
          value={query.range}
          onValueChange={(value) => props.onRangeChange(value as MonitorRangeKey)}
          size="sm"
        >
          <TabsList aria-label={t("monitor_center.range_label")}>
            {MONITOR_RANGE_KEYS.map((range) => (
              <TabsTrigger
                key={range}
                value={range}
                disabled={legacy && !isLegacyRangeSupported(range)}
                className="disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t(`monitor_center.range.${range}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {legacy ? null : (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {DIMENSIONS.map((dimension) => (
              <FilterSelect
                key={dimension}
                dimension={dimension}
                value={query[dimension]}
                options={overview?.filters[dimension] ?? []}
                onChange={(values) => props.onFilterChange(dimension, values)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {hasMonitorFilters(query) ? (
        <ActiveFilterChips
          query={query}
          overview={overview}
          onRemove={props.onToggleFilter}
          onClear={props.onClearFilters}
          t={t}
        />
      ) : null}
    </section>
  );
}

function rangeCaption(overview: MonitorOverview | null, legacy: boolean, t: Translate): string {
  if (!overview) return t("monitor_center.subtitle");
  const range = overview.range;
  if (legacy || !range.start || !range.end) return t("monitor_center.subtitle");
  const step =
    range.step_seconds >= 86_400
      ? t("monitor_center.step_day")
      : range.step_seconds >= 3_600
        ? t("monitor_center.step_hours", { count: range.step_seconds / 3_600 })
        : t("monitor_center.step_minutes", { count: range.step_seconds / 60 });
  const span = `${formatMonitorStamp(range.start)} – ${formatMonitorStamp(range.end)}`;
  return t("monitor_center.range_caption", { span, step, timezone: range.timezone });
}

function LiveStatus({
  refreshing,
  error,
  updatedAt,
  refreshSeconds,
  legacy,
  t,
}: MonitorToolbarProps & { t: Translate }) {
  // 「N 秒前更新」每 5 秒走一次就够了，不必每秒重渲染整个页头。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setNow(Date.now()), [updatedAt]);

  const ago = updatedAt ? formatMonitorAgo(updatedAt, now, t) : "";
  const state = refreshing
    ? "updating"
    : error
      ? "failed"
      : refreshSeconds === 0 || legacy
        ? "paused"
        : "live";
  // 正在刷新是进行中的状态，用强调色；天蓝留给「说明」类提示。
  const dotClass = {
    updating: "bg-accent",
    failed: "bg-rose-500",
    paused: "bg-ink-4",
    live: "bg-emerald-500",
  }[state];
  const label = {
    updating: t("monitor_center.status_updating"),
    failed: t("monitor_center.status_failed"),
    paused: ago
      ? t("monitor_center.status_paused", { ago })
      : t("monitor_center.status_paused_idle"),
    live: ago ? t("monitor_center.status_live", { ago }) : t("monitor_center.status_live_idle"),
  }[state];

  return (
    <span
      role="status"
      aria-live="polite"
      title={error ?? undefined}
      className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium text-ink-2 dark:bg-white/[0.07]"
    >
      <span className="relative inline-flex size-2" aria-hidden="true">
        {state === "live" ? (
          <span className="absolute inset-0 rounded-full bg-emerald-500 motion-safe:animate-[monitor-live-ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite]" />
        ) : null}
        <span className={`relative inline-flex size-2 rounded-full ${dotClass}`} />
      </span>
      {label}
    </span>
  );
}

function optionLabel(dimension: MonitorFilterDimension, option: MonitorFilterOption, t: Translate) {
  if (dimension === "consumers") {
    const Icon = option.kind === "end_user" ? UserRound : KeyRound;
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon size={14} className={`shrink-0 text-ink-3 ${iconHueClass(Icon)}`} aria-hidden="true" />
        <span className="truncate">{option.label || t("monitor_center.unnamed_consumer")}</span>
      </span>
    );
  }
  if (dimension === "channels") {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        {option.provider ? <VendorIcon modelId={option.provider} size={14} /> : null}
        <span className="truncate">{option.label}</span>
      </span>
    );
  }
  return <span className="truncate">{option.label}</span>;
}

function FilterSelect({
  dimension,
  value,
  options,
  onChange,
  t,
}: {
  dimension: MonitorFilterDimension;
  value: string[];
  options: MonitorFilterOption[];
  onChange: (values: string[]) => void;
  t: Translate;
}) {
  const items = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    const known = new Set(options.map((option) => option.value));
    // 地址栏里选中、但当前时间窗没有流量的值也要留在列表里，否则无法取消它。
    const missing = value
      .filter((item) => !known.has(item))
      .map((item) => ({ value: item, label: item, requests: 0, provider: "", kind: "" }));
    return [...options, ...missing].map((option) => ({
      value: option.value,
      label: optionLabel(dimension, option, t),
      title: option.label || option.value,
      searchText: `${option.label} ${option.value}`,
      trailing: (
        <span className="text-2xs tabular-nums text-ink-3">
          {formatMonitorCompact(option.requests)}
        </span>
      ),
    }));
  }, [dimension, options, t, value]);

  return (
    <div className="w-full min-[480px]:w-auto sm:w-44">
      <SearchableCheckboxMultiSelect
        value={value}
        onChange={onChange}
        options={items}
        placeholder={t(`monitor_center.filter.${dimension}_all`)}
        searchPlaceholder={t(`monitor_center.filter.${dimension}_search`)}
        selectFilteredLabel={t("request_logs.select_filtered")}
        deselectFilteredLabel={t("request_logs.deselect_filtered")}
        selectedCountLabel={(count: number) => t("request_logs.selected_count", { count })}
        noResultsLabel={t("request_logs.no_filter_results")}
        aria-label={t(`monitor_center.filter.${dimension}`)}
        clearLabel={t("monitor_center.filter.clear")}
        onClear={() => onChange([])}
        showClearButton
        size="sm"
        emptyValueMeansAllSelected
        // 监控页里空选择永远是「不限」；不声明的话，没有流量（选项为空）时触发器会显示「0 项」。
        emptyValueRepresentsAllSelected={value.length === 0}
        showFilteredToggleWithoutQuery={false}
        applyMode="manual"
        applyLabel={t("request_logs.apply_filters")}
        cancelLabel={t("common.cancel")}
        neutralAllSelection
        allSelectionLabel={t("request_logs.unrestricted")}
        selectionHint={t("monitor_center.filter.hint")}
      />
    </div>
  );
}

function ActiveFilterChips({
  query,
  overview,
  onRemove,
  onClear,
  t,
}: {
  query: MonitorViewQuery;
  overview: MonitorOverview | null;
  onRemove: (dimension: MonitorFilterDimension, value: string) => void;
  onClear: () => void;
  t: Translate;
}) {
  const labelFor = (dimension: MonitorFilterDimension, value: string) =>
    overview?.filters[dimension].find((option) => option.value === value)?.label || value;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-ink-3">{t("monitor_center.filter.active")}</span>
      {DIMENSIONS.flatMap((dimension) =>
        query[dimension].map((value) => (
          <span
            key={`${dimension}:${value}`}
            className="inline-flex max-w-72 items-center gap-1 rounded-full bg-selected py-0.5 pr-1 pl-2.5 text-xs text-ink"
          >
            <span className="shrink-0 text-ink-3">{t(`monitor_center.filter.${dimension}`)}</span>
            <span className="truncate font-medium">{labelFor(dimension, value)}</span>
            <button
              type="button"
              onClick={() => onRemove(dimension, value)}
              aria-label={t("monitor_center.filter.remove", { value: labelFor(dimension, value) })}
              className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        )),
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full px-2 py-0.5 text-xs font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
      >
        {t("monitor_center.filter.clear_all")}
      </button>
    </div>
  );
}
