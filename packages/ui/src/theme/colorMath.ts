/**
 * 外观设置用到的颜色计算：十六进制 ↔ sRGB ↔ OKLCH、WCAG 对比度、色阶生成。
 *
 * 自选强调色 / 状态色时，用户只给一个颜色，界面却要一整套：悬停色、写在白底和黑底上都够
 * 对比度的文字色、压在填充色上的前景色、50–950 的色阶（淡底标签用 50/100，文字用 600/700……）。
 * 在 OKLCH 里调亮度而不是在 RGB 里混黑白：OKLCH 的 L 和人眼感知的明暗基本线性，同一色相
 * 调亮调暗不会发灰、不会偏色。超出 sRGB 色域时只降彩度、不动亮度和色相。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_PATTERN.test(value);

export function hexToRgb(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex);
  if (!match) throw new Error(`invalid hex color: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((part) => clampByte(part).toString(16).padStart(2, "0")).join("")}`;
}

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (channel: number) => {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return c * 255;
};

/** WCAG 2 相对亮度。 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 对比度（1–21）。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function hexToOklch(hex: string): Oklch {
  const { r, g, b } = hexToRgb(hex);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLCH → 线性 sRGB（可能越界，由调用方判断是否在色域内）。 */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (channels: [number, number, number]) =>
  channels.every((value) => value >= -0.0005 && value <= 1.0005);

/** OKLCH → 十六进制；超出 sRGB 时二分降低彩度直到落回色域（亮度、色相不变）。 */
export function oklchToHex(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  let channels = oklchToLinear({ ...color, l });
  if (!inGamut(channels)) {
    let low = 0;
    let high = color.c;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) low = mid;
      else high = mid;
    }
    channels = oklchToLinear({ l, c: low, h: color.h });
  }
  const [r, g, b] = channels.map((value) => fromLinear(Math.min(1, Math.max(0, value))));
  return rgbToHex({ r: r!, g: g!, b: b! });
}

/** 只改亮度（L 加 delta），彩度和色相不变。 */
export function shiftLightness(hex: string, delta: number): string {
  const color = hexToOklch(hex);
  return oklchToHex({ ...color, l: color.l + delta });
}

/**
 * 把颜色调到与背景至少有 `ratio` 的对比度：背景亮就往暗调，背景暗就往亮调，步长 0.01 L。
 * 本来就够的原样返回。
 */
export function ensureContrast(hex: string, background: string, ratio: number): string {
  if (contrastRatio(hex, background) >= ratio) return hex;
  const darken = relativeLuminance(background) > 0.18;
  const base = hexToOklch(hex);
  for (let step = 1; step <= 100; step += 1) {
    const candidate = oklchToHex({ ...base, l: base.l + (darken ? -step : step) * 0.01 });
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return darken ? "#000000" : "#ffffff";
}

/** 压在填充色上的文字：白和墨色里对比度更高的那个。 */
export function readableOn(fill: string, light = "#ffffff", dark = "#111113"): string {
  return contrastRatio(light, fill) >= contrastRatio(dark, fill) ? light : dark;
}

export const COLOR_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type ColorScaleStep = (typeof COLOR_SCALE_STEPS)[number];

/*
 * 色阶：以用户给的颜色为 500，浅端向 L≈0.98 收拢、深端向 L≈0.22 收拢，彩度两头递减。
 * 系数是照着 Tailwind 色板（以及本项目重定义的状态色板）各档的亮度 / 彩度比例取的，
 * 换成任意颜色后各档的「淡底 / 描边 / 文字」用途仍然成立。
 */
const LIGHTER: Partial<Record<ColorScaleStep, number>> = {
  50: 0.93,
  100: 0.85,
  200: 0.68,
  300: 0.47,
  400: 0.24,
};
const DARKER: Partial<Record<ColorScaleStep, number>> = {
  600: 0.16,
  700: 0.33,
  800: 0.48,
  900: 0.6,
  950: 0.78,
};
const CHROMA: Record<ColorScaleStep, number> = {
  50: 0.14,
  100: 0.27,
  200: 0.5,
  300: 0.75,
  400: 0.92,
  500: 1,
  600: 0.96,
  700: 0.86,
  800: 0.74,
  900: 0.62,
  950: 0.46,
};

export function colorScale(hex: string): Record<ColorScaleStep, string> {
  const base = hexToOklch(hex);
  const scale = {} as Record<ColorScaleStep, string>;
  for (const step of COLOR_SCALE_STEPS) {
    if (step === 500) {
      scale[step] = hex.toLowerCase();
      continue;
    }
    const lighter = LIGHTER[step];
    const darker = DARKER[step];
    const l =
      lighter !== undefined
        ? base.l + (0.985 - base.l) * lighter
        : base.l - (base.l - 0.22) * (darker ?? 0);
    scale[step] = oklchToHex({ l, c: base.c * CHROMA[step], h: base.h });
  }
  return scale;
}
