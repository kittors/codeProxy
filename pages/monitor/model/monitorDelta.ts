/**
 * 环比：当前时间窗与等长的上一个时间窗相比。
 *
 * 颜色取决于指标的「好坏方向」而不是涨跌本身：请求、Token 涨了只是业务量变化（中性），
 * 成功率掉了是坏事，耗时涨了是坏事，费用涨了值得留意但不算故障（中性）。
 */

export type DeltaPolarity = "higher-is-better" | "lower-is-better" | "neutral";
export type DeltaTone = "good" | "bad" | "neutral";
export type DeltaDirection = "up" | "down" | "flat";

export interface MonitorDelta {
  /** 相对变化，0.12 表示 +12%；百分比类指标为 null，改看 points。 */
  ratio: number | null;
  /** 百分点变化，只给成功率、缓存命中率这类百分比指标。 */
  points: number | null;
  direction: DeltaDirection;
  tone: DeltaTone;
  /** 上一个时间窗没有数据，无从比较。 */
  noBaseline: boolean;
}

/** 变化小于 0.5%（或 0.05 个百分点）视为持平，避免抖动刷出一排红绿箭头。 */
const FLAT_RATIO = 0.005;
const FLAT_POINTS = 0.05;

function toneFor(direction: DeltaDirection, polarity: DeltaPolarity): DeltaTone {
  if (direction === "flat" || polarity === "neutral") return "neutral";
  const improved = polarity === "higher-is-better" ? direction === "up" : direction === "down";
  return improved ? "good" : "bad";
}

const NO_BASELINE: MonitorDelta = {
  ratio: null,
  points: null,
  direction: "flat",
  tone: "neutral",
  noBaseline: true,
};

export function computeRelativeDelta(
  current: number,
  previous: number,
  polarity: DeltaPolarity,
): MonitorDelta {
  if (!(previous > 0) || !Number.isFinite(current)) return NO_BASELINE;
  const ratio = current / previous - 1;
  const direction: DeltaDirection =
    Math.abs(ratio) < FLAT_RATIO ? "flat" : ratio > 0 ? "up" : "down";
  return { ratio, points: null, direction, tone: toneFor(direction, polarity), noBaseline: false };
}

/**
 * 百分比指标按百分点比：99.8% → 99.5% 是「-0.3 个百分点」，写成 -0.3% 会被读成相对变化。
 * hasBaseline 由调用方根据上一个时间窗有没有请求给出——成功率为 0 也可能是「全部失败」。
 */
export function computePointDelta(
  current: number,
  previous: number,
  hasBaseline: boolean,
  polarity: DeltaPolarity,
): MonitorDelta {
  if (!hasBaseline) return NO_BASELINE;
  const points = current - previous;
  const direction: DeltaDirection =
    Math.abs(points) < FLAT_POINTS ? "flat" : points > 0 ? "up" : "down";
  return { ratio: null, points, direction, tone: toneFor(direction, polarity), noBaseline: false };
}

export function formatDelta(delta: MonitorDelta): string {
  if (delta.noBaseline) return "";
  if (delta.points !== null) {
    const sign = delta.points > 0 ? "+" : delta.points < 0 ? "−" : "±";
    return `${sign}${Math.abs(delta.points).toFixed(2)}pt`;
  }
  const ratio = delta.ratio ?? 0;
  // 十倍以上的增长写成倍数：「×53」比「+5187%」好读，也提示上一周期的量可能很小。
  if (ratio >= 9) return `×${Math.round(ratio + 1)}`;
  const pct = Math.abs(ratio) * 100;
  const sign = ratio > 0 ? "+" : ratio < 0 ? "−" : "±";
  return `${sign}${pct >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}
