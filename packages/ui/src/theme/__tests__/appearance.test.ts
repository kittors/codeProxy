import { describe, expect, test } from "vitest";
import {
  APPEARANCE_VAR_NAMES,
  DEFAULT_APPEARANCE,
  STYLE_PRESETS,
  accentTokens,
  appearanceAttributes,
  appearanceVars,
  applyStylePreset,
  matchStylePreset,
  normalizeAppearance,
  parseStoredAppearance,
  serializeAppearance,
  type AppearanceSettings,
} from "../appearance";
import { COLOR_SCALE_STEPS, colorScale, contrastRatio, hexToOklch } from "../colorMath";

const quiet = (): AppearanceSettings => applyStylePreset(DEFAULT_APPEARANCE, "quiet");

describe("appearance settings", () => {
  test("the default is the colourful style and writes nothing over the stylesheet", () => {
    expect(matchStylePreset(DEFAULT_APPEARANCE)).toBe("colorful");
    expect(appearanceAttributes(DEFAULT_APPEARANCE)).toEqual({
      palette: "colorful",
      icons: "colorful",
      bars: "semantic",
    });
    // 默认值全在样式表里（墨色强调色、8px 进度条、平台缩放），行内一个变量都不写。
    expect(appearanceVars(DEFAULT_APPEARANCE)).toEqual({});
  });

  test("anything unreadable falls back to the defaults, numbers are clamped and snapped", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance("quiet")).toEqual(DEFAULT_APPEARANCE);
    const settings = normalizeAppearance({
      palette: "neon",
      icons: "mono",
      accent: "#ABCDEF",
      status: { success: "green", warning: "#123456" },
      barThickness: 99,
      uiScale: 1.1300000001,
      textScale: 0.5,
      weightShift: 37,
    });
    expect(settings.palette).toBe("colorful");
    expect(settings.icons).toBe("mono");
    expect(settings.accent).toBe("#abcdef");
    expect(settings.status).toEqual({ success: null, warning: "#123456", danger: null });
    expect(settings.barThickness).toBe(16);
    expect(settings.uiScale).toBe(1.15);
    expect(settings.textScale).toBe(0.9);
    expect(settings.weightShift).toBe(0);
    expect(normalizeAppearance({ accent: "javascript:alert(1)" }).accent).toBe("ink");
  });

  test("a style preset replaces the colour choices and keeps the size preferences", () => {
    const sized = normalizeAppearance({ barThickness: 12, textScale: 1.1 });
    const next = applyStylePreset({ ...sized, status: { success: "#2255ff", warning: null, danger: null } }, "quiet");
    expect(next).toMatchObject({ ...STYLE_PRESETS.quiet, barThickness: 12, textScale: 1.1 });
    expect(next.status).toEqual({ success: null, warning: null, danger: null });
    expect(matchStylePreset(next)).toBe("quiet");
  });

  test("changing any colour choice makes the setup custom; sizes do not", () => {
    expect(matchStylePreset({ ...DEFAULT_APPEARANCE, barThickness: 12, weightShift: 50 })).toBe("colorful");
    expect(matchStylePreset({ ...DEFAULT_APPEARANCE, icons: "mono" })).toBe("custom");
    expect(matchStylePreset({ ...quiet(), accent: "violet" })).toBe("custom");
    expect(
      matchStylePreset({ ...DEFAULT_APPEARANCE, status: { success: null, warning: "#ff8800", danger: null } }),
    ).toBe("custom");
  });
});

describe("appearance variables", () => {
  test("the quiet style's blue keeps the exact values the quiet panel shipped with", () => {
    const vars = appearanceVars(quiet());
    expect(vars).toMatchObject({
      "--cp-pref-accent": "#2a6ee8",
      "--cp-pref-accent-hover": "#1f5bd2",
      "--cp-pref-accent-ink": "#1f5bd2",
      "--cp-pref-accent-ink-dark": "#6e9ef0",
      "--cp-pref-accent-hover-dark": "#3b7cf0",
      "--cp-pref-focus": "#2a6ee8",
    });
    expect(appearanceAttributes(quiet())).toEqual({ palette: "quiet", icons: "mono", bars: "accent" });
  });

  test.each(["#ffd400", "#0a1a3a", "#7c3aed", "#10a37f"])(
    "a picked accent %s stays readable on light and dark cards",
    (hex) => {
      const tokens = accentTokens(hex)!;
      expect(contrastRatio(tokens.light.ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.dark.ink, "#18181c")).toBeGreaterThanOrEqual(4.5);
      // 填充色上的文字取白和墨色里对比度高的那个；深色下填充色至少和卡片拉开 3:1。
      expect(contrastRatio(tokens.light.fg, tokens.light.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.dark.fg, tokens.dark.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.dark.accent, "#18181c")).toBeGreaterThanOrEqual(3);
      expect(tokens.light.accent).toBe(hex);
    },
  );

  test("a status colour replaces both palette names of its family, keeping the picked colour at 500", () => {
    const vars = appearanceVars({ ...DEFAULT_APPEARANCE, status: { success: "#2255ff", warning: null, danger: null } });
    expect(vars["--color-emerald-500"]).toBe("#2255ff");
    expect(vars["--color-green-500"]).toBe("#2255ff");
    expect(vars["--color-amber-500"]).toBeUndefined();
    expect(vars["--color-rose-500"]).toBeUndefined();
  });

  test("a generated scale runs from light to dark like the built-in ones", () => {
    const scale = colorScale("#e5484d");
    const lightness = COLOR_SCALE_STEPS.map((step) => hexToOklch(scale[step]).l);
    for (let index = 1; index < lightness.length; index += 1) {
      expect(lightness[index]!).toBeLessThan(lightness[index - 1]!);
    }
    expect(lightness[0]!).toBeGreaterThan(0.93);
    expect(lightness[lightness.length - 1]!).toBeLessThan(0.35);
  });

  test("size preferences become unitless variables the stylesheet multiplies", () => {
    const vars = appearanceVars({ ...DEFAULT_APPEARANCE, barThickness: 12, uiScale: 1.1, textScale: 1.05, weightShift: -100 });
    expect(vars).toEqual({
      "--cp-pref-bar": "12",
      "--cp-pref-ui-scale": "1.1",
      "--cp-pref-text-scale": "1.05",
      "--cp-pref-weight-shift": "-100",
    });
  });

  test("every variable the settings can produce is in the list the DOM writer clears", () => {
    const loud: AppearanceSettings = {
      ...DEFAULT_APPEARANCE,
      accent: "#ff00aa",
      status: { success: "#00ff00", warning: "#ffaa00", danger: "#ff0000" },
      barThickness: 4,
      uiScale: 1.2,
      textScale: 1.2,
      weightShift: 100,
    };
    for (const name of Object.keys(appearanceVars(loud))) {
      expect(APPEARANCE_VAR_NAMES).toContain(name);
    }
  });
});

describe("appearance storage", () => {
  test("round-trips through localStorage and rejects other versions or broken JSON", () => {
    const settings = { ...quiet(), barThickness: 10 };
    expect(parseStoredAppearance(serializeAppearance(settings))).toEqual(settings);
    const stored = JSON.parse(serializeAppearance(settings));
    expect(stored.attrs).toEqual({ palette: "quiet", icons: "mono", bars: "accent" });
    expect(stored.vars["--cp-pref-bar"]).toBe("10");
    expect(parseStoredAppearance(JSON.stringify({ ...stored, version: 2 }))).toEqual(DEFAULT_APPEARANCE);
    expect(parseStoredAppearance("{nope")).toEqual(DEFAULT_APPEARANCE);
    expect(parseStoredAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });
});
