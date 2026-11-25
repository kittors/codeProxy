import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/theme.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
// 主题定制：主色（和成功 / 警告 / 危险三种状态色）、字体、字号比例——随时改，所有组件跟着变。
// 组件只认 CSS 变量（--accent / --on-primary / --success / --warning / --danger / --sans / --mono / --font-scale），这里只是把选择写到根元素上；
// 深浅两套主题各用各的值（主色在深色下自动提亮，保证在深底上看得清），选择存在 localStorage，刷新还在。

const root = typeof document !== "undefined" ? document.documentElement : undefined, KEY = "satin-custom";
// 主色：默认"墨"——跟着主题的文字色走（黑白克制，Satin 的本色）；其余几种是给品牌色用的，深色下用更亮的那一版
export const ACCENTS = [
  { id: "ink", get name() { return tt("theme.0"); }, light: null, dark: null },
  { id: "blue", get name() { return tt("theme.1"); }, light: "#0a66d9", dark: "#3d8bfd" },
  { id: "indigo", get name() { return tt("theme.2"); }, light: "#4f46e5", dark: "#8b85ff" },
  { id: "green", get name() { return tt("theme.3"); }, light: "#18794e", dark: "#3dd68c" },
  { id: "amber", get name() { return tt("theme.4"); }, light: "#b45309", dark: "#f5a524" },
  { id: "rose", get name() { return tt("theme.5"); }, light: "#d6245b", dark: "#ff5c8a" },
];
// 字体：都是系统里就有的字体，不额外下载；中文跟着回退到苹方 / 宋体 / 圆体
export const FONTS = [
  { id: "system", get name() { return tt("theme.6"); }, sans: null },
  { id: "rounded", get name() { return tt("theme.7"); }, sans: '"SF Pro Rounded", ui-rounded, "Yuanti SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "humanist", get name() { return tt("theme.8"); }, sans: '"Avenir Next", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: "serif", get name() { return tt("theme.9"); }, sans: '"New York", ui-serif, "Songti SC", "Noto Serif SC", serif' },
];
export const SCALES = [{ id: "s", get name() { return tt("theme.10"); }, v: .93 }, { id: "m", get name() { return tt("theme.11"); }, v: 1 }, { id: "l", get name() { return tt("theme.12"); }, v: 1.07 }, { id: "xl", get name() { return tt("theme.13"); }, v: 1.14 }];
// 视觉规范可定制档位：圆角（同步 data-radius）、线条质感（极细/标准/清晰）、过渡节奏（标准/干脆/极简零过渡）
export const RADII = [{ id: "6", get name() { return tt("theme.14"); } }, { id: "8", get name() { return tt("theme.15"); } }, { id: "10", get name() { return tt("theme.16"); } }, { id: "pill", get name() { return tt("theme.17"); } }];
export const LINES = [{ id: "fine", get name() { return tt("theme.18"); }, l: .055, c: .1, d: .06, dc: .1 }, { id: "normal", get name() { return tt("theme.15"); } }, { id: "crisp", get name() { return tt("theme.19"); }, l: .13, c: .21, d: .15, dc: .22 }];
export const MOTIONS = [{ id: "normal", get name() { return tt("theme.15"); }, v: 1 }, { id: "crisp", get name() { return tt("theme.20"); }, v: .55 }, { id: "off", get name() { return tt("theme.21"); }, v: 0 }];
export const DEFAULTS = { accent: "ink", custom: "", font: "system", scale: "m", radius: "pill", line: "normal", motion: "normal", success: "", warning: "", danger: "" };
// 颜色小工具：十六进制 ↔ RGB、相对亮度、和白色 / 黑色按比例混
const rgb = (hex) => { const h = hex.replace("#", ""), n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const luminance = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const mix = (h, to, k) => { const a = rgb(h), b = rgb(to); return hex(a.map((v, i) => v + (b[i] - v) * k)); };
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
// 深色主题下太暗的颜色提亮到和深底对比度至少 4.5；浅色主题下太亮的压暗
function fit(h, dark) {
  const bg = dark ? "#1c1c1e" : "#ffffff"; let c = h;
  for (let k = 0; k < 12 && contrast(c, bg) < 4.5; k++) c = mix(c, dark ? "#ffffff" : "#000000", .12);
  return c;
}
export const onColor = (h) => (luminance(h) > .36 ? "#000000" : "#ffffff");
/* 主色上的字：亮的用黑字，暗的用白字 */

export function load() {
  try {
    const r = localStorage.getItem("satin-radius");
    return { ...DEFAULTS, ...(r ? { radius: r } : {}), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch { return { ...DEFAULTS }; }
}
let cur = typeof localStorage !== "undefined" ? load() : { ...DEFAULTS };
export const get = () => ({ ...cur });
// 一套选择在深色或浅色下要写的变量（没改的不写，用样式表里的默认值）
const VARS = ["--sn-accent", "--sn-on-primary", "--sn-success", "--sn-warning", "--sn-danger", "--sn-sans", "--sn-font-scale", "--sn-line", "--sn-line-control", "--sn-card-line", "--sn-motion-scale"];
export function vars(t, dark) {
  const o = {}, a = ACCENTS.find((x) => x.id === t.accent), base = t.custom ? fit(t.custom, dark) : a && (dark ? a.dark : a.light);
  if (base) { o["--sn-accent"] = base; o["--sn-on-primary"] = onColor(base); }
  for (const k of ["success", "warning", "danger"]) if (t[k]) o["--sn-" + k] = fit(t[k], dark);
  const f = FONTS.find((x) => x.id === t.font); if (f?.sans) o["--sn-sans"] = f.sans;
  const s = SCALES.find((x) => x.id === t.scale); if (s && s.v !== 1) o["--sn-font-scale"] = String(s.v);
  const ln = LINES.find((x) => x.id === t.line);
  if (ln?.l) { const rgb = dark ? "255,255,255" : "0,0,0", la = dark ? ln.d : ln.l, ca = dark ? ln.dc : ln.c; o["--sn-line"] = `rgba(${rgb},${la})`; o["--sn-line-control"] = `rgba(${rgb},${ca})`; o["--sn-card-line"] = `rgba(${rgb},${Math.max(.04, +(la * .8).toFixed(3))})`; }
  const mo = MOTIONS.find((x) => x.id === t.motion); if (mo && mo.v !== 1) o["--sn-motion-scale"] = String(mo.v);
  return o;
}
// 把当前选择写到某个文档的根元素上（官网里的演示 iframe 也用它同步）
export function paint(el = root, t = cur) {
  const o = vars(t, (el.dataset.theme || root.dataset.theme) === "dark");
  for (const k of VARS) if (o[k]) el.style.setProperty(k, o[k]); else el.style.removeProperty(k);
  if (t.radius && el.dataset.radius !== t.radius) el.dataset.radius = t.radius;
  if (t.motion && t.motion !== "normal") el.dataset.motion = t.motion; else delete el.dataset.motion;
}
// 刷新不闪：两套主题下的变量各存一份，theme-boot.js 在第一帧之前先写上（模块脚本要等全部加载完才跑）
const remember = () => { try { localStorage.setItem(KEY + "-css", JSON.stringify({ light: vars(cur, false), dark: vars(cur, true) })); localStorage.setItem("satin-radius", cur.radius || "pill"); } catch {} };
const subs = new Set();
export const onChange = (f) => (subs.add(f), () => subs.delete(f));
export function set(patch) {
  cur = { ...cur, ...patch }; localStorage.setItem(KEY, JSON.stringify(cur)); remember(); paint();
  for (const f of subs) f(get());
}
export const reset = () => set({ ...DEFAULTS });
// 页面级：深浅主题切换后重新上色、别的标签页改了主题同步过来、第一次写上当前选择。setup() 里装一次
export function installTheme() {
// 深浅主题切换后重新算（主色在深色下要用亮的那一版）
new MutationObserver(() => paint()).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
// 别的页面（官网、演示 iframe、另一个标签页）改了主题：这里读回来重新上色，订阅的人也通知到
addEventListener("storage", (e) => { if (e.key === KEY || e.key === "satin-radius") { cur = load(); paint(); for (const f of subs) f(get()); } });
paint();
remember();
}

// 局部主题：页面里某一块用自己的深浅和主色（不碰根元素、不写 localStorage）。
//   applyTheme(el, { mode: "dark", accent: "blue", scale: "l", radius: "8", line: "crisp", motion: "crisp" })
// mode 写成 el 的 data-theme（令牌在这一块里按这个主题重新算）；其余选项和 set() 一样，写成这一块上的 CSS 变量。返回撤销函数
export function applyTheme(el, { mode, ...choice } = {}) {
  const prev = el.dataset.theme, prevR = el.dataset.radius, prevM = el.dataset.motion;
  if (mode) el.dataset.theme = mode;
  paint(el, { ...DEFAULTS, ...choice });
  return () => {
    if (prev == null) delete el.dataset.theme; else el.dataset.theme = prev;
    if (prevR == null) delete el.dataset.radius; else el.dataset.radius = prevR;
    if (prevM == null) delete el.dataset.motion; else el.dataset.motion = prevM;
    for (const k of VARS) el.style.removeProperty(k);
  };
}


// ———— 深浅模式 ————
// "auto"（跟着系统）、"light"、"dark"；存在 localStorage 的 "satin-theme"（和 theme-boot 同一个键，刷新还在）。
// 换的时候整页交叉淡化：不给每个元素加颜色过渡（几千个元素一起过渡会卡），用 View Transitions 拍下旧画面再淡化到新画面；减少动态效果时直接换。
//   import { setMode } from "satin-ui/theme";  setMode("dark");
const MODE_KEY = "satin-theme";
let modeMq = null, modeOn = null, curMode = null;
export function getMode() { if (curMode) return curMode; try { return localStorage.getItem(MODE_KEY) || "auto"; } catch { return "auto"; } }
// persist: false 只在这一页生效、不写 localStorage（setup() 给没引 theme-boot 的页面补上时用）
export function setMode(mode = "auto", { animate = true, persist = true } = {}) {
  if (!root) return;
  curMode = mode;
  if (persist) try { localStorage.setItem(MODE_KEY, mode); } catch {}
  modeMq ??= matchMedia("(prefers-color-scheme: dark)");
  // 跟着系统时，系统换了深浅也跟着换（只装一次；按"现在选的"模式判断）
  if (!modeOn) { modeOn = () => applyMode(true); modeMq.addEventListener("change", modeOn); }
  applyMode(animate);
}
function applyMode(anim) {
  const m = curMode ?? getMode(), next = m === "auto" ? (modeMq.matches ? "dark" : "light") : m;
  if (root.dataset.theme === next) return;
  const swap = () => { root.dataset.theme = next; };
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("sn-reduce-motion");
  if (anim && root.dataset.theme && document.startViewTransition && !still) document.startViewTransition(swap).ready.catch(() => {}); else swap(); // 浏览器中途放弃过渡（窗口大小变了）时 ready 会 reject：接住，主题照样换好
}
