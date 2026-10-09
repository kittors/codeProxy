import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";
import {
  maskSensitiveIdentity,
} from "@code-proxy/domain";
import { parseUsageTimestampMs } from "@features/monitor-widgets/monitor-utils";
import { SearchableCheckboxMultiSelect, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import { PaginationBar } from "@code-proxy/ui";
import { RequestLogModelCell } from "./RequestLogModelCell";
import {
  formatRequestLogTimestamp,
  isSystemRequestLogKey,
  maskRequestLogApiKey,
  type RequestLogsRow,
} from "./requestLogsRow";
import {
  ChannelIdentityLabel,
  normalizeChannelAuthType,
  type ChannelIdentityLabelProps,
} from "./ChannelIdentityLabel";
import {
  computeOutputTokensPerSecond,
  formatTokensPerSecond,
  hasRequestLogMetricText,
  resolveLatencyToneClasses,
} from "./requestLogMetrics";

export { ChannelIdentityLabel, normalizeChannelAuthType };
export type { ChannelIdentityLabelProps };

export {
  computeOutputTokensPerSecond,
  formatTokensPerSecond,
  hasRequestLogMetricText,
  resolveLatencyToneClasses,
};

export type TimeRange = 1 | 7 | 14 | 30;
export type StatusFilterValue = "success" | "failed";
export type MultiSelectFilterState<T extends string = string> = T[] | null;

export function isStatusFilterValue(value: string): value is StatusFilterValue {
  return value === "success" || value === "failed";
}

export function toStatusFilterValues(values: string[]): StatusFilterValue[] {
  return values.filter(isStatusFilterValue);
}


import {
  RequestLogMetricChip,
  RequestLogModeChip,
  RequestLogUsageMetricValue,
} from "./RequestLogMetricChips";

export { RequestLogUsageMetricValue };

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
export const REQUEST_LOG_TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;
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
): { values?: T[]; matchesNone: boolean } {
  if (selected === null) return { values: undefined, matchesNone: false };
  if (selected.length === 0) return { values: undefined, matchesNone: true };
  return { values: selected, matchesNone: false };
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
  hideChannel = false,
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
  hideChannel?: boolean;
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
          selectedCountLabel={(count: number) => t("request_logs.selected_count", { count })}
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
      {!hideChannel ? (
        <div className="w-full min-[480px]:w-auto sm:w-[180px]">
          <SearchableCheckboxMultiSelect
            value={selectedChannels ?? []}
            onChange={onChannelsChange}
            options={channelOptions}
            placeholder={t("request_logs.all_channels_placeholder")}
            searchPlaceholder={t("request_logs.search_channels")}
            selectFilteredLabel={t("request_logs.select_filtered")}
            deselectFilteredLabel={t("request_logs.deselect_filtered")}
            selectedCountLabel={(count: number) => t("request_logs.selected_count", { count })}
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
      ) : null}
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
  count: number;
};

export function RequestLogFilterCount({ count }: { count: number }) {
  const { t, i18n } = useTranslation();
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const formattedCount = new Intl.NumberFormat(i18n.resolvedLanguage || undefined).format(
    safeCount,
  );
  const accessibleLabel = t("request_logs.calls_count", { count: safeCount, formattedCount });

  return (
    <span
      className="inline-flex min-w-[4.5rem] justify-end whitespace-nowrap text-xs font-semibold tabular-nums text-slate-500 dark:text-white/50"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {formattedCount}
    </span>
  );
}

export function sortRequestLogKeyOptionsByCount(
  options: RequestLogKeyOption[],
  locale?: string,
): RequestLogKeyOption[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const allOption = options.find((option) => option.value === "");
  const sorted = options
    .filter((option) => option.value !== "")
    .sort(
      (left, right) =>
        right.count - left.count ||
        collator.compare(left.label, right.label) ||
        left.value.localeCompare(right.value),
    );
  return allOption ? [allOption, ...sorted] : sorted;
}

