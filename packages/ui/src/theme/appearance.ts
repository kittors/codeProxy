import {
  COLOR_SCALE_STEPS,
  colorScale,
  ensureContrast,
  isHexColor,
  readableOn,
  shiftLightness,
} from "./colorMath";

/**
 * 外观设置（系统设置 → 外观）的数据模型。纯函数，不碰 DOM：
 * - 设置长什么样、怎么校验（localStorage 里读到坏数据、旧版本数据都回落到默认值）；
 * - 两套风格预设——多彩（默认，面板一贯的样子：彩色图标、语义色进度条、指标身份色）与简约
 *   （单一蓝色强调色、中性图标）——以及「改过任何一项就算自定义」的判定；
 * - 设置 → <html> 上的 data-* 开关与 --cp-pref-* 变量。AppearanceProvider 按它写 DOM，两个 HTML
 *   入口的首屏脚本读存下来的计算结果直接写，不重复实现这里的颜色计算。
 *
 * 开关在样式里怎么生效见 apps/admin-panel/src/styles/index.css 顶部的 colorful / icon-hue /
 * bar-semantic 变体说明。
 */

export const APPEARANCE_STORAGE_KEY = "code-proxy-admin-appearance";
const STORAGE_VERSION = 1;

export type PaletteStyle = "colorful" | "quiet";
export type IconStyle = "colorful" | "mono";
export type BarStyle = "semantic" | "accent";
export type ChartStyle = "colorful" | "accent";
export type StatusRole = "success" | "warning" | "danger";
export type StylePresetId = "colorful" | "quiet";

export interface AppearanceSettings {
  /** 页面里的语义色与装饰色：成功 / 信息标签、指标身份色、监控分类色、徽章光效。 */
  palette: PaletteStyle;
  /** 图标按名字着色，还是统一中性灰。 */
  icons: IconStyle;
  /** 额度 / 用量进度条：按余量绿 → 琥珀 → 红，还是统一强调色（低余量仍会变琥珀 / 红）。 */
  bars: BarStyle;
  /** 图表：每个指标一个身份色，还是主序列统一用强调色。 */
  charts: ChartStyle;
  /** 强调色：预设名（见 ACCENT_PRESETS）或 #rrggbb。 */
  accent: string;
  /** 状态色：null 表示用内置色板，否则是 #rrggbb（会替换整套色阶）。 */
  status: Record<StatusRole, string | null>;
  /** 进度条粗细，按 100% 缩放计的像素。 */
  barThickness: number;
  /** 整体缩放（间距、控件、文字一起）；null 表示按平台自动：Windows 100%，其它 90%。 */
  uiScale: number | null;
  /** 只缩放文字，不动间距与控件。 */
  textScale: number;
  /** 所有字重统一加减的量。 */
  weightShift: number;
}

export const BAR_THICKNESS_RANGE = { min: 3, max: 16, step: 1, default: 8 } as const;
export const UI_SCALE_RANGE = { min: 0.8, max: 1.25, step: 0.05 } as const;
export const TEXT_SCALE_RANGE = { min: 0.9, max: 1.2, step: 0.05, default: 1 } as const;
export const WEIGHT_SHIFTS = [-100, 0, 50, 100] as const;

export interface AccentPreset {
  id: string;
  /** 色块展示用的颜色（浅色 / 深色）。 */
  swatch: { light: string; dark: string };
}

/**
 * 强调色预设。墨色是多彩风格的默认：浅色下黑、深色下白，主按钮和选中态不抢图标、状态色和
 * 图表的颜色；蓝是简约风格的强调色。其余几种按同样的规则（对比度）现算派生色。
 */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "ink", swatch: { light: "#111113", dark: "#f2f2f4" } },
  { id: "blue", swatch: { light: "#2a6ee8", dark: "#2a6ee8" } },
  { id: "indigo", swatch: { light: "#5b5bd6", dark: "#5b5bd6" } },
  { id: "violet", swatch: { light: "#7c3aed", dark: "#7c3aed" } },
  { id: "teal", swatch: { light: "#0f8f83", dark: "#0f8f83" } },
  { id: "emerald", swatch: { light: "#10a37f", dark: "#10a37f" } },
  { id: "orange", swatch: { light: "#e8590c", dark: "#e8590c" } },
  { id: "rose", swatch: { light: "#e11d48", dark: "#e11d48" } },
];

