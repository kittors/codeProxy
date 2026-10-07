/**
 * 图表配色的唯一出处。
 *
 * echarts 画在 canvas 上，读不到 Tailwind 类，也读不到 CSS 变量的深浅切换，所以这里
 * 把设计令牌按深浅色各抄一份成十六进制。中性色数值必须与 styles/index.css 的 `--cp-*`
 * 保持一致，彩色与 theme/hues 的 HUE_HEX 同一档（浅色 500、深色 400）。
 *
 * 配色原则：
 * - 网格、坐标轴、刻度文字是中性灰，越不重要越浅——它们是背景，不该抢眼；
 * - 数据本身一律有颜色：主序列靛蓝，其余序列与分类色是一组明快、彼此分得开的色相。
 *   以前主序列墨黑、次序列灰阶、柱子灰色，整张图像没加载完；
 * - 柱子与面积用同色系渐变（`chartGradient`），比平涂的色块轻；
 * - 指标各有一个身份色（metric），与监控中心、系统监控同一组：请求蓝、成功绿、Token 紫、
 *   费用琥珀、缓存青、耗时靛蓝。按厂商着色时用 assets 的品牌色（vendorBrand）；
 * - 绿、橙、红、蓝仍表达成功、警告、失败、信息。
 */

export interface ChartPalette {
  /** 主文字（tooltip 标题、强调数值）。 */
  ink: string;
  /** 次要文字（图例、坐标轴名称）。 */
  ink2: string;
  /** 刻度文字。 */
  ink3: string;
  /** 分割线。 */
  grid: string;
  /** 图表所在卡片的底色：圆点描边、扇区间隙这类要「挖空」的地方用它，与 `--cp-surface` 一致。 */
  surface: string;
  /** 坐标轴线。 */
  axis: string;
  /** 主序列 / 当前值。 */
  primary: string;
  /** 次序列，按重要程度递减（彼此色相分得开）。 */
  series: readonly [string, string, string, string];
  /** 没有指定身份色时柱子的颜色与悬停色（主色的浅一档）。 */
  bar: string;
  barHover: string;
  ok: string;
  warn: string;
  err: string;
  info: string;
  /** 仪表盘指标的身份色（见文件头）。 */
  metric: {
    requests: string;
    success: string;
    tokens: string;
    cost: string;
    /** 累计费用（叠在琥珀费用柱上的累计线）：同属费用色系但更深一档，和柱子拉开。 */
    costTotal: string;
    cache: string;
    rpm: string;
    tpm: string;
    latency: string;
  };
}

const LIGHT: ChartPalette = {
  ink: "#0d0d0d",
  ink2: "#5d5d5d",
  ink3: "#8f8f8f",
  grid: "#f1f1f1",
  surface: "#ffffff",
  axis: "#e2e2e2",
  primary: "#6366f1",
  series: ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899"],
  bar: "#a5b4fc",
  barHover: "#818cf8",
  ok: "#10a37f",
  warn: "#e08e1f",
  err: "#e5484d",
  info: "#2a6ee8",
  metric: {
    requests: "#3b82f6",
    success: "#10a37f",
    tokens: "#8b5cf6",
    cost: "#f59e0b",
    costTotal: "#ea580c",
    cache: "#14b8a6",
    rpm: "#3b82f6",
    tpm: "#8b5cf6",
    latency: "#6366f1",
  },
};

const DARK: ChartPalette = {
  ink: "#ececec",
  ink2: "#b4b4b4",
  ink3: "#8a8a8a",
  grid: "rgba(255, 255, 255, 0.06)",
  surface: "#2a2a2a",
  axis: "rgba(255, 255, 255, 0.12)",
  primary: "#818cf8",
  series: ["#818cf8", "#22d3ee", "#fbbf24", "#f472b6"],
  bar: "#4f46e5",
  barHover: "#6366f1",
  ok: "#3ecf9a",
  warn: "#f0ad4e",
  err: "#ff6b6b",
  info: "#77a6ff",
  metric: {
    requests: "#60a5fa",
    success: "#3ecf9a",
    tokens: "#a78bfa",
    cost: "#fbbf24",
    costTotal: "#f97316",
    cache: "#2dd4bf",
    rpm: "#60a5fa",
    tpm: "#a78bfa",
    latency: "#818cf8",
  },
};

export const chartPalette = (isDark: boolean): ChartPalette => (isDark ? DARK : LIGHT);

/**
 * 多序列（按租户拆开的吞吐线、按额度窗口拆开的占用线……）靠颜色区分时用的分类色板：
 * 一组明快、相邻两色色相差得开的颜色，红色放在后面（避免第一眼就像「出错」）。
 *
 * 注意：第 1 个靛蓝接近「请求蓝」、第 3 个就是「费用琥珀」。同一张图里既有身份色（metric）
 * 又有分类序列时，不要直接从头轮换这一组——先去掉与本图身份色相撞的颜色再取（账号详情的额度线、
 * 仪表盘的租户线都是这样做的）。
 */
export const CHART_CATEGORICAL = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#f97316",
  "#14b8a6",
  "#84cc16",
  "#ef4444",
] as const;

/** 十六进制颜色加透明度（echarts 的渐变停点要 rgba）。不认识的格式原样返回。 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

/**
 * 同色系纵向渐变（echarts 的 LinearGradient 对象字面量）：柱子用 `chartGradient(c, 1, 0.55)`，
 * 面积用 `chartGradient(c, 0.28, 0)`。`horizontal` 用于横向柱条。
 */
export function chartGradient(
  color: string,
  fromAlpha: number,
  toAlpha: number,
  { horizontal = false }: { horizontal?: boolean } = {},
) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: horizontal ? 1 : 0,
    y2: horizontal ? 0 : 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, fromAlpha) },
      { offset: 1, color: withAlpha(color, toAlpha) },
    ],
  };
}

/**
 * 统一的 tooltip：和界面里的提示气泡同一种深色实心块（深色模式反转成浅色），
 * 无描边、圆角 10px、柔和投影。调用方展开后可以再覆盖 formatter 等字段。
 */
export const chartTooltipStyle = (isDark: boolean) => {
  const palette = chartPalette(isDark);
  return {
    backgroundColor: isDark ? "#ececec" : "#0d0d0d",
    borderWidth: 0,
    padding: [8, 11],
    textStyle: { color: isDark ? "#0d0d0d" : "#ffffff", fontSize: 12 },
    extraCssText: `border-radius: 10px; box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.28);`,
    axisPointer: {
      lineStyle: { color: palette.axis },
      crossStyle: { color: palette.axis },
      shadowStyle: { color: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)" },
    },
  } as const;
};

/** 坐标轴与分割线的默认样式：只留最浅的横向网格，不画刻度线。 */
export const chartAxisStyle = (isDark: boolean) => {
  const palette = chartPalette(isDark);
  return {
    axisLine: { lineStyle: { color: palette.axis } },
    axisTick: { show: false },
    axisLabel: { color: palette.ink3, fontSize: 10 },
    splitLine: { lineStyle: { color: palette.grid } },
    nameTextStyle: { color: palette.ink3 },
  } as const;
};
