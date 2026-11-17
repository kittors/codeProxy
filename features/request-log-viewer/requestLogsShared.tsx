import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { isSystemRequestLogKey, maskRequestLogApiKey } from "./requestLogsRow";
import {
  ChannelIdentityLabel,
  normalizeChannelAuthType,
  type ChannelIdentityLabelProps,
} from "./ChannelIdentityLabel";
import { computeOutputTokensPerSecond, formatTokensPerSecond } from "./requestLogMetrics";
import { RequestLogUsageMetricValue } from "./RequestLogMetricChips";

/*
 * 请求日志各处共用的小件：时间范围、Key 分面的选项、筛选项后面的次数。
 * 表格本身（列、单元格、筛选区、空状态）在 requestLogGridColumns / RequestLogGrid / RequestLogFilterBar。
 */

export { ChannelIdentityLabel, normalizeChannelAuthType };
export type { ChannelIdentityLabelProps };
export { computeOutputTokensPerSecond, formatTokensPerSecond };
export { RequestLogUsageMetricValue };

export type TimeRange = 1 | 7 | 14 | 30;

export const DEFAULT_REQUEST_LOG_PAGE_SIZE = 50;
export const REQUEST_LOG_TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;
export const SYSTEM_REQUEST_LOG_FILTER_VALUE = "__system__";

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
  /**
   * What to call a key that has no name. The default masks the value, which is
   * right when the values are client secrets (the older facet); a facet of key ids
   * passes something that shortens an id instead.
   */
  fallbackLabel: (value: string) => string = maskRequestLogApiKey,
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
      label: name || fallbackLabel(key),
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
      <TabsList aria-label={t("request_logs.time_range")}>
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
