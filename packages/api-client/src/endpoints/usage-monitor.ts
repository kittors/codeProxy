import { pickCacheRateFields } from "@code-proxy/domain/usage/cacheRate";
import { apiClient } from "../client/client";

/**
 * Monitor center endpoints (CliRelay `GET /usage/monitor/overview|realtime|in-flight`).
 *
 * Every payload goes through a normaliser: the panel auto-updates onto older
 * backends and must never crash on a missing or malformed field. Older
 * backends answer 404 for these paths; callers detect that and fall back to
 * `/usage/chart-data` (see pages/monitor). The in-flight list is newer still:
 * the overview's `capabilities` says whether the backend has it.
 */

export type MonitorRangeKey = "1h" | "6h" | "24h" | "today" | "7d" | "14d" | "30d";

export const MONITOR_RANGE_KEYS: readonly MonitorRangeKey[] = [
  "1h",
  "6h",
  "24h",
  "today",
  "7d",
  "14d",
  "30d",
];

export interface MonitorTotals {
  requests: number;
  success: number;
  failed: number;
  streaming: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost: number;
  /** Percent (0-100); 0 when there was no traffic. */
  success_rate: number;
  /**
   * cache_rate, and on newer backends cache_hit_rate with the read and write
   * totals; see readCacheRate.
   */
  cache_rate: number;
  cache_hit_rate?: number | null;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  latency_avg_ms: number;
  first_token_avg_ms: number;
  output_tokens_per_second: number;
}

export interface MonitorSeriesPoint extends MonitorTotals {
  /** Bucket start, RFC 3339 in the server's usage timezone. */
  start: string;
}

export interface MonitorRange {
  key: MonitorRangeKey;
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
  step_seconds: number;
  timezone: string;
}

export interface MonitorBreakdownRow extends MonitorTotals {
  key: string;
  label: string;
  provider: string;
  auth_type: string;
  /** Consumers: "end_user" | "api_key". */
  kind: string;
  /** Masked key hint such as `sk-…ab12`; never the secret. */
  key_hint: string;
  /** Requests per series bucket; only the top rows carry it. */
  trend: number[];
  trend_failed: number[];
}

export interface MonitorBreakdown {
  rows: MonitorBreakdownRow[];
  /** Distinct values in the window, of which `rows` are the heaviest. */
  total: number;
}

export interface MonitorLatencyStats {
  samples: number;
  avg_ms: number;
  max_ms: number;
  p50_ms: number;
  p90_ms: number;
  p95_ms: number;
  p99_ms: number;
  /** len(bounds_ms)+1 cells; the last one is "at or above the last bound". */
  histogram: number[];
}

export interface MonitorLatency {
  /** Oldest detail row the percentiles saw (details expire before rollups). */
  coverage_start: string;
  bounds_ms: number[];
  total: MonitorLatencyStats;
  first_token: MonitorLatencyStats;
}

export interface MonitorHeatmapCell {
  /** 0 = Sunday, like Date#getDay. */
  weekday: number;
  hour: number;
  requests: number;
  failed: number;
}

export interface MonitorHeatmap {
  start: string;
  days: number;
  cells: MonitorHeatmapCell[];
}

export type MonitorFlowLayer = "consumer" | "model" | "channel";

export interface MonitorFlowNode {
  /** `<layer>:<key>`; keys `__other__` / `__unknown__` carry an empty label. */
  id: string;
  label: string;
  layer: MonitorFlowLayer;
}

export interface MonitorFlowLink {
  source: string;
  target: string;
  requests: number;
  tokens: number;
}

export interface MonitorFlowGraph {
  nodes: MonitorFlowNode[];
  links: MonitorFlowLink[];
}

export interface MonitorFailure {
  id: number;
  timestamp: string;
  model: string;
  channel: string;
  consumer: string;
  latency_ms: number;
  streaming: boolean;
}

export interface MonitorFilterOption {
  value: string;
  label: string;
  requests: number;
  provider: string;
  kind: string;
}

export interface MonitorFilterOptions {
  models: MonitorFilterOption[];
  channels: MonitorFilterOption[];
  consumers: MonitorFilterOption[];
}

/** What the backend's monitor center offers beyond the overview itself. */
export interface MonitorCapabilities {
  /** `GET /usage/monitor/in-flight` answers. */
  inFlightRequests: boolean;
}