const isAccentPresetId = (value: string) => ACCENT_PRESETS.some((preset) => preset.id === value);

/** 内置状态色板的 500 档（与 styles/index.css 的 emerald / amber / rose 重定义一致）。 */
export const DEFAULT_STATUS_HEX: Record<StatusRole, string> = {
  success: "#10a37f",
  warning: "#e08e1f",
  danger: "#e5484d",
};

/** 状态色替换哪些 Tailwind 色阶：同一语义的几个色名在 index.css 里本来就收敛成同一套。 */
const STATUS_SCALES: Record<StatusRole, readonly string[]> = {
  success: ["emerald", "green"],
  warning: ["amber"],
  danger: ["rose", "red"],
};

export const STYLE_PRESETS: Record<
  StylePresetId,
  Pick<AppearanceSettings, "palette" | "icons" | "bars" | "charts" | "accent">
> = {
  colorful: {
    palette: "colorful",
    icons: "colorful",
    bars: "semantic",
    charts: "colorful",
    accent: "ink",
  },
  quiet: { palette: "quiet", icons: "mono", bars: "accent", charts: "accent", accent: "blue" },
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  ...STYLE_PRESETS.colorful,
  status: { success: null, warning: null, danger: null },
  barThickness: BAR_THICKNESS_RANGE.default,
  uiScale: null,
  textScale: TEXT_SCALE_RANGE.default,
  weightShift: 0,
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

/** 吸附到步长上，避免 0.15000000000000002 这类浮点尾巴进到 CSS 和存储里。 */
const snap = (value: number, step: number) => Math.round(value / step) * step;
const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeAccent = (value: unknown): string => {
  if (typeof value !== "string") return DEFAULT_APPEARANCE.accent;
  if (isAccentPresetId(value)) return value;
  return isHexColor(value) ? value.toLowerCase() : DEFAULT_APPEARANCE.accent;
};

const normalizeStatusColor = (value: unknown): string | null =>
  isHexColor(value) ? value.toLowerCase() : null;

/** 任意输入 → 合法设置。缺的字段取默认值，越界的数值夹到范围内。 */
export function normalizeAppearance(raw: unknown): AppearanceSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const status =
    typeof source.status === "object" && source.status !== null
      ? (source.status as Record<string, unknown>)
      : {};
  const uiScale =
    source.uiScale === null || source.uiScale === undefined
      ? null
      : round2(
          snap(
            clampNumber(source.uiScale, UI_SCALE_RANGE.min, UI_SCALE_RANGE.max, 1),
            UI_SCALE_RANGE.step,
          ),
        );
  return {
    palette: pick(source.palette, ["colorful", "quiet"], DEFAULT_APPEARANCE.palette),
    icons: pick(source.icons, ["colorful", "mono"], DEFAULT_APPEARANCE.icons),
    bars: pick(source.bars, ["semantic", "accent"], DEFAULT_APPEARANCE.bars),
    charts: pick(source.charts, ["colorful", "accent"], DEFAULT_APPEARANCE.charts),
    accent: normalizeAccent(source.accent),
    status: {
      success: normalizeStatusColor(status.success),
      warning: normalizeStatusColor(status.warning),
      danger: normalizeStatusColor(status.danger),
    },
    barThickness: Math.round(
      clampNumber(
        source.barThickness,
        BAR_THICKNESS_RANGE.min,
        BAR_THICKNESS_RANGE.max,
        BAR_THICKNESS_RANGE.default,
      ),
    ),
    uiScale,
    textScale: round2(
      snap(
        clampNumber(
          source.textScale,
          TEXT_SCALE_RANGE.min,
          TEXT_SCALE_RANGE.max,
          TEXT_SCALE_RANGE.default,
        ),
        TEXT_SCALE_RANGE.step,
      ),
    ),
    weightShift: (WEIGHT_SHIFTS as readonly number[]).includes(source.weightShift as number)
      ? (source.weightShift as number)
      : 0,
  };
}

