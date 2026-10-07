/**
 * 图表配色的唯一出处。
 *
 * echarts 画在 canvas 上，读不到 Tailwind 类，也读不到 CSS 变量的深浅切换，所以这里
 * 把设计令牌按深浅色各抄一份成十六进制。数值必须与 styles/index.css 的 `--cp-*`
 * 保持一致。
 *
 * 配色原则（与界面一致）：
 * - 网格、坐标轴、刻度文字都是中性灰，越不重要越浅；
 * - 「当前值 / 主序列」用强调色（浅色墨黑、深色浅灰白），其余序列用灰阶区分；
 * - 绿、橙、红、蓝表达成功、警告、失败、信息；
 * - 仪表盘上的指标各有一个身份色（metric），与系统监控同一组色系：蓝是请求与算力，绿是成功，
 *   紫是 Token 与内存，琥珀是费用与日志，靛蓝是耗时与首字时间（监控中心）。全黑灰的迷你趋势线
 *   读起来像没加载完，身份色让六格指标、吞吐图和监控卡片一眼对得上；失败仍然用 err。
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
  /** 坐标轴线。 */
  axis: string;
  /** 主序列 / 当前值。 */
  primary: string;
  /** 次序列，按重要程度递减。 */
  series: readonly [string, string, string, string];
  /** 普通柱子的底色与悬停色（原型里的灰柱）。 */
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
  axis: "#e2e2e2",
  primary: "#0d0d0d",
  series: ["#0d0d0d", "#767676", "#a3a3a3", "#d6d6d6"],
  bar: "#e6e6e6",
  barHover: "#cfcfcf",
  ok: "#10a37f",
  warn: "#e08e1f",
  err: "#e5484d",
  info: "#2a6ee8",
  metric: {
    requests: "#3b82f6",
    success: "#10a37f",
    tokens: "#8b5cf6",
    cost: "#f59e0b",
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
  axis: "rgba(255, 255, 255, 0.12)",
  primary: "#ececec",
  series: ["#ececec", "#a3a3a3", "#767676", "#4c4c4c"],
  bar: "#3a3a3a",
  barHover: "#4c4c4c",
  ok: "#3ecf9a",
  warn: "#f0ad4e",
  err: "#ff6b6b",
  info: "#77a6ff",
  metric: {
    requests: "#60a5fa",
    success: "#3ecf9a",
    tokens: "#a78bfa",
    cost: "#fbbf24",
    cache: "#2dd4bf",
    rpm: "#60a5fa",
    tpm: "#a78bfa",
    latency: "#818cf8",
  },
};

export const chartPalette = (isDark: boolean): ChartPalette => (isDark ? DARK : LIGHT);

/**
 * 多序列（比如按租户拆开的吞吐线）必须靠颜色区分时用的分类色板：降低饱和度的一组色相，
 * 刻意不含紫色系。主序列仍用 palette.primary，这里只给其余序列轮换。
 */
export const CHART_CATEGORICAL = [
  "#5b8def",
  "#3fb68b",
  "#e0a33a",
  "#e36c6c",
  "#2ba6b0",
  "#b08d64",
  "#d97ba6",
  "#7d8796",
  "#8fb34a",
  "#c97f3d",
] as const;

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
