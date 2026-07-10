import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";
import {
  formatFixedNumber,
  formatUsageMetricCost,
  formatUsageMetricNumber,
  formatUsageMetricTooltipCost,
  formatUsageMetricTooltipNumber,
  isUsageMetricCompact,
  type UsageMetricVariant,
} from "@code-proxy/domain";
import { parseUsageTimestampMs } from "@features/monitor-widgets/monitor-utils";
import {
  SearchableCheckboxMultiSelect,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import { PaginationBar } from "@code-proxy/ui";
import { ModelTag } from "@features/model-tags";

export type TimeRange = 1 | 7 | 14 | 30;
export type StatusFilterValue = "success" | "failed";
export type MultiSelectFilterState<T extends string = string> = T[] | null;

export function isStatusFilterValue(value: string): value is StatusFilterValue {
  return value === "success" || value === "failed";
}

export function toStatusFilterValues(values: string[]): StatusFilterValue[] {
  return values.filter(isStatusFilterValue);
}

export type RequestLogsRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  apiKey: string;
  apiKeyName: string;
  isSystemCall: boolean;
  channelName: string;
  maskedApiKey: string;
  model: string;
  upstreamModel: string;
  visionFallbackModel: string;
  failed: boolean;
  streaming: boolean;
  latencyText: string;
  firstTokenText: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  hasContent: boolean;
};

const parseLatencyTextToSeconds = (text: string): number | null => {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed === "--") return null;
  if (trimmed === "<1ms") return 0.0005;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(ms|s)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  return match[2] === "ms" ? value / 1000 : value;
};

const computeOutputTokensPerSecond = (row: RequestLogsRow): number | null => {
  if (!Number.isFinite(row.outputTokens) || row.outputTokens <= 0) return null;

  const totalSeconds = parseLatencyTextToSeconds(row.latencyText);
  if (totalSeconds === null || totalSeconds <= 0) return null;

  const firstSeconds = row.streaming
    ? (parseLatencyTextToSeconds(row.firstTokenText) ?? 0)
    : 0;
  const generationSeconds = Math.max(0, totalSeconds - firstSeconds);
  if (generationSeconds <= 0) return null;

  const tps = row.outputTokens / generationSeconds;
  return Number.isFinite(tps) && tps > 0 ? tps : null;
};

const formatTokensPerSecond = (value: number | null): string => {
  if (!Number.isFinite(value ?? Number.NaN) || !value || value <= 0)
    return "--";
  if (value >= 100) return `${Math.round(value)} t/s`;
  if (value >= 10) return `${value.toFixed(1)} t/s`;
  return `${value.toFixed(2)} t/s`;
};

const hasRequestLogMetricText = (value: string): boolean => {
  const trimmed = String(value || "").trim();
  return trimmed !== "" && trimmed !== "--";
};

const resolveLatencyToneClasses = (latencyText: string): string => {
  const seconds = parseLatencyTextToSeconds(latencyText);
  if (seconds === null) {
    return "border-slate-200 bg-slate-50 text-slate-500 dark:border-neutral-800 dark:bg-neutral-950/45 dark:text-white/55";
  }

  if (seconds < 10) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200";
  }
  if (seconds < 30) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200";
  }
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200";
};

function RequestLogMetricChip({
  ariaLabel,
  value,
  className,
}: {
  ariaLabel: string;
  value: string;
  className: string;
}) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] whitespace-nowrap",
        className,
      ].join(" ")}
      aria-label={ariaLabel}
    >
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function RequestLogModeChip({
  label,
  streaming,
}: {
  label: string;
  streaming: boolean;
}) {
  return (
    <span
      className={
        streaming
          ? "inline-flex shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-600 dark:border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-300"
          : "inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-neutral-900 dark:text-white/55"
      }
    >
      {label}
    </span>
  );
}

export function RequestLogUsageMetricValue({
  value,
  variant = "number",
  compact = false,
  className,
}: {
  value: number;
  variant?: UsageMetricVariant;
  /**
   * When true, renders the value in compact form (e.g. "23.8K", "$12.35K")
   * with a hover tooltip carrying the full precision value. Defaults to false
   * so the request-logs table always shows the complete numeric value.
   */
  compact?: boolean;
  className?: string;
}) {
  const useCompact = compact && isUsageMetricCompact(value, variant);
  const display =
    variant === "currency"
      ? useCompact
        ? formatUsageMetricCost(value)
        : formatUsageMetricTooltipCost(value)
      : useCompact
        ? formatUsageMetricNumber(value)
        : formatFixedNumber(value, { fractionDigits: 0 });
  const tooltip =
    variant === "currency"
      ? formatUsageMetricTooltipCost(value)
      : formatUsageMetricTooltipNumber(value);

  return (
    <HoverTooltip
      content={tooltip}
      disabled={!useCompact}
      placement="top"
      className={useCompact ? "cursor-help" : undefined}
    >
      <span
        className={["block min-w-0 truncate", className]
          .filter(Boolean)
          .join(" ")}
      >
        {display}
      </span>
    </HoverTooltip>
  );
}

