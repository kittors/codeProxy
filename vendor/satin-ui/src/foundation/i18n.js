// 多语言：组件里所有给人看的文字都走 t(键, 参数)。默认简体中文（locales/zh-CN.js），另带英文（satin-ui/locales/en，按需引入，不用的不打包）。
//   import en from "satin-ui/locales/en"; addLocale("en", en); setLocale("en");   // 换整套
//   setLocale({ "pager.0": "上一页" });                                // 只改几条（没给的用默认）
//   addLocale("ja", { ... }); setLocale("ja");                         // 加一套
// 缺的键回到中文；参数用 {p0} {p1} 占位。导入本身没有副作用。
// 中文原文分散在各组件自己的语言表里（locales/zh-CN/<组件>.js），组件用 scoped(自己的表) 拿到 t；
// 这里只放"当前语言"的覆盖表：setLocale 换语言、改几条，都写进 cur
const packs = { "zh-CN": {} };
let cur = {}, lang = "zh-CN";
const fmt = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s);
const norm = (name) => {
  const s = String(name || "").trim();
  if (!s) return "zh-CN";
  if (packs[s]) return s;
  const low = s.toLowerCase();
  if (low === "zh" || low.startsWith("zh-cn") || low.startsWith("zh-hans")) return "zh-CN";
  if (low === "en" || low.startsWith("en-")) return packs.en ? "en" : "zh-CN";
  return packs[low] ? low : "zh-CN";
};
export const scoped = (defaults) => (key, params) => fmt(cur[key] ?? defaults[key] ?? key, params);
const subs = new Set();
// 全局查：当前语言里有就用，没有就原样返回键（组件内部用 scoped，不用这个）
export const t = (key, params) => fmt(cur[key] ?? key, params);
export function addLocale(name, messages) { packs[name] = messages; }
// 换语言：支持 setLocale("en", enPack) 一步注册并切换，或 setLocale("en")（已通过 addLocale 注册），或传消息表在当前语言上局部覆盖
export function setLocale(nameOrMessages, messages) {
  if (typeof nameOrMessages === "string") {
    if (messages && typeof messages === "object") packs[nameOrMessages] = messages;
    const target = norm(nameOrMessages);
    cur = { ...(packs[target] ?? {}) };
    lang = target;
  } else if (nameOrMessages) {
    cur = { ...cur, ...nameOrMessages };
  }
  for (const f of subs) f(lang);
}
export const getLocale = () => lang;
// 数字、日期格式化用的 BCP 47 语言标记（toLocaleString、Intl.DateTimeFormat）
export const intlLocale = () => (lang === "zh-CN" ? "zh-CN" : lang);
export const onLocaleChange = (f) => (subs.add(f), () => subs.delete(f));