export interface MonitorOverview {
  generated_at: string;
  capabilities: MonitorCapabilities;
  range: MonitorRange;
  summary: { current: MonitorTotals; previous: MonitorTotals };
  series: MonitorSeriesPoint[];
  latency: MonitorLatency;
  models: MonitorBreakdown;
  channels: MonitorBreakdown;
  consumers: MonitorBreakdown;
  heatmap: MonitorHeatmap;
  flows: MonitorFlowGraph;
  recent_failures: MonitorFailure[];
  filters: MonitorFilterOptions;
}

export interface MonitorRealtime {
  generated_at: string;
  timezone: string;
  points: MonitorSeriesPoint[];
  current_rpm: number;
  current_tpm: number;
  peak_rpm: number;
  peak_tpm: number;
  avg_rpm: number;
  avg_tpm: number;
  last_5m: MonitorTotals;
}

/**
 * Where a request in flight stands (CliRelay routetrace `Stage*`): accepted and between the
 * scheduler's decisions, waiting for an account's free slot, waiting for an account to recover,
 * sent and waiting for the answer, stream open with nothing yet, stream delivering. The backend
 * adds stages and never renames them, so an unknown one is kept as sent.
 */
export const MONITOR_IN_FLIGHT_STAGES = [
  "preparing",
  "queued",
  "waiting",
  "upstream",
  "first_token",
  "streaming",
] as const;

export type MonitorInFlightStage = (typeof MONITOR_IN_FLIGHT_STAGES)[number];

export interface MonitorInFlightAccount {
  auth_id: string;
  label: string;
  provider: string;
  /** Channel group the account was picked from; empty outside groups. */
  group: string;
  /** Model sent upstream, after the account's aliases. */
  model: string;
}

export interface MonitorInFlightRequest {
  request_id: string;
  method: string;
  path: string;
  started_at: string;
  elapsed_ms: number;
  stage: string;
  stage_elapsed_ms: number;
  /** Model the client asked for. */
  model: string;
  stream: boolean;
  /** 1-based number of the attempt under way or last made; 0 before the first. */
  attempt: number;
  /** Account the request is on or last tried; null before its first attempt. */
  account: MonitorInFlightAccount | null;
  /** The key is named by id and name only, never by its secret. */
  api_key_id: string;
  api_key_name: string;
}

export interface MonitorInFlight {
  /** Oldest first; the backend lists at most 500. */
  requests: MonitorInFlightRequest[];
  /** How many there are in all, of which `requests` are the oldest. */
  total: number;
  generated_at: string;
}

export interface MonitorFilterSelection {
  /** `eu:<end user id>` or `key:<api key id>`. */
  consumers?: readonly string[];
  models?: readonly string[];
  channels?: readonly string[];
}

export interface MonitorQuery extends MonitorFilterSelection {
  range: MonitorRangeKey;
}

const TOTAL_FIELDS = [
  "requests",
  "success",
  "failed",
  "streaming",
  "input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "cached_tokens",
  "total_tokens",
  "cost",
  "success_rate",
  "latency_avg_ms",
  "first_token_avg_ms",
  "output_tokens_per_second",
] as const satisfies readonly (keyof MonitorTotals)[];

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: unknown): string => (typeof value === "string" ? value : "");

const toNumbers = (value: unknown): number[] => asArray(value).map(toNumber);

export const emptyMonitorTotals = (): MonitorTotals => normalizeMonitorTotals({});

export function normalizeMonitorTotals(raw: unknown): MonitorTotals {
  const record = asRecord(raw);
  const totals = {} as MonitorTotals;
  for (const field of TOTAL_FIELDS) totals[field] = toNumber(record[field]);
  // The cache fields keep the difference between "absent" (an older backend)
  // and null (no request reported its cache use), which toNumber would erase.
  return Object.assign(totals, pickCacheRateFields(record));
}

const normalizeSeries = (raw: unknown): MonitorSeriesPoint[] =>
  asArray(raw).map((point) => ({
    ...normalizeMonitorTotals(point),
    start: toText(asRecord(point).start),
  }));

const isRangeKey = (value: string): value is MonitorRangeKey =>
  (MONITOR_RANGE_KEYS as readonly string[]).includes(value);