export interface RequestLogsTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  resizable?: boolean;
  minWidthPx?: number;
  maxWidthPx?: number;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}

export const DEFAULT_REQUEST_LOG_PAGE_SIZE = 50;
export const REQUEST_LOG_PAGE_SIZE_OPTIONS = [20, 50, 100];
export const REQUEST_LOG_TIME_RANGES: readonly TimeRange[] = [
  1, 7, 14, 30,
] as const;
export const SYSTEM_REQUEST_LOG_FILTER_VALUE = "__system__";

export function normalizeFilterSelection<T extends string>(
  selected: MultiSelectFilterState<T>,
  allowedValues: T[],
): MultiSelectFilterState<T> {
  if (selected === null) return null;
  if (allowedValues.length === 0) return [];
  const allowed = new Set(allowedValues);
  const normalized = selected.filter(
    (item, index) => allowed.has(item) && selected.indexOf(item) === index,
  );
  if (normalized.length === allowedValues.length) return null;
  return normalized;
}

export function toFilterParam<T extends string>(
  selected: MultiSelectFilterState<T>,
  allowedValues: T[],
): { values?: T[]; matchesNone: boolean } {
  const normalized = normalizeFilterSelection(selected, allowedValues);
  if (normalized === null) return { values: undefined, matchesNone: false };
  if (normalized.length === 0) return { values: undefined, matchesNone: true };
  return { values: normalized, matchesNone: false };
}

export function hasActiveFilterSelection<T extends string>(
  selected: MultiSelectFilterState<T>,
  allowedValues: T[],
): boolean {
  const normalized = normalizeFilterSelection(selected, allowedValues);
  return normalized !== null;
}

