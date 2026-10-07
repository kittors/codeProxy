import { describe, expect, it } from "vitest";
import { registeredVendorBrands, vendorBrand, vendorBrandStyle } from "../vendorBrands";

/*
 * 品牌色的可读性约束：徽章与标签的字只有 9–11px，按 WCAG AA 正文要求 ≥ 4.5:1。
 *
 * 背景取自 apps/admin-panel/src/styles/index.css 的主题变量（--cp-surface / --cp-canvas / --cp-ink-2）。
 * 淡底按组件里最深的一档再加余量：浅色 16%（组件最多 14%）；深色透明叠加 20%（组件 18%）、
 * 与卡片底实色混合 28%（供应商页签角标 26%）。组件把淡底加深到超过这里时，这组测试要跟着改。
 */
const LIGHT = { surface: "#ffffff", ink2: "#5d5d5d" };
const DARK = { surfaces: ["#2a2a2a", "#212121"], ink2: "#b4b4b4" };
const AA = 4.5;

type Rgb = [number, number, number];

const parseHex = (hex: string): Rgb => {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255) as Rgb;
};
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// sRGB ↔ Oklab（Björn Ottosson 的矩阵），用来复现 CSS 的 color-mix(in oklab, …)。
const toOklab = (rgb: Rgb): Rgb => {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const fromOklab = ([L, a, b]: Rgb): Rgb => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => toGamma(Math.min(1, Math.max(0, c)))) as Rgb;
};

/** color-mix(in oklab, a weight, b)。 */
const mixOklab = (a: Rgb, b: Rgb, weight: number): Rgb => {
  const [x, y] = [toOklab(a), toOklab(b)];
  return fromOklab([0, 1, 2].map((i) => x[i]! * weight + y[i]! * (1 - weight)) as Rgb);
};
/** 半透明色叠在不透明底上（浏览器在 sRGB 里合成）。 */
const over = (color: Rgb, alpha: number, backdrop: Rgb): Rgb =>
  [0, 1, 2].map((i) => color[i]! * alpha + backdrop[i]! * (1 - alpha)) as Rgb;
/** 渐变取样（未指定插值空间的 linear-gradient 在 sRGB 里插值）。 */
const lerp = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => a[i]! * (1 - t) + b[i]! * t) as Rgb;

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const brands = registeredVendorBrands().map(({ ids, brand }) => [ids.join(" / "), brand] as const);

describe("vendor brand colours stay readable", () => {
  it.each(brands)("%s: brand text on light soft surfaces", (_ids, brand) => {
    const text = parseHex(brand.text);
    const tint = parseHex(brand.color);
    const white = parseHex(LIGHT.surface);
    expect(contrast(text, over(tint, 0.16, white))).toBeGreaterThanOrEqual(AA);
    expect(contrast(text, mixOklab(tint, white, 0.16))).toBeGreaterThanOrEqual(AA);
    // 免费档：品牌字与次级墨色混出来的淡一档文字，直接压在卡片底上。
    expect(contrast(mixOklab(text, parseHex(LIGHT.ink2), 0.7), white)).toBeGreaterThanOrEqual(AA);
  });

  it.each(brands)("%s: brand text on dark soft surfaces", (_ids, brand) => {
    const text = parseHex(brand.textDark);
    const tint = parseHex(brand.colorDark);
    for (const surface of DARK.surfaces.map(parseHex)) {
      expect(contrast(text, over(tint, 0.2, surface))).toBeGreaterThanOrEqual(AA);
      expect(contrast(text, mixOklab(tint, surface, 0.28))).toBeGreaterThanOrEqual(AA);
      expect(contrast(mixOklab(text, parseHex(DARK.ink2), 0.7), surface)).toBeGreaterThanOrEqual(
        AA,
      );
    }
  });

  it.each(brands)("%s: badge text on solid and gradient fills", (_ids, brand) => {
    const themes = [
      { on: brand.onFill, from: brand.fill, to: brand.fillAccent },
      { on: brand.onFillDark, from: brand.fillDark, to: brand.fillAccentDark },
    ];
    for (const { on, from, to } of themes) {
      for (let step = 0; step <= 10; step += 1) {
        const backdrop = lerp(parseHex(from), parseHex(to), step / 10);
        expect(contrast(parseHex(on), backdrop)).toBeGreaterThanOrEqual(AA);
      }
    }
  });
});

describe("vendorBrandStyle", () => {
  it("hands the soft-surface text colours to CSS for both themes", () => {
    const kiro = vendorBrand("kiro");
    expect(kiro).not.toBeNull();
    // Kiro 的亮橙在白底上不到 2:1，淡底文字必须是压暗过的那一档，而不是 logo 色本身。
    expect(kiro!.text).not.toBe(kiro!.color);
    expect(vendorBrandStyle(kiro!)).toMatchObject({
      "--brand-text-l": kiro!.text,
      "--brand-text-d": kiro!.textDark,
    });
  });
});
