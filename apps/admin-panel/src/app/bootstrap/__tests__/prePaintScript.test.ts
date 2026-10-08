import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearanceToDom,
  applyStylePreset,
  serializeAppearance,
} from "@code-proxy/ui";

/*
 * 两个 HTML 入口里阻塞渲染的首屏脚本：在样式表和应用加载之前把外观开关和变量写到 <html> 上。
 * 它在打包之外、不能 import 外观模型，所以这里用真实的序列化结果喂给它，确认它写出的 DOM
 * 和应用启动后 applyAppearanceToDom 写的一致；同时确认存储被篡改时它不会写进别的东西。
 */

const ENTRIES = ["index.html", "manage.html"] as const;

const inlineScript = (entry: (typeof ENTRIES)[number]) => {
  const html = readFileSync(resolve(__dirname, "../../../..", entry), "utf8");
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error(`${entry} has no inline pre-paint script`);
  return { html, script: match[1]! };
};

const root = () => document.documentElement;

const snapshot = () => ({
  palette: root().dataset.palette,
  icons: root().dataset.icons,
  bars: root().dataset.bars,
  style: root().getAttribute("style") ?? "",
});

const resetRoot = () => {
  for (const name of ["data-palette", "data-icons", "data-bars", "data-os", "data-theme", "style", "class"]) {
    root().removeAttribute(name);
  }
};

describe.each(ENTRIES)("%s pre-paint script", (entry) => {
  beforeEach(() => {
    localStorage.clear();
    resetRoot();
  });
  afterEach(() => {
    localStorage.clear();
    resetRoot();
  });

  test("ships the colourful defaults on <html> for the first paint", () => {
    const { html } = inlineScript(entry);
    expect(html).toContain('<html lang="zh-CN" data-palette="colorful" data-icons="colorful" data-bars="semantic">');
  });

  test("writes exactly what the app writes for a stored appearance", () => {
    const settings = { ...applyStylePreset(DEFAULT_APPEARANCE, "quiet"), barThickness: 11, textScale: 1.1 };
    localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(settings));
    new Function(inlineScript(entry).script)();
    const fromScript = snapshot();
    expect(fromScript.palette).toBe("quiet");
    expect(root().style.getPropertyValue("--cp-pref-accent")).toBe("#2a6ee8");

    resetRoot();
    applyAppearanceToDom(settings);
    expect(snapshot()).toEqual(fromScript);
  });

  test("ignores tampered storage: unknown variable names, values that could break out, other versions", () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attrs: { palette: "quiet", icons: "x y", bars: 1 },
        vars: {
          "--cp-pref-accent": "red;background:url(https://evil.test)",
          "--cp-pref-accent-dark": "url(//evil.test/x)",
          "--cp-pref-bar": "12",
          "--other": "#000000",
          color: "#000000",
          "--color-sky-500": "#000000",
        },
      }),
    );
    new Function(inlineScript(entry).script)();
    expect(root().dataset.palette).toBe("quiet");
    expect(root().dataset.icons).toBeUndefined();
    expect(root().dataset.bars).toBeUndefined();
    expect(root().style.getPropertyValue("--cp-pref-bar")).toBe("12");
    expect(root().style.getPropertyValue("--cp-pref-accent")).toBe("");
    expect(root().style.getPropertyValue("--cp-pref-accent-dark")).toBe("");
    expect(root().style.getPropertyValue("--other")).toBe("");
    expect(root().style.getPropertyValue("--color-sky-500")).toBe("");

    resetRoot();
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ version: 2, attrs: { palette: "quiet" }, vars: { "--cp-pref-bar": "12" } }),
    );
    new Function(inlineScript(entry).script)();
    expect(root().dataset.palette).toBeUndefined();
    expect(root().getAttribute("style") ?? "").not.toContain("--cp-pref-bar");
  });
});