/**
 * 当前配色属于哪套预设。只比较配色相关的字段（风格开关、强调色、状态色）；进度条粗细、
 * 缩放、字号字重是独立的偏好，改了它们仍然算「多彩」或「简约」。
 */
export function matchStylePreset(settings: AppearanceSettings): StylePresetId | "custom" {
  if (settings.status.success || settings.status.warning || settings.status.danger) return "custom";
  for (const id of ["colorful", "quiet"] as const) {
    const preset = STYLE_PRESETS[id];
    if (
      settings.palette === preset.palette &&
      settings.icons === preset.icons &&
      settings.bars === preset.bars &&
      settings.charts === preset.charts &&
      settings.accent === preset.accent
    ) {
      return id;
    }
  }
  return "custom";
}

/** 换一套风格预设：配色相关字段整体替换（状态色回到内置），尺寸与字号偏好保留。 */
export function applyStylePreset(
  settings: AppearanceSettings,
  id: StylePresetId,
): AppearanceSettings {
  return {
    ...settings,
    ...STYLE_PRESETS[id],
    status: { success: null, warning: null, danger: null },
  };
}

export interface AccentTokens {
  accent: string;
  hover: string;
  fg: string;
  ink: string;
  soft: string;
  focus: string;
}

/** 浅色 / 深色下文字所在的典型底色：卡片（与 styles/index.css 的 --cp-surface 一致）。 */
const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#18181c";

/*
 * 蓝色是简约风格的强调色，派生值沿用之前手调过的那组（与外观上线前的简约界面逐值一致），
 * 不走下面的通用计算。
 */
const BLUE_TOKENS: { light: AccentTokens; dark: AccentTokens } = {
  light: {
    accent: "#2a6ee8",
    hover: "#1f5bd2",
    fg: "#ffffff",
    ink: "#1f5bd2",
    soft: "rgb(42 110 232 / 0.1)",
    focus: "#2a6ee8",
  },
  dark: {
    accent: "#2a6ee8",
    hover: "#3b7cf0",
    fg: "#ffffff",
    ink: "#6e9ef0",
    soft: "rgb(95 147 236 / 0.16)",
    focus: "#6e9ef0",
  },
};

