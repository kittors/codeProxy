import type { MonitorBreakdownRow, MonitorOverview } from "@code-proxy/api-client";

/**
 * 模型性能榜里「首字时间」「生成速度」两列显示什么。
 *
 * 首选按单个请求算的分位数（P50 / P90）：它来自请求明细，均值容易被少数卡顿的长回复拖偏
 * （线上同一个模型，单请求中位数 146 tok/s，总输出 ÷ 总出字耗时只有 94）。明细只保留几天，
 * 窗口里这个模型的明细都过期了，就退回汇总表给的均值，副行标明「均值」。两样都没有时显示「—」，
 * 绝不显示 0：0 tok/s 读起来像「模型卡死了」，而真实情况是「没有可测的请求」。
 */
export type ModelMetricView =
  | { kind: "quantiles"; p50: number; p90: number; samples: number }
  | { kind: "mean"; value: number }
  | { kind: "none"; reason: "no_sample" | "unsupported" };

/**
 * 生成速度：输出 token ÷ 出字耗时（不含首字时间）。旧后端没有这个口径（generation_samples 为
 * null），它的 output_tokens_per_second 把首字等待算进了分母、还把推理 token 加进了分子，
 * 这里刻意不读，显示「—」并提示升级。
 */
export function modelSpeedView(row: MonitorBreakdownRow): ModelMetricView {
  const quantiles = row.performance?.generation_speed;
  if (quantiles && quantiles.samples > 0) {
    return {
      kind: "quantiles",
      p50: quantiles.p50,
      p90: quantiles.p90,
      samples: quantiles.samples,
    };
  }
  if (row.generation_tokens_per_second !== null) {
    return { kind: "mean", value: row.generation_tokens_per_second };
  }
  return { kind: "none", reason: row.generation_samples === null ? "unsupported" : "no_sample" };
}

/** 首字时间：成功的流式请求从收到请求到写出第一个数据块的时间。 */
export function modelFirstTokenView(row: MonitorBreakdownRow): ModelMetricView {
  const quantiles = row.performance?.first_token_ms;
  if (quantiles && quantiles.samples > 0) {
    return {
      kind: "quantiles",
      p50: quantiles.p50,
      p90: quantiles.p90,
      samples: quantiles.samples,
    };
  }
  if (row.first_token_avg_ms > 0) return { kind: "mean", value: row.first_token_avg_ms };
  return { kind: "none", reason: "no_sample" };
}

/**
 * 分位数背后最早一条明细比时间窗起点晚一小时以上，说明更早的明细已过保留期，卡片标题要说明
 * 分位数从哪儿开始算。与延迟卡片的判断一致。
 */
export function modelPerformanceCoverage(overview: MonitorOverview): string | null {
  const coverage = overview.models.performance_coverage_start;
  const rangeStart = Date.parse(overview.range.start);
  if (!coverage || !Number.isFinite(rangeStart)) return null;
  return Date.parse(coverage) - rangeStart > 3_600_000 ? coverage : null;
}
