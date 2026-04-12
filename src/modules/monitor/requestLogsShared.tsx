import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { UsageLogItem } from "@/lib/http/apis/usage";
import { parseUsageTimestampMs } from "@/modules/monitor/monitor-utils";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { OverflowTooltip } from "@/modules/ui/Tooltip";

export type TimeRange = 1 | 7 | 14 | 30;

export type RequestLogsRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  apiKey: string;
  apiKeyName: string;
  channelName: string;
  maskedApiKey: string;
  model: string;
  failed: boolean;
  latencyText: string;
  firstTokenText: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  hasContent: boolean;
};

export interface RequestLogsTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}

export const DEFAULT_REQUEST_LOG_PAGE_SIZE = 50;
export const REQUEST_LOG_PAGE_SIZE_OPTIONS = [20, 50, 100];
export const REQUEST_LOG_TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;

export const maskRequestLogApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
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
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: parseUsageTimestampMs(item.timestamp),
    apiKey: item.api_key,
    apiKeyName: item.api_key_name || "",
    channelName: item.channel_name || "",
    maskedApiKey: maskRequestLogApiKey(item.api_key),
    model: item.model,
    failed: item.failed,
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
      cellClassName: "font-mono text-xs tabular-nums text-slate-500 dark:text-white/50",
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
      cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={formatRequestLogTimestamp(row.timestamp)} className="block min-w-0">
          <span className="block min-w-0 truncate">{formatRequestLogTimestamp(row.timestamp)}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "apiKeyName",
      label: t("request_logs.col_key_name"),
      width: "w-32",
      render: (row) => (
        <OverflowTooltip content={row.apiKeyName || "--"} className="block min-w-0">
          <span
            className={`block min-w-0 truncate text-xs font-medium ${row.apiKeyName ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.apiKeyName || "--"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "model",
      label: t("request_logs.col_model"),
      width: "w-56",
      render: (row) => (
        <OverflowTooltip content={row.model} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.model}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "channelName",
      label: t("request_logs.col_channel"),
      width: "w-32",
      render: (row) => (
        <OverflowTooltip content={row.channelName || "--"} className="block min-w-0">
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
      width: "w-20",
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
      label: t("request_logs.col_duration"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={row.latencyText} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.latencyText}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "firstToken",
      label: t("request_logs.col_first_token"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) => (
        <OverflowTooltip content={row.firstTokenText} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.firstTokenText}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "inputTokens",
      label: t("request_logs.col_input"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "input")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-sky-50 dark:hover:bg-sky-950/30"
            title={t("request_logs.view_input")}
          >
            <span className="truncate text-sky-600 dark:text-sky-400 underline decoration-sky-300/50 dark:decoration-sky-500/40 underline-offset-2">
              {row.inputTokens.toLocaleString()}
            </span>
          </button>
        ) : (
          <OverflowTooltip content={row.inputTokens.toLocaleString()} className="block min-w-0">
            <span className="block min-w-0 truncate">{row.inputTokens.toLocaleString()}</span>
          </OverflowTooltip>
        ),
    },
    {
      key: "cachedTokens",
      label: t("request_logs.col_cache_read"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums",
      render: (row) => (
        <OverflowTooltip content={row.cachedTokens.toLocaleString()} className="block min-w-0">
          <span
            className={`block min-w-0 truncate ${row.cachedTokens > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-white/30"}`}
          >
            {row.cachedTokens > 0 ? row.cachedTokens.toLocaleString() : "0"}
          </span>
        </OverflowTooltip>
      ),
    },
    {
      key: "outputTokens",
      label: t("request_logs.col_output"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
      render: (row) =>
        row.hasContent && onContentClick ? (
          <button
            type="button"
            onClick={() => onContentClick(Number(row.id), "output")}
            className="inline-block ml-auto cursor-pointer rounded px-1.5 py-0.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            title={t("request_logs.view_output")}
          >
            <span className="truncate text-emerald-600 dark:text-emerald-400 underline decoration-emerald-300/50 dark:decoration-emerald-500/40 underline-offset-2">
              {row.outputTokens.toLocaleString()}
            </span>
          </button>
        ) : (
          <OverflowTooltip content={row.outputTokens.toLocaleString()} className="block min-w-0">
            <span className="block min-w-0 truncate">{row.outputTokens.toLocaleString()}</span>
          </OverflowTooltip>
        ),
    },
    {
      key: "totalTokens",
      label: t("request_logs.col_total_token"),
      width: "w-28",
      headerClassName: "text-right",
      cellClassName: "text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white",
      render: (row) => (
        <OverflowTooltip content={row.totalTokens.toLocaleString()} className="block min-w-0">
          <span className="block min-w-0 truncate">{row.totalTokens.toLocaleString()}</span>
        </OverflowTooltip>
      ),
    },
    {
      key: "cost",
      label: t("request_logs.col_cost"),
      width: "w-24",
      headerClassName: "text-right",
      cellClassName:
        "text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400",
      render: (row) => (
        <OverflowTooltip content={`$${row.cost.toFixed(6)}`} className="block min-w-0">
          <span className="block min-w-0 truncate">${row.cost.toFixed(4)}</span>
        </OverflowTooltip>
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

  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const rangeStart = Math.max(2, currentPage - 1);
      const rangeEnd = Math.min(totalPages - 1, currentPage + 1);
      for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  const btnBase =
    "inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";
  const btnNormal = `${btnBase} text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10`;
  const btnActive = `${btnBase} bg-slate-900 text-white dark:bg-white dark:text-neutral-950`;

  return (
    <div className="flex flex-shrink-0 flex-col gap-2 border-t border-slate-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 dark:border-neutral-800/60">
      <span className="text-xs text-slate-500 dark:text-white/50 tabular-nums whitespace-nowrap">
        {t("request_logs.page_info", { start, end, total: totalCount })}
      </span>

      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title={t("request_logs.first_page")}
          aria-label={t("request_logs.first_page")}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title={t("request_logs.prev_page")}
          aria-label={t("request_logs.prev_page")}
        >
          <ChevronLeft size={14} />
        </button>

        {pageNumbers.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-1 text-xs text-slate-400 dark:text-white/30">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === currentPage ? btnActive : btnNormal}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          className={btnNormal}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title={t("request_logs.next_page")}
          aria-label={t("request_logs.next_page")}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className={btnNormal}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title={t("request_logs.last_page")}
          aria-label={t("request_logs.last_page")}
        >
          <ChevronsRight size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 dark:text-white/50 whitespace-nowrap">
          {t("request_logs.rows_per_page")}
        </span>
        <select
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.currentTarget.value))}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/40 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/80 dark:hover:border-neutral-700 dark:focus:border-neutral-700 dark:focus:ring-white/10"
          aria-label={t("request_logs.rows_per_page")}
        >
          {REQUEST_LOG_PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={String(size)}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
