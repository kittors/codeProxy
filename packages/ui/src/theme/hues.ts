/**
 * 图表的分类色：多条数据序列（多个租户、多个额度窗口……）需要彼此分得开的颜色时用。
 *
 * 只给数据用，不给界面装饰用。2026-10 之前这里还有一张「图标 → 色相」注册表，按图标名把
 * 侧边栏、页面标题、弹窗图标块、按钮里的图标染成 14 种颜色，一屏同时出现六七种强调色，
 * 外部评审的原话是「色太杂、强调色太多」。现在界面只有一个强调色（蓝，见 styles/index.css），
 * 状态色只表达状态；图表里需要区分多条序列时才从这里取色。
 */
export const HUES = [
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "amber",
  "orange",
  "rose",
  "pink",
  "fuchsia",
  "purple",
  "violet",
  "indigo",
] as const;

export type Hue = (typeof HUES)[number];

export const isHue = (value: unknown): value is Hue =>
  typeof value === "string" && (HUES as readonly string[]).includes(value);

/** 画布（echarts / SVG）用的色值：浅色取 500，深色取 400（深色底上亮一档才分得清）。 */
export const HUE_HEX: Record<Hue, { light: string; dark: string }> = {
  blue: { light: "#3b82f6", dark: "#60a5fa" },
  sky: { light: "#0ea5e9", dark: "#38bdf8" },
  cyan: { light: "#06b6d4", dark: "#22d3ee" },
  teal: { light: "#14b8a6", dark: "#2dd4bf" },
  emerald: { light: "#10b981", dark: "#34d399" },
  lime: { light: "#84cc16", dark: "#a3e635" },
  amber: { light: "#f59e0b", dark: "#fbbf24" },
  orange: { light: "#f97316", dark: "#fb923c" },
  rose: { light: "#f43f5e", dark: "#fb7185" },
  pink: { light: "#ec4899", dark: "#f472b6" },
  fuchsia: { light: "#d946ef", dark: "#e879f9" },
  purple: { light: "#a855f7", dark: "#c084fc" },
  violet: { light: "#8b5cf6", dark: "#a78bfa" },
  indigo: { light: "#6366f1", dark: "#818cf8" },
};

export const hueHex = (hue: Hue, isDark: boolean) => (isDark ? HUE_HEX[hue].dark : HUE_HEX[hue].light);