export function RequestLogFacetFilters({
  modelOptions,
  channelOptions,
  statusOptions,
  selectedModels,
  selectedChannels,
  selectedStatuses,
  onModelsChange,
  onChannelsChange,
  onStatusesChange,
  onModelsClear,
  onChannelsClear,
  onStatusesClear,
}: {
  modelOptions: SearchableCheckboxMultiSelectOption[];
  channelOptions: SearchableCheckboxMultiSelectOption[];
  statusOptions: SearchableCheckboxMultiSelectOption[];
  selectedModels: MultiSelectFilterState<string>;
  selectedChannels: MultiSelectFilterState<string>;
  selectedStatuses: MultiSelectFilterState<StatusFilterValue>;
  onModelsChange: (value: string[]) => void;
  onChannelsChange: (value: string[]) => void;
  onStatusesChange: (value: StatusFilterValue[]) => void;
  onModelsClear: () => void;
  onChannelsClear: () => void;
  onStatusesClear: () => void;
}) {
  const { t } = useTranslation();
  const statusChangeAdapter = useMemo(
    () => (value: string[]) => onStatusesChange(toStatusFilterValues(value)),
    [onStatusesChange],
  );
  const statusClearAdapter = useCallback(() => {
    onStatusesClear();
  }, [onStatusesClear]);

  return (
    <>
      <div className="w-full min-[480px]:w-auto sm:w-[200px]">
        <SearchableCheckboxMultiSelect
          value={selectedModels ?? []}
          onChange={onModelsChange}
          options={modelOptions}
          placeholder={t("request_logs.all_models_placeholder")}
          searchPlaceholder={t("request_logs.search_models")}
          selectFilteredLabel={t("request_logs.select_filtered")}
          deselectFilteredLabel={t("request_logs.deselect_filtered")}
          selectedCountLabel={(count: number) =>
            t("request_logs.selected_count", { count })
          }
          noResultsLabel={t("request_logs.no_filter_results")}
          aria-label={t("request_logs.filter_model")}
          clearLabel={t("request_logs.clear_model_filter")}
          onClear={onModelsClear}
          showClearButton
          size="sm"
          emptyValueMeansAllSelected
          emptyValueRepresentsAllSelected={selectedModels === null}
          showFilteredToggleWithoutQuery={false}
          applyMode="manual"
          applyLabel={t("request_logs.apply_filters")}
          cancelLabel={t("common.cancel")}
          selectAllLabel={t("request_logs.select_all")}
          deselectAllLabel={t("request_logs.deselect_all")}
          emptySelectionLabel={t("request_logs.none_selected")}
        />
      </div>
      <div className="w-full min-[480px]:w-auto sm:w-[180px]">
        <SearchableCheckboxMultiSelect
          value={selectedChannels ?? []}
          onChange={onChannelsChange}
          options={channelOptions}
          placeholder={t("request_logs.all_channels_placeholder")}
          searchPlaceholder={t("request_logs.search_channels")}
          selectFilteredLabel={t("request_logs.select_filtered")}
          deselectFilteredLabel={t("request_logs.deselect_filtered")}
          selectedCountLabel={(count: number) =>
            t("request_logs.selected_count", { count })
          }
          noResultsLabel={t("request_logs.no_filter_results")}
          aria-label={t("request_logs.filter_channel")}
          clearLabel={t("request_logs.clear_channel_filter")}
          onClear={onChannelsClear}
          showClearButton
          size="sm"
          emptyValueMeansAllSelected
          emptyValueRepresentsAllSelected={selectedChannels === null}
          showFilteredToggleWithoutQuery={false}
          applyMode="manual"
          applyLabel={t("request_logs.apply_filters")}
          cancelLabel={t("common.cancel")}
          selectAllLabel={t("request_logs.select_all")}
          deselectAllLabel={t("request_logs.deselect_all")}
          emptySelectionLabel={t("request_logs.none_selected")}
        />
      </div>
      <div className="w-full min-[480px]:w-auto sm:w-[150px]">
        <SearchableCheckboxMultiSelect
          value={selectedStatuses ?? []}
          onChange={statusChangeAdapter}
          options={statusOptions}
          placeholder={t("request_logs.all_status")}
          searchPlaceholder=""
          selectFilteredLabel={t("request_logs.select_filtered")}
          deselectFilteredLabel={t("request_logs.deselect_filtered")}
          selectedCountLabel={(count: number) => `${count}`}
          noResultsLabel={t("request_logs.no_filter_results")}
          aria-label={t("request_logs.filter_status")}
          clearLabel={t("request_logs.clear_status_filter")}
          onClear={statusClearAdapter}
          showClearButton
          size="sm"
          emptyValueMeansAllSelected
          emptyValueRepresentsAllSelected={selectedStatuses === null}
          showFilteredToggleWithoutQuery={false}
          applyMode="manual"
          applyLabel={t("request_logs.apply_filters")}
          cancelLabel={t("common.cancel")}
          selectAllLabel={t("request_logs.select_all")}
          deselectAllLabel={t("request_logs.deselect_all")}
          emptySelectionLabel={t("request_logs.none_selected")}
        />
      </div>
    </>
  );
}

export type RequestLogKeyOption = {
  value: string;
  label: string;
  searchText?: string;
};

export const maskRequestLogApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10)
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

export const formatRequestLogTimestamp = (value: string): string => {
  const ms = parseUsageTimestampMs(value);
  if (!Number.isFinite(ms)) return value || "--";
  return new Date(ms).toLocaleString();
};

export const formatRequestLogLatencyMs = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1) return "<1ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  const fixed = seconds.toFixed(seconds < 10 ? 2 : 1);
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return `${trimmed}s`;
};

export const formatOptionalRequestLogLatencyMs = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return formatRequestLogLatencyMs(value);
};

export const toRequestLogsRow = (item: UsageLogItem): RequestLogsRow => {
  const isSystemCall = isSystemRequestLogKey(item.api_key, item.api_key_name);
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: parseUsageTimestampMs(item.timestamp),
    apiKey: item.api_key,
    apiKeyName: item.api_key_name || "",
    isSystemCall,
    channelName: item.channel_name || "",
    maskedApiKey: maskRequestLogApiKey(item.api_key),
    model: item.model,
    upstreamModel: item.upstream_model || "",
    visionFallbackModel: item.vision_fallback_model || "",
    failed: item.failed,
    streaming: item.streaming === true,
    latencyText: formatRequestLogLatencyMs(item.latency_ms),
    firstTokenText: formatOptionalRequestLogLatencyMs(item.first_token_ms),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    cost: item.cost ?? 0,
    hasContent: item.has_content ?? false,
  };
};

export const isSystemRequestLogKey = (
  apiKey: string,
  apiKeyName?: string,
): boolean => {
  if (String(apiKeyName || "").trim()) return false;
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) return true;
  return (
    /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\//i.test(trimmed) ||
    trimmed.startsWith("/")
  );
};