const withAlpha = (hex: string, alpha: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255} / ${alpha})`;
};

const accentHexFor = (accent: string): string | null => {
  if (accent === "ink") return null;
  const preset = ACCENT_PRESETS.find((item) => item.id === accent);
  if (preset) return preset.swatch.light;
  return isHexColor(accent) ? accent : null;
};

/**
 * 强调色的整套派生值。墨色返回 null（用 index.css 里写死的默认值）。
 * - 填充色：浅色下原样；深色下太暗的颜色在近黑底上看不出是个按钮，提亮到与卡片至少 3:1；
 * - 前景色：白和墨色里对比度高的那个；
 * - 文字色（accent-ink）：写在卡片底上要 ≥ 4.5:1，不够就沿亮度调；
 * - 淡底：浅色 10%、深色 16% 的同色叠层。
 */
export function accentTokens(accent: string): { light: AccentTokens; dark: AccentTokens } | null {
  if (accent === "blue") return BLUE_TOKENS;
  const hex = accentHexFor(accent);
  if (!hex) return null;
  const lightInk = ensureContrast(hex, LIGHT_SURFACE, 4.5);
  const darkFill = ensureContrast(hex, DARK_SURFACE, 3);
  const darkInk = ensureContrast(hex, DARK_SURFACE, 4.5);
  return {
    light: {
      accent: hex,
      hover: shiftLightness(hex, -0.06),
      fg: readableOn(hex),
      ink: lightInk,
      soft: withAlpha(hex, 0.1),
      focus: hex,
    },
    dark: {
      accent: darkFill,
      hover: shiftLightness(darkFill, 0.05),
      fg: readableOn(darkFill),
      ink: darkInk,
      soft: withAlpha(darkInk, 0.16),
      focus: darkInk,
    },
  };
}

/** 图表、canvas 这类读不到 CSS 变量的地方要的强调色实色。 */
export function accentFill(accent: string, isDark: boolean): string {
  const tokens = accentTokens(accent);
  if (!tokens) return isDark ? "#f2f2f4" : "#111113";
  return isDark ? tokens.dark.accent : tokens.light.accent;
}

export interface AppearanceAttributes {
  palette: PaletteStyle;
  icons: IconStyle;
  bars: BarStyle;
}

export const appearanceAttributes = (settings: AppearanceSettings): AppearanceAttributes => ({
  palette: settings.palette,
  icons: settings.icons,
  bars: settings.bars,
});

const ACCENT_TOKEN_KEYS = ["accent", "hover", "fg", "ink", "soft", "focus"] as const;
const accentVarName = (key: (typeof ACCENT_TOKEN_KEYS)[number], dark: boolean) => {
  const base =
    key === "focus"
      ? "--cp-pref-focus"
      : key === "accent"
        ? "--cp-pref-accent"
        : `--cp-pref-accent-${key}`;
  return dark ? `${base}-dark` : base;
};

/** 外观设置可能写到 <html> 上的全部变量名：切换设置时先按这张表清掉不再需要的。 */
export const APPEARANCE_VAR_NAMES: readonly string[] = [
  ...ACCENT_TOKEN_KEYS.flatMap((key) => [accentVarName(key, false), accentVarName(key, true)]),
  ...Object.values(STATUS_SCALES).flatMap((names) =>
    names.flatMap((name) => COLOR_SCALE_STEPS.map((step) => `--color-${name}-${step}`)),
  ),
  "--cp-pref-bar",
  "--cp-pref-ui-scale",
  "--cp-pref-text-scale",
  "--cp-pref-weight-shift",
];

/** 设置 → 要写到 <html> 上的 CSS 变量。与默认值相同的项不写，交给样式表里的默认值。 */
export function appearanceVars(settings: AppearanceSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  const accent = accentTokens(settings.accent);
  if (accent) {
    for (const key of ACCENT_TOKEN_KEYS) {
      vars[accentVarName(key, false)] = accent.light[key];
      vars[accentVarName(key, true)] = accent.dark[key];
    }
  }
  for (const role of Object.keys(STATUS_SCALES) as StatusRole[]) {
    const hex = settings.status[role];
    if (!hex) continue;
    const scale = colorScale(hex);
    for (const name of STATUS_SCALES[role]) {
      for (const step of COLOR_SCALE_STEPS) vars[`--color-${name}-${step}`] = scale[step];
    }
  }
  if (settings.barThickness !== BAR_THICKNESS_RANGE.default) {
    vars["--cp-pref-bar"] = String(settings.barThickness);
  }
  if (settings.uiScale !== null) vars["--cp-pref-ui-scale"] = String(settings.uiScale);
  if (settings.textScale !== TEXT_SCALE_RANGE.default) {
    vars["--cp-pref-text-scale"] = String(settings.textScale);
  }
  if (settings.weightShift !== 0) vars["--cp-pref-weight-shift"] = String(settings.weightShift);
  return vars;
}

/**
 * 存储格式。settings 是唯一的真相；attrs / vars 是按它算好的结果，只给 HTML 入口的首屏脚本用
 * （那段脚本在打包之外，不能 import 这里的颜色计算）。应用启动后会按 settings 重新计算并覆盖，
 * 所以即使算法改了、存的结果旧了，也只影响升级后第一次打开时的首帧。
 */
export interface StoredAppearance {
  version: number;
  settings: AppearanceSettings;
  attrs: AppearanceAttributes;
  vars: Record<string, string>;
}

export function serializeAppearance(settings: AppearanceSettings): string {
  const stored: StoredAppearance = {
    version: STORAGE_VERSION,
    settings,
    attrs: appearanceAttributes(settings),
    vars: appearanceVars(settings),
  };
  return JSON.stringify(stored);
}

export function parseStoredAppearance(raw: string | null): AppearanceSettings {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_APPEARANCE;
    const record = parsed as Record<string, unknown>;
    if (record.version !== STORAGE_VERSION) return DEFAULT_APPEARANCE;
    return normalizeAppearance(record.settings);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