const normalizeBreakdown = (raw: unknown): MonitorBreakdown => {
  const record = asRecord(raw);
  const rows = asArray(record.rows).map((item) => {
    const row = asRecord(item);
    return {
      ...normalizeMonitorTotals(row),
      key: toText(row.key),
      label: toText(row.label),
      provider: toText(row.provider),
      auth_type: toText(row.auth_type),
      kind: toText(row.kind),
      key_hint: toText(row.key_hint),
      trend: toNumbers(row.trend),
      trend_failed: toNumbers(row.trend_failed),
    };
  });
  return { rows, total: Math.max(toNumber(record.total), rows.length) };
};

const normalizeLatencyStats = (raw: unknown, bins: number): MonitorLatencyStats => {
  const record = asRecord(raw);
  const histogram = toNumbers(record.histogram);
  while (histogram.length < bins) histogram.push(0);
  return {
    samples: toNumber(record.samples),
    avg_ms: toNumber(record.avg_ms),
    max_ms: toNumber(record.max_ms),
    p50_ms: toNumber(record.p50_ms),
    p90_ms: toNumber(record.p90_ms),
    p95_ms: toNumber(record.p95_ms),
    p99_ms: toNumber(record.p99_ms),
    histogram,
  };
};

const normalizeFilterOptions = (raw: unknown): MonitorFilterOption[] =>
  asArray(raw)
    .map((item) => {
      const option = asRecord(item);
      return {
        value: toText(option.value),
        label: toText(option.label),
        requests: toNumber(option.requests),
        provider: toText(option.provider),
        kind: toText(option.kind),
      };
    })
    .filter((option) => option.value !== "");

export function normalizeMonitorOverview(raw: unknown): MonitorOverview {
  const record = asRecord(raw);
  const range = asRecord(record.range);
  const rangeKey = toText(range.key);
  const summary = asRecord(record.summary);
  const latency = asRecord(record.latency);
  const bounds = toNumbers(latency.bounds_ms);
  const heatmap = asRecord(record.heatmap);
  const flows = asRecord(record.flows);
  const filters = asRecord(record.filters);
  const capabilities = asRecord(record.capabilities);
  return {
    generated_at: toText(record.generated_at),
    capabilities: { inFlightRequests: capabilities["in-flight-requests"] === true },
    range: {
      key: isRangeKey(rangeKey) ? rangeKey : "24h",
      start: toText(range.start),
      end: toText(range.end),
      previous_start: toText(range.previous_start),
      previous_end: toText(range.previous_end),
      step_seconds: toNumber(range.step_seconds),
      timezone: toText(range.timezone),
    },
    summary: {
      current: normalizeMonitorTotals(summary.current),
      previous: normalizeMonitorTotals(summary.previous),
    },
    series: normalizeSeries(record.series),
    latency: {
      coverage_start: toText(latency.coverage_start),
      bounds_ms: bounds,
      total: normalizeLatencyStats(latency.total, bounds.length + 1),
      first_token: normalizeLatencyStats(latency.first_token, bounds.length + 1),
    },
    models: normalizeBreakdown(record.models),
    channels: normalizeBreakdown(record.channels),
    consumers: normalizeBreakdown(record.consumers),
    heatmap: {
      start: toText(heatmap.start),
      days: toNumber(heatmap.days),
      cells: asArray(heatmap.cells).map((item) => {
        const cell = asRecord(item);
        return {
          weekday: toNumber(cell.weekday),
          hour: toNumber(cell.hour),
          requests: toNumber(cell.requests),
          failed: toNumber(cell.failed),
        };
      }),
    },
    flows: {
      nodes: asArray(flows.nodes)
        .map((item) => {
          const node = asRecord(item);
          const layer = toText(node.layer);
          return {
            id: toText(node.id),
            label: toText(node.label),
            layer: (layer === "model" || layer === "channel"
              ? layer
              : "consumer") as MonitorFlowLayer,
          };
        })
        .filter((node) => node.id !== ""),
      links: asArray(flows.links)
        .map((item) => {
          const link = asRecord(item);
          return {
            source: toText(link.source),
            target: toText(link.target),
            requests: toNumber(link.requests),
            tokens: toNumber(link.tokens),
          };
        })
        .filter((link) => link.source !== "" && link.target !== "" && link.requests > 0),
    },
    recent_failures: asArray(record.recent_failures).map((item) => {
      const failure = asRecord(item);
      return {
        id: toNumber(failure.id),
        timestamp: toText(failure.timestamp),
        model: toText(failure.model),
        channel: toText(failure.channel),
        consumer: toText(failure.consumer),
        latency_ms: toNumber(failure.latency_ms),
        streaming: failure.streaming === true,
      };
    }),
    filters: {
      models: normalizeFilterOptions(filters.models),
      channels: normalizeFilterOptions(filters.channels),
      consumers: normalizeFilterOptions(filters.consumers),
    },
  };
}