export const buildRequestLogKeyOptions = (
  apiKeys: string[],
  apiKeyNames: Record<string, string>,
  labels: {
    allKeys: string;
    systemCall: string;
  },
): RequestLogKeyOption[] => {
  const options: RequestLogKeyOption[] = [{ value: "", label: labels.allKeys }];
  let systemIncluded = false;

  for (const key of apiKeys) {
    const name = apiKeyNames[key];
    if (isSystemRequestLogKey(key, name)) {
      if (systemIncluded) continue;
      options.push({
        value: SYSTEM_REQUEST_LOG_FILTER_VALUE,
        label: labels.systemCall,
        searchText: labels.systemCall,
      });
      systemIncluded = true;
      continue;
    }
    options.push({
      value: key,
      label: name || maskRequestLogApiKey(key),
      searchText: `${name || ""} ${key}`,
    });
  }

  return options;
};

export function RequestLogsTimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={String(value)}
      onValueChange={(next) => onChange(Number(next) as TimeRange)}
    >
      <TabsList>
        {REQUEST_LOG_TIME_RANGES.map((range) => {
          const label =
            range === 1
              ? t("request_logs.today")
              : t("request_logs.n_days", { count: range });
          return (
            <TabsTrigger key={range} value={String(range)}>
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

const CENTERED_REQUEST_LOG_HEADER_CLASS =
  "text-center [&_[data-vt-column-header-content]>span]:justify-center";

export function buildRequestLogsColumns(
  t: (key: string) => string,
  onContentClick?: (logId: number, tab: "input" | "output") => void,
  onErrorClick?: (logId: number, model: string) => void,
): RequestLogsTableColumn<RequestLogsRow>[] {
  return [
    {
      key: "id",
      label: t("request_logs.col_id"),
      width: "w-20",
      headerClassName: "text-left",
      cellClassName:
        "text-left font-mono text-xs tabular-nums text-slate-500 dark:text-white/50",
      render: (row) => (
        <OverflowTooltip content={`#${row.id}`} className="block min-w-0">
          <span className="block min-w-0 truncate">#{row.id}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "timestamp",
      label: t("request_logs.col_time"),
      width: "w-52",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip
          content={formatRequestLogTimestamp(row.timestamp)}
          className="block min-w-0"
        >
          <span className="block min-w-0 truncate">
            {formatRequestLogTimestamp(row.timestamp)}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "channelName",
      label: t("request_logs.col_channel"),
      width: "w-32",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) => (
        <OverflowTooltip
          content={row.channelName || "--"}
          className="block min-w-0"
        >
          <span
            className={`block min-w-0 truncate text-xs font-medium ${row.channelName ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.channelName || "--"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "status",
      label: t("request_logs.col_status"),
      width: "w-28",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) =>
        row.failed ? (
          <button
            type="button"
            onClick={() => onErrorClick?.(Number(row.id), row.model)}
            className="inline-flex min-w-[52px] cursor-pointer justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 hover:shadow-sm dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
            title={t("request_logs.view_error")}
          >
            {t("request_logs.status_failed")}
          </button>
        ) : (
          <span className="inline-flex min-w-[52px] justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            {t("request_logs.status_success")}
          </span>
        ),
    },
    {
      key: "latency",
      label: t("request_logs.col_response_metrics"),
      width: "w-64",
      minWidthPx: 240,
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => {
        const tps = computeOutputTokensPerSecond(row);
        const tpsText = formatTokensPerSecond(tps);
        const hasLatency = hasRequestLogMetricText(row.latencyText);
        const hasFirstToken = hasRequestLogMetricText(row.firstTokenText);
        const hasTps = hasRequestLogMetricText(tpsText);
        const tooltipLines = [
          hasLatency
            ? `${t("request_logs.col_duration")}: ${row.latencyText}`
            : null,
          hasFirstToken
            ? `${t("request_logs.col_first_token")}: ${row.firstTokenText}`
            : null,
          hasTps ? `${t("request_logs.tokens_per_second")}: ${tpsText}` : null,
        ].filter((line): line is string => Boolean(line));

        return (
          <HoverTooltip
            content={tooltipLines.join("\n")}
            disabled={tooltipLines.length === 0}
            placement="bottom"
            className="!flex min-w-0 max-w-full justify-center"
          >
            <div className="flex min-w-0 max-w-full flex-nowrap items-center justify-center gap-1.5">
              {hasLatency ? (
                <RequestLogMetricChip
                  ariaLabel={`${t("request_logs.col_duration")}: ${row.latencyText}`}
                  value={row.latencyText}
                  className={resolveLatencyToneClasses(row.latencyText)}
                />
              ) : null}
              {hasFirstToken ? (
                <RequestLogMetricChip
                  ariaLabel={`${t("request_logs.col_first_token")}: ${row.firstTokenText}`}
                  value={row.firstTokenText}
                  className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200"
                />
              ) : null}
              <RequestLogModeChip
                streaming={row.streaming}
                label={
                  row.streaming
                    ? t("request_logs.mode_streaming")
                    : t("request_logs.mode_non_streaming")
                }
              />
            </div>
          </HoverTooltip>
        );
      },
    },
    {
      key: "inputTokens",
      label: t("request_logs.col_input"),
      width: "w-32",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200 pl-6",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "input")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-sky-50 dark:hover:bg-sky-950/30"
            title={t("request_logs.view_input")}
          >
            <RequestLogUsageMetricValue
              value={row.inputTokens}
              className="text-sky-600 dark:text-sky-400 underline decoration-sky-300/50 dark:decoration-sky-500/40 underline-offset-2"
            />
          </button>
        ) : (
          <RequestLogUsageMetricValue value={row.inputTokens} />
        ),
    },
    {
      key: "cachedTokens",
      label: t("request_logs.col_cache_read"),
      width: "w-24",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center font-mono text-xs tabular-nums",
      render: (row) => (
        <RequestLogUsageMetricValue
          value={row.cachedTokens}
          className={
            row.cachedTokens > 0
              ? "font-semibold text-amber-600 dark:text-amber-400"
              : "text-slate-400 dark:text-white/30"
          }
        />
      ),
    },
    {
      key: "outputTokens",
      label: t("request_logs.col_output"),
      width: "w-24",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "output")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            title={t("request_logs.view_output")}
          >
            <RequestLogUsageMetricValue
              value={row.outputTokens}
              className="text-emerald-600 dark:text-emerald-400 underline decoration-emerald-300/50 dark:decoration-emerald-500/40 underline-offset-2"
            />
          </button>
        ) : (
          <RequestLogUsageMetricValue value={row.outputTokens} />
        ),
    },
    {
      key: "totalTokens",
      label: t("request_logs.col_total_token"),
      width: "w-28",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center font-mono text-xs tabular-nums text-slate-900 dark:text-white",
      render: (row) => <RequestLogUsageMetricValue value={row.totalTokens} />,
    },
    {
      key: "cost",
      label: t("request_logs.col_cost"),
      width: "w-24",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400",
      render: (row) => (
        <RequestLogUsageMetricValue value={row.cost} variant="currency" />
      ),
    },
    {
      key: "apiKeyName",
      label: t("request_logs.col_key_name"),
      width: "w-28",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) => (
        <OverflowTooltip
          content={
            row.isSystemCall
              ? t("request_logs.system_call")
              : row.apiKeyName || "--"
          }
          className="block min-w-0"
        >
          <span
            className={`block min-w-0 truncate text-xs font-medium ${row.apiKeyName || row.isSystemCall ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.isSystemCall
              ? t("request_logs.system_call")
              : row.apiKeyName || "--"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "model",
      label: t("request_logs.col_model"),
      width: "w-44",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) =>
        row.model ? (
          <span className="inline-flex max-w-full items-center justify-center gap-1 align-middle">
            <OverflowTooltip content={row.model} className="min-w-0">
              <ModelTag id={row.model} size="sm" className="align-middle" />
            </OverflowTooltip>
            {row.upstreamModel && row.upstreamModel !== row.model ? (
              <HoverTooltip
                content={`${t("request_logs.real_model_id")}\n${row.upstreamModel}`}
                placement="top"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  aria-label={t("request_logs.real_model_id")}
                />
              </HoverTooltip>
            ) : null}
            {row.visionFallbackModel &&
            row.visionFallbackModel !== row.model ? (
              <HoverTooltip
                content={`${t("request_logs.vision_fallback_model_id")}\n${row.visionFallbackModel}`}
                placement="top"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500"
                  aria-label={t("request_logs.vision_fallback_model_id")}
                />
              </HoverTooltip>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-slate-400 dark:text-white/30">--</span>
        ),
    },
  ];
}

export function RequestLogsPaginationBar({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <PaginationBar
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={REQUEST_LOG_PAGE_SIZE_OPTIONS}
      className="border-t border-slate-100 px-3 py-3 sm:px-5 dark:border-neutral-800/60"
      labels={{
        firstPage: t("request_logs.first_page"),
        previousPage: t("request_logs.prev_page"),
        nextPage: t("request_logs.next_page"),
        lastPage: t("request_logs.last_page"),
        rowsPerPage: t("request_logs.rows_per_page"),
        pageInfo: ({ start, end, total }) =>
          t("request_logs.page_info", { start, end, total }),
      }}
    />
  );
}