export const buildRequestLogKeyOptions = (
  apiKeys: string[],
  apiKeyNames: Record<string, string>,
  labels: {
    allKeys: string;
    systemCall: string;
  },
  apiKeyCounts: Record<string, number> = {},
): RequestLogKeyOption[] => {
  const countFor = (key: string) => {
    const count = apiKeyCounts[key];
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  };
  const options: RequestLogKeyOption[] = [
    {
      value: "",
      label: labels.allKeys,
      count: apiKeys.reduce((total, key) => total + countFor(key), 0),
    },
  ];
  let systemOption: RequestLogKeyOption | null = null;

  for (const key of apiKeys) {
    const name = apiKeyNames[key];
    const count = countFor(key);
    if (isSystemRequestLogKey(key, name)) {
      if (systemOption) {
        systemOption.count += count;
        continue;
      }
      systemOption = {
        value: SYSTEM_REQUEST_LOG_FILTER_VALUE,
        label: labels.systemCall,
        searchText: labels.systemCall,
        count,
      };
      options.push(systemOption);
      continue;
    }
    options.push({
      value: key,
      label: name || maskRequestLogApiKey(key),
      searchText: `${name || ""} ${key}`,
      count,
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
    <Tabs value={String(value)} onValueChange={(next) => onChange(Number(next) as TimeRange)}>
      <TabsList>
        {REQUEST_LOG_TIME_RANGES.map((range) => {
          const label =
            range === 1 ? t("request_logs.today") : t("request_logs.n_days", { count: range });
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
// DataTable maps header text-center to flex justify-center on the label row.
const CENTERED_REQUEST_LOG_HEADER_CLASS = "text-center";

export function buildRequestLogsColumns(
  t: (key: string) => string,
  onContentClick?: (logId: number, tab: "input" | "output", model: string) => void,
  onErrorClick?: (logId: number, model: string) => void,
  options: {
    identityColumn?: "user" | "key" | "none";
    hideChannel?: boolean;
    masked?: boolean;
  } = {},
): RequestLogsTableColumn<RequestLogsRow>[] {
  const apiLabel = t("request_logs.auth_type_api");
  const oauthLabel = t("request_logs.auth_type_oauth");
  const identityColumn = options.identityColumn ?? "user";
  const hideChannel = options.hideChannel === true;
  const masked = options.masked === true;
  const columns: RequestLogsTableColumn<RequestLogsRow>[] = [
    {
      key: "id",
      label: t("request_logs.col_id"),
      width: "w-20",
      headerClassName: "text-left",
      cellClassName: "text-left font-mono text-xs tabular-nums text-slate-500 dark:text-white/50",
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
          <span className="block min-w-0 truncate">{formatRequestLogTimestamp(row.timestamp)}</span>
        </OverflowTooltip>
      ),
    },
  ];
  if (!hideChannel) {
    columns.push({
      key: "channelName",
      label: t("request_logs.col_channel"),
      // Wider default so icon + name + auth badge can share the cell; DataTable
      // still lets users resize. Name truncates first; icon/badge stay visible.
      width: "w-44",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) => {
        const authLabel =
          row.channelAuthType === "api"
            ? apiLabel
            : row.channelAuthType === "oauth"
              ? oauthLabel
              : "";
        const channelName = masked ? maskSensitiveIdentity(row.channelName) : row.channelName;
        const tooltipParts = [channelName || "--", authLabel, row.channelProvider].filter(
          Boolean,
        );
        return (
          <OverflowTooltip
            content={tooltipParts.join(" · ")}
            className="mx-auto block min-w-0 max-w-full"
          >
            <ChannelIdentityLabel
              name={channelName}
              provider={row.channelProvider}
              authType={row.channelAuthType}
              apiLabel={apiLabel}
              oauthLabel={oauthLabel}
              iconSize={14}
              className="justify-center"
            />
          </OverflowTooltip>
        );
      },
    });
  }
  columns.push(
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
            onClick={() => onErrorClick?.(Number(row.id), row.displayModel || row.model)}
            className="inline-flex min-w-[52px] cursor-pointer justify-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 hover:shadow-sm dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
            title={t("request_logs.view_error")}
          >
            {t("request_logs.status_failed")}
          </button>
        ) : (
          // 成功是常态：一个绿色小圆点加中性文字；失败才是醒目的红色胶囊（可点开看错误）。
          <span className="inline-flex min-w-[52px] items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ink-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
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
      cellClassName: "text-center text-xs tabular-nums text-ink-2",
      render: (row) => {
        const tps = computeOutputTokensPerSecond(row);
        const tpsText = formatTokensPerSecond(tps);
        const hasLatency = hasRequestLogMetricText(row.latencyText);
        const hasFirstToken = hasRequestLogMetricText(row.firstTokenText);
        const hasTps = hasRequestLogMetricText(tpsText);
        const tooltipLines = [
          hasLatency ? `${t("request_logs.col_duration")}: ${row.latencyText}` : null,
          hasFirstToken ? `${t("request_logs.col_first_token")}: ${row.firstTokenText}` : null,
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
                  className="bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]"
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
        "text-center font-mono text-xs tabular-nums text-ink-2 pl-6",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "input", row.displayModel || row.model)}
            className="ml-auto inline-block cursor-pointer rounded-md px-1.5 py-0.5 transition-colors hover:bg-hover"
            title={t("request_logs.view_input")}
          >
            <RequestLogUsageMetricValue
              value={row.inputTokens}
              className="text-ink underline decoration-ink-4 underline-offset-2"
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
              ? "font-medium text-ink"
              : "text-ink-4"
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
            onClick={() => onContentClick(Number(row.id), "output", row.displayModel || row.model)}
            className="ml-auto inline-block cursor-pointer rounded-md px-1.5 py-0.5 transition-colors hover:bg-hover"
            title={t("request_logs.view_output")}
          >
            <RequestLogUsageMetricValue
              value={row.outputTokens}
              className="text-ink underline decoration-ink-4 underline-offset-2"
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
      cellClassName: "text-center font-mono text-xs tabular-nums text-slate-900 dark:text-white",
      render: (row) => <RequestLogUsageMetricValue value={row.totalTokens} />,
    },
    {
      key: "cost",
      label: t("request_logs.col_cost"),
      width: "w-24",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName:
        "text-center font-mono text-xs tabular-nums text-ink",
      render: (row) => <RequestLogUsageMetricValue value={row.cost} variant="currency" />,
    },
    {
      key: "apiKeyName",
      label:
        identityColumn === "key" ? t("request_logs.col_key_name") : t("request_logs.col_user_name"),
      width: "w-40",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) => {
        const keyFallback = row.maskedApiKey || (row.apiKeyId ? row.apiKeyId.slice(0, 8) : "");
        const rawKeyName =
          row.apiKeyOwnName ||
          (!row.endUserDisplayName ? row.apiKeyName : "") ||
          keyFallback ||
          "--";
        const keyName =
          masked && rawKeyName !== "--" ? maskSensitiveIdentity(rawKeyName) : rawKeyName;
        if (identityColumn === "key") {
          if (row.isSystemCall) {
            return (
              <HoverTooltip content={t("request_logs.system_call")} className="block min-w-0">
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {t("request_logs.system_call")}
                </span>
              </HoverTooltip>
            );
          }
          const displayName = keyName;
          return (
            <HoverTooltip content={displayName} className="block min-w-0">
              <span
                className={`block min-w-0 truncate text-xs font-medium ${displayName !== "--" ? "text-ink" : "text-ink-4"}`}
              >
                {displayName}
              </span>
            </HoverTooltip>
          );
        }
        if (row.isSystemCall) {
          return (
            <HoverTooltip content={t("request_logs.system_call")} className="block min-w-0">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-neutral-800 dark:text-neutral-300">
                {t("request_logs.system_call")}
              </span>
            </HoverTooltip>
          );
        }
        const rawUserName = row.endUserDisplayName || row.apiKeyName || "--";
        const userName =
          masked && rawUserName !== "--" ? maskSensitiveIdentity(rawUserName) : rawUserName;
        const showKeyName = Boolean(keyName && keyName !== userName);
        return (
          <HoverTooltip
            content={showKeyName ? `${userName} · ${keyName}` : userName}
            className="block min-w-0"
          >
            <span className="block min-w-0">
              <span
                className={`block truncate text-xs font-medium ${userName !== "--" ? "text-ink" : "text-ink-4"}`}
              >
                {userName}
              </span>
              {showKeyName ? (
                <span className="mt-0.5 block truncate text-2xs text-slate-400 dark:text-white/35">
                  {keyName}
                </span>
              ) : null}
            </span>
          </HoverTooltip>
        );
      },
    },
    {
      key: "model",
      label: t("request_logs.col_model"),
      width: "w-44",
      headerClassName: CENTERED_REQUEST_LOG_HEADER_CLASS,
      cellClassName: "text-center",
      render: (row) => <RequestLogModelCell row={row} />,
    },
  );
  return identityColumn === "none"
    ? columns.filter((column) => column.key !== "apiKeyName")
    : columns;
}

export function RequestLogsPaginationBar({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  flush = false,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** 直接放在内容区上（没有外层卡片）时不再留左右内边距，和上方表格左右对齐。 */
  flush?: boolean;
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
      // 分页条和表格之间靠留白分开，不画分隔线。
      className={flush ? "pt-3" : "px-3 py-3 sm:px-5"}
      labels={{
        firstPage: t("request_logs.first_page"),
        previousPage: t("request_logs.prev_page"),
        nextPage: t("request_logs.next_page"),
        lastPage: t("request_logs.last_page"),
        rowsPerPage: t("request_logs.rows_per_page"),
        pageInfo: ({ start, end, total }) => t("request_logs.page_info", { start, end, total }),
      }}
    />
  );
}