export function normalizeMonitorRealtime(raw: unknown): MonitorRealtime {
  const record = asRecord(raw);
  return {
    generated_at: toText(record.generated_at),
    timezone: toText(record.timezone),
    points: normalizeSeries(record.points),
    current_rpm: toNumber(record.current_rpm),
    current_tpm: toNumber(record.current_tpm),
    peak_rpm: toNumber(record.peak_rpm),
    peak_tpm: toNumber(record.peak_tpm),
    avg_rpm: toNumber(record.avg_rpm),
    avg_tpm: toNumber(record.avg_tpm),
    last_5m: normalizeMonitorTotals(record.last_5m),
  };
}

export function normalizeMonitorInFlight(raw: unknown): MonitorInFlight {
  const record = asRecord(raw);
  const entries = asArray(record.requests).filter(
    (item) => item !== null && typeof item === "object" && !Array.isArray(item),
  );
  const requests = entries.map((item): MonitorInFlightRequest => {
    const entry = asRecord(item);
    const account = asRecord(entry.account);
    const authId = toText(account.auth_id);
    return {
      request_id: toText(entry.request_id),
      method: toText(entry.method),
      path: toText(entry.path),
      started_at: toText(entry.started_at),
      elapsed_ms: Math.max(0, toNumber(entry.elapsed_ms)),
      stage: toText(entry.stage),
      stage_elapsed_ms: Math.max(0, toNumber(entry.stage_elapsed_ms)),
      model: toText(entry.model),
      stream: entry.stream === true,
      attempt: Math.max(0, toNumber(entry.attempt)),
      account: authId
        ? {
            auth_id: authId,
            label: toText(account.label),
            provider: toText(account.provider),
            group: toText(account.group),
            model: toText(account.model),
          }
        : null,
      api_key_id: toText(entry.api_key_id),
      api_key_name: toText(entry.api_key_name),
    };
  });
  return {
    requests,
    total: Math.max(toNumber(record.total), requests.length),
    generated_at: toText(record.generated_at),
  };
}

/** Builds the query string; multi-value filters repeat the parameter. */
export function buildMonitorQueryString(
  query: MonitorFilterSelection & { range?: MonitorRangeKey },
) {
  const qs = new URLSearchParams();
  if (query.range) qs.set("range", query.range);
  for (const value of query.consumers ?? []) qs.append("consumer", value);
  for (const value of query.models ?? []) qs.append("model", value);
  for (const value of query.channels ?? []) qs.append("channel", value);
  return qs.toString();
}

export const usageMonitorApi = {
  async getOverview(
    query: MonitorQuery,
    options?: { signal?: AbortSignal },
  ): Promise<MonitorOverview> {
    const raw = await apiClient.get<unknown>(
      `/usage/monitor/overview?${buildMonitorQueryString(query)}`,
      { signal: options?.signal },
    );
    return normalizeMonitorOverview(raw);
  },

  async getRealtime(
    filters: MonitorFilterSelection,
    options?: { signal?: AbortSignal },
  ): Promise<MonitorRealtime> {
    const qs = buildMonitorQueryString(filters);
    const raw = await apiClient.get<unknown>(`/usage/monitor/realtime${qs ? `?${qs}` : ""}`, {
      signal: options?.signal,
    });
    return normalizeMonitorRealtime(raw);
  },

  /** Requests the backend is serving right now; only when the overview's capabilities say so. */
  async getInFlight(options?: { signal?: AbortSignal }): Promise<MonitorInFlight> {
    const raw = await apiClient.get<unknown>("/usage/monitor/in-flight", {
      signal: options?.signal,
    });
    return normalizeMonitorInFlight(raw);
  },
};
