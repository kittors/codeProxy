// 数据表格（DOM 版、Canvas 版共用）的列：把用户给的列定义整理成内部用的样子，内置几种单元格类型怎么显示、怎么编辑。
// 库里不带演示数据：列、数据都由使用的人传（columns + data，或者 dataSource 按块加载）；设计稿的十万行演示在 demo/grid-data.js。
//
// 列定义（公开写法）：
//   key        这一列取数据里的哪个字段（唯一）
//   title      表头文字
//   width / minWidth   列宽 / 拖边改宽时最窄多少（默认 160 / 64）
//   align      "left" | "right"（数字列一般右对齐）
//   sortable   点表头排序；filter："enum"（选项多选）| "range"（数值范围）
//   resizable  能不能拖右边缘改宽（默认能）；pinned："left" | "right" 固定在一边（固定列不能拖着换位置）
//   type       内置的显示：text（默认）| int | dur（秒 → 分:秒）| status（带色点的状态）| owner（头像 + 名字）| tag（标签）| prog（0～100 的进度条）| time | money
//              | sel（勾选 + 拖行把手那一列）| act（行末的操作按钮）
//   options    选项列（status / owner / tag、enum 编辑和筛选）的选项：字符串数组，或者 [{ value, label, tone }]；数据里存选项的值（字符串数组时也可以存下标）
//   format(value, row)  显示的文字；render(value, row, { cell, key }) 自己画格子（返回 HTML 字符串或节点；DOM 版用）
//   editable / edit     能编辑（edit 写编辑器类型：text | int | enum | dur | money，不写按 type 猜）；parse(text, col) → { value } | { error }；editText(value) 编辑框里的文字
//   primary    主列（树形的缩进、展开箭头、详情箭头放在这一列；不写就是第一列普通列）

import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/grid.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const NUMERIC = new Set(["int", "dur", "money"]), BAD_KEY = /["\\<>&\n\r]/;
const EDIT_OF = { text: "text", int: "int", dur: "dur", money: "money", status: "enum", owner: "enum", tag: "enum" };
export function normCols(columns = []) {
  return columns.map((c) => {
    // key 会写进标记的属性和样式选择器：不许带引号、反斜杠、尖括号、& 和换行（字段名一般也不会有）
    if (c.key == null || BAD_KEY.test(String(c.key))) throw new Error(`数据表格：列的 key 不能为空，也不能含 " \\ < > & 和换行（${c.key}）`);
    const type = c.type || "text", pin = c.pin ?? c.pinned ?? undefined;
    return {
      ...c, key: String(c.key), title: c.title ?? "", type,
      w: c.w ?? c.width ?? (type === "sel" ? 64 : type === "act" ? 80 : 160), minW: c.minWidth ?? 64,
      pin: pin || undefined, fixed: c.fixed ?? (type === "sel" || type === "act" || !!pin),
      sort: c.sort ?? !!c.sortable, resize: c.resizable !== false, filter: c.filter,
      edit: c.edit ?? (c.editable ? EDIT_OF[type] || "text" : undefined),
      align: c.align ?? (NUMERIC.has(type) ? "right" : undefined),
    };
  });
}
// 选项：值 → { 第几个, 文字, 色调（status 的色点 .sn-s0～4，不写按第几个） }。字符串选项时数据可以存下标（数字）或文字
export function optionOf(col, v) {
  const o = col.options; if (!o || v == null) return null;
  let i = -1;
  for (let k = 0; k < o.length; k++) { const x = o[k]; if (x != null && typeof x === "object" ? x.value === v : typeof v === "number" ? k === v : x === v) { i = k; break; } }
  if (i < 0) return null;
  const x = o[i]; return { i, label: x != null && typeof x === "object" ? String(x.label ?? x.value) : String(x), tone: x != null && typeof x === "object" && x.tone != null ? x.tone : i };
}
// 负责人列挑预设头像用的键：对象选项用 value（存用户 id 就按 id 挑，重名、改名都不乱），字符串选项用显示的名字
export const ownerSeed = (col, v, text) => { const o = optionOf(col, v), x = o ? col.options[o.i] : null; return x != null && typeof x === "object" ? String(x.value) : text; };
// 第 i 个选项的值（编辑、筛选回写用）：对象选项是 value；字符串选项看数据里原来存的是什么（数字存下标、否则存文字）
export const optionValue = (col, i, sample) => { const x = col.options?.[i]; return x != null && typeof x === "object" ? x.value : typeof sample === "number" ? i : x; };
export const optionLabels = (col) => (col.options || []).map((x) => (x != null && typeof x === "object" ? String(x.label ?? x.value) : String(x)));
export const fmtDur = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
// 格子里显示的文字
export function textOf(col, v, row) {
  if (col.format) return String(col.format(v, row) ?? "");
  if (v == null) return "";
  if (col.options) { const o = optionOf(col, v); if (o) return o.label; }
  if (col.type === "dur") return fmtDur(v);
  return String(v);
}
// 编辑：把输入解析成存储的值；不合法时返回 { error }（列可以自己给 parse）
export function parseEdit(col, text) {
  if (col.parse) return col.parse(String(text), col);
  const t = String(text).trim();
  if (col.edit === "int" || col.edit === "money") { const v = col.edit === "int" ? (/^-?\d+$/.test(t) ? +t : NaN) : parseFloat(t.replace(/[¥$,\s]/g, "")); if (!Number.isFinite(v)) return { error: tt("grid.74") }; if (col.min != null && v < col.min) return { error: tt("grid.75", { p0: col.min }) }; if (col.max != null && v > col.max) return { error: tt("grid.76", { p0: col.max }) }; return { value: v }; }
  if (col.edit === "dur") { const m = /^(\d+):(\d{1,2})$/.exec(t), v = m ? +m[1] * 60 + +m[2] : /^\d+$/.test(t) ? +t : NaN; return Number.isFinite(v) && (col.min == null || v >= col.min) && (col.max == null || v <= col.max) ? { value: v } : { error: tt("grid.77") }; }
  return { value: t };
}
export const editText = (col, v) => (col.editText ? String(col.editText(v)) : col.edit === "dur" ? fmtDur(v) : v == null ? "" : String(v));
// 范围筛选的输入：时长列认 2:30 这种写法
export const parseRange = (col, s) => { const t = String(s).trim(); if (!t) return null; if (col.type === "dur") { const m = /^(\d+):(\d{1,2})$/.exec(t); return m ? +m[1] * 60 + +m[2] : /^\d+$/.test(t) ? +t : null; } const v = parseFloat(t); return Number.isFinite(v) ? v : null; };
export const rangeText = (col, v) => (v == null ? "" : col.type === "dur" ? fmtDur(v) : col.format ? String(col.format(v)) : String(v));
