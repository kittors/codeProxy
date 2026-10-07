import {
  normalizeMonitorOverview,
  type ChartDataResponse,
  type MonitorOverview,
  type MonitorRangeKey,
  type MonitorTotals,
} from "@code-proxy/api-client";

/**
 * 旧后端兼容。面板会自动更新到还没升级的 CliRelay 上，那里没有 /usage/monitor/* 接口
 * （返回 404）。这时退回 /usage/chart-data，把它能给的部分（按天的请求 / 失败 / Token、
 * 模型分布、门户用户分布）装进同一个数据结构，页面其余模块显示「升级后端后可用」。
 *
 * chart-data 只按天聚合，所以只有「今天 / 7 / 14 / 30 天」可选；它的门户用户分布会带上
 * 明文 API Key，这里只取名称，名称为空时用掩码，明文不进入页面状态。
 */

export const LEGACY_RANGE_DAYS: Partial<Record<MonitorRangeKey, number>> = {
  today: 1,
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

export function isLegacyRangeSupported(range: MonitorRangeKey): boolean {
  return LEGACY_RANGE_DAYS[range] !== undefined;
}

export function legacyKeyHint(secret: string): string {
  const value = secret.trim();
  return value.length > 12 ? `${value.slice(0, 3)}…${value.slice(-4)}` : "";
}

function totalsFrom(fields: {
  requests: number;
  failed?: number;
  input?: number;
  output?: number;
  tokens?: number;
}): MonitorTotals {
  const requests = Math.max(0, fields.requests);
  const failed = Math.min(requests, Math.max(0, fields.failed ?? 0));
  const input = fields.input ?? 0;
  const output = fields.output ?? 0;
  return {
    requests,
    success: requests - failed,
    failed,
    streaming: 0,
    input_tokens: input,
    output_tokens: output,
    reasoning_tokens: 0,
    cached_tokens: 0,
    total_tokens: fields.tokens ?? input + output,
    cost: 0,
    success_rate: requests > 0 ? ((requests - failed) / requests) * 100 : 0,
    cache_rate: 0,
    latency_avg_ms: 0,
    first_token_avg_ms: 0,
    output_tokens_per_second: 0,
  };
}

export function legacyChartDataToOverview(
  chart: ChartDataResponse,
  range: MonitorRangeKey,
): MonitorOverview {
  const overview = normalizeMonitorOverview({});
  const series = chart.daily_series.map((point) => ({
    // 只有日期，没有时区信息：按「当地零点」写，标签函数只读其中的钟点数字。
    start: `${point.date}T00:00:00`,
    ...totalsFrom({
      requests: point.requests,
      failed: point.failed_requests,
      input: point.input_tokens,
      output: point.output_tokens,
    }),
  }));
  const current = series.reduce(
    (acc, point) =>
      totalsFrom({
        requests: acc.requests + point.requests,
        failed: acc.failed + point.failed,
        input: acc.input_tokens + point.input_tokens,
        output: acc.output_tokens + point.output_tokens,
      }),
    totalsFrom({ requests: 0 }),
  );
  const consumerRows = chart.apikey_distribution.map((item, index) => ({
    ...totalsFrom({ requests: item.requests, tokens: item.tokens }),
    key: "",
    label: item.name?.trim() || legacyKeyHint(item.api_key) || `#${index + 1}`,
    provider: "",
    auth_type: "",
    kind: "api_key",
    key_hint: "",
    trend: [],
    trend_failed: [],
  }));
  const modelRows = [...chart.model_distribution]
    .sort((a, b) => b.requests - a.requests)
    .map((item) => ({
      ...totalsFrom({ requests: item.requests, tokens: item.tokens }),
      key: "",
      label: item.model,
      provider: "",
      auth_type: "",
      kind: "",
      key_hint: "",
      trend: [],
      trend_failed: [],
    }));

  return {
    ...overview,
    range: {
      ...overview.range,
      key: range,
      start: series[0]?.start ?? "",
      end: "",
      step_seconds: 86_400,
    },
    summary: { current, previous: overview.summary.previous },
    series,
    models: { rows: modelRows, total: modelRows.length },
    consumers: { rows: consumerRows, total: consumerRows.length },
  };
}
