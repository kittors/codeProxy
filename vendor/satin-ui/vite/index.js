// satin-ui/vite：
// 1. 首帧防闪主题引导（themeBoot，默认开启）：把 theme-boot 内联进 index.html 的 <head> 最前面
// 2. 自动按需 CSS 注入（css: "auto"）：静态分析模块里的 satin-ui 导入，仅注入实际用到组件的最小 CSS 分片
//    例：import satin from "satin-ui/vite";
//        export default defineConfig({ plugins: [react(), satin({ css: "auto" })] });
// 3. 导出 satinResolver / satinDirectiveResolver（对接 unplugin-vue-components，Vue 模板零配置按需导入 JS + CSS）
import boot from "../src/foundation/theme-boot-script.js";
import { resolveStyles } from "../src/core/style-map.js";
export { satinResolver, satinDirectiveResolver, satinAutoImportPreset } from "./resolver.js";

const CODE_FILE_RE = /\.(?:[cm]?[jt]sx?|vue|svelte)(?:$|\?)/;
const SKIP_QUERY_RE = /[?&](?:type=style|raw|url|inline|worker|sharedworker)(?:&|$)/;
const FULL_CSS_RE = /["']satin-ui\/(?:css(?:\/(?:satin|page)(?:\.min)?\.css|\/min)?|dist\/(?:satin|page)\.min\.css)["']/;
const EXISTING_CSS_RE = /import\s+["'](satin-ui\/css\/[^"']+)["']/g;

/** 剥离注释（保留字符串字面量与换行数），避免把注释里的示例 import 误识别为真导入 */
function stripComments(code) {
  let out = "", i = 0, n = code.length;
  while (i < n) {
    const ch = code[i], next = code[i + 1];
    if (ch === "'" || ch === '"' || ch === "`") {
      const q = ch; out += ch; i++;
      while (i < n) {
        const c = code[i];
        out += c; i++;
        if (c === "\\" && i < n) { out += code[i]; i++; continue; }
        if (c === q) break;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    out += ch; i++;
  }
  return out;
}

/**
 * 从源码中提取所有指向 satin-ui 的静态 ESM import 语句（自动忽略 import type 与 type-only specifier）。
 * @param {string} code
 * @returns {Array<{ specifier: string, names: string[] }>}
 */
export function parseSatinImports(code) {
  if (!code || !code.includes("satin-ui")) return [];
  const clean = stripComments(code);
  const re = /(?:^|[;\n])\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+["'](satin-ui(?:\/[^"']+)?)["']/g;
  const entries = [];
  let m;
  while ((m = re.exec(clean))) {
    if (m[1]) continue; // 跳过 `import type { ... } from "satin-ui/..."`
    const clause = m[2].trim();
    const specifier = m[3];
    const names = [];
    // 1. 提取大括号内的具名导入（如 `{ Button, Select as S, type ButtonProps }`）
    const braceMatch = clause.match(/\{([\s\S]*?)\}/);
    if (braceMatch) {
      for (const raw of braceMatch[1].split(",")) {
        const part = raw.trim();
        if (!part || /^type\s+/.test(part)) continue;
        const imported = part.split(/\s+as\s+/)[0].trim();
        if (imported) names.push(imported);
      }
    }
    // 2. 处理大括号之外的默认导入 / 命名空间导入
    const outside = braceMatch ? clause.replace(braceMatch[0], "").trim() : clause;
    if (/\*\s+as\s+/.test(outside)) {
      names.push("*");
    } else {
      const def = outside.replace(/,/g, "").trim();
      if (def && !/^type\b/.test(def)) names.push("default");
    }
    entries.push({ specifier, names });
  }
  return entries;
}

/** 计算注入点：避开文件顶部的 "use client" / "use strict" 指令序言 */
function findInsertOffset(code) {
  const m = code.match(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*(\s*["']use (?:client|strict|server)["']\s*;?[ \t]*\r?\n)+/);
  return m ? m[0].length : 0;
}

/**
 * 对单段源码执行按需 CSS 注入（纯函数，方便单元测试和其它构建工具复用）。
 * @param {string} code
 * @param {{ reset?: boolean, base?: boolean }} [options]
 * @returns {{ code: string, injected: string[] } | null}
 */
export function transformSatinCss(code, { reset = true, base = true } = {}) {
  if (!code || !code.includes("satin-ui") || FULL_CSS_RE.test(code)) return null;
  const entries = parseSatinImports(code);
  if (!entries.length) return null;
  const cssList = resolveStyles(entries, { base, reset });
  if (!cssList.length) return null;
  const existing = new Set();
  for (const m of code.matchAll(EXISTING_CSS_RE)) existing.add(m[1]);
  const toInject = cssList.filter((c) => !existing.has(c));
  if (!toInject.length) return null;
  const header = toInject.map((c) => `import "${c}";`).join("\n") + "\n";
  const offset = findInsertOffset(code);
  return {
    code: offset ? code.slice(0, offset) + header + code.slice(offset) : header + code,
    injected: toInject,
  };
}

/**
 * Satin Vite 插件：
 * - `themeBoot`（默认 true）：把 theme-boot 内联进 index.html 的 <head> 顶部防首帧闪烁
 * - `css`（默认 false）：设为 `"auto"` 开启零配置自动按需 CSS 注入；设为 `"page"` / `"full"` 自动注入全量样式
 * - `reset`（默认 true）：仅 `css: "auto"` 时生效，是否附带轻量化 `reset.css`
 */
export default function satin(options = {}) {
  const { themeBoot = true, css = false, reset = true } = options;
  const plugin = {
    name: "satin-ui",
    enforce: "post",
  };
  if (themeBoot) {
    plugin.transformIndexHtml = () => [{ tag: "script", children: boot, injectTo: "head-prepend" }];
  }
  if (css === "auto") {
    plugin.transform = (code, id) => {
      if (!id || id.startsWith("\0") || id.includes("/node_modules/") || id.includes("\\node_modules\\")) return null;
      if (!CODE_FILE_RE.test(id) || SKIP_QUERY_RE.test(id)) return null;
      const res = transformSatinCss(code, { reset, base: true });
      return res ? { code: res.code, map: null } : null;
    };
  } else if (css === "page" || css === "full") {
    const entryCss = css === "page" ? "satin-ui/css/page.css" : "satin-ui/css";
    plugin.transform = (code, id) => {
      if (!id || id.startsWith("\0") || id.includes("/node_modules/") || id.includes("\\node_modules\\")) return null;
      if (!CODE_FILE_RE.test(id) || SKIP_QUERY_RE.test(id)) return null;
      if (!code.includes("satin-ui") || FULL_CSS_RE.test(code)) return null;
      if (!parseSatinImports(code).length) return null;
      const offset = findInsertOffset(code);
      const line = `import "${entryCss}";\n`;
      return { code: offset ? code.slice(0, offset) + line + code.slice(offset) : line + code, map: null };
    };
  }
  return plugin;
}
