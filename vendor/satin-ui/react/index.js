"use client"; // Next.js 等 React 服务端组件环境：这些封装用到状态和副作用，是客户端组件
// satin-ui/react：React 18+ 的薄封装。不用 JSX（不需要构建），每个组件都是普通的 React 组件。
// · 受控 / 非受控：给 value 就是受控（onChange 里不改 value，组件会退回去）；只给 defaultValue 就是非受控
// · ref 拿到 Satin 实例（update / destroy / 各组件的方法）
// · SSR 安全：服务端输出和浏览器第一帧一样的标记（createXxx.html），水合以后再接交互；导入时不碰 document
// · StrictMode 下挂两次、卸载一次也不漏：每次挂载都配对一次 destroy
// · 第一次挂载任何组件时自动调 setup()（Tooltip、浮层栈这些页面级行为），最后一个组件卸载时撤掉
import { createElement as h, forwardRef, useEffect, useRef, useState, useId, useCallback, useMemo, cloneElement, isValidElement, Children } from "react";
import { createRoot } from "react-dom/client";
import * as S from "../src/components.js";
import { setup } from "../src/setup.js";
import { get as getTheme, set as setThemeChoice, reset as resetThemeChoice, paint as paintTheme, applyTheme, onChange as onThemeChange, getMode, setMode, DEFAULTS as THEME_DEFAULTS } from "../src/theme.js";
import { openDialog, closeDialog, wireDialog, openDrawer } from "../src/overlay.js";
import { initSeg } from "../src/core.js";
import { ICONS } from "../src/icons.js";
import { emptyArtSvg } from "../src/empty-art.js";
import { CHECK, removeChip, shakeInput } from "../src/form.js";
import { scoped, setLocale as setI18nLocale, getLocale as getI18nLocale, onLocaleChange } from "../src/i18n.js";
import I18N_COMPONENTS from "../src/locales/zh-CN/components.js";
import { wrap, useIso, cx } from "./wrap.js";
const tt = /* @__PURE__ */ scoped(I18N_COMPONENTS);

// 自己包：重组件（对话、Markdown、流程图、数据表格……，各自单独引入）或别的 createXxx 也能变成 React 组件，用法和下面这些一样。
//   import { createChat } from "satin-ui/chat";  const Chat = wrapSatin(createChat, { events: [] });  <Chat title="助手" respond={respond} />
//   valueKey：受控的那个属性；events：组件会发的事件名（onXxx 转过去）
//   数据表格已经包好了：import { DataGrid } from "satin-ui/react/grid"
export const wrapSatin = (create, opts) => wrap(create, opts);

// ———— 有交互的组件 ————
// 头像：src 优先、加载失败退回预设；没有 src 按 name / seed 稳定地挑一张预设。旁边已经写了名字就加 decorative
export const Avatar = /* @__PURE__ */ wrap(S.createAvatar, { events: [], displayName: "Avatar" });
export const Segmented = /* @__PURE__ */ wrap(S.createSegmented, { displayName: "Segmented" });
export const Slider = /* @__PURE__ */ wrap(S.createSlider, { displayName: "Slider" });
export const Select = /* @__PURE__ */ wrap(S.createSelect, { displayName: "Select" });
export const Otp = /* @__PURE__ */ wrap(S.createOtp, { valueKey: "code", events: ["complete"], displayName: "Otp" });
export const Tabs = /* @__PURE__ */ wrap(S.createTabs, { displayName: "Tabs" });
export const Pager = /* @__PURE__ */ wrap(S.createPager, { valueKey: "page", displayName: "Pager" });
export const Collapse = /* @__PURE__ */ wrap(S.createCollapse, { valueKey: "open", events: ["toggle", "change"], stateKey: "expanded", displayName: "Collapse" });
export const TagInput = /* @__PURE__ */ wrap(S.createTagInput, { valueKey: "tags", displayName: "TagInput" });
export const Stepper = /* @__PURE__ */ wrap(S.createStepper, { displayName: "Stepper" });
export const NumberFlow = /* @__PURE__ */ wrap(S.createNumberFlow, { events: [], displayName: "NumberFlow" });
// 密码框（显示 / 隐藏、大写提示，meter 出强度条）、邮箱框（格式对了出对勾）：value + onChange(值) 当受控组件用；label、help、name、placeholder
export const Password = /* @__PURE__ */ wrap(S.createPassword, { passId: true, displayName: "Password" });
export const Email = /* @__PURE__ */ wrap(S.createEmail, { passId: true, displayName: "Email" });
// 搜索框：空着时显示快捷键、一输入换成清除按钮；search(q) 返回结果数（或数组、Promise），超过 300ms 放大镜换成转圈；onSearch(q)
export const Search = /* @__PURE__ */ wrap(S.createSearch, { events: ["search"], passId: true, displayName: "Search" });
// 字数统计（单行）：value + onChange 受控，max 上限；长文本：value + onChange，onSubmit（⌘↵）
export const CountInput = /* @__PURE__ */ wrap(S.createCount, { passId: true, displayName: "CountInput" });
export const LongText = /* @__PURE__ */ wrap(S.createLongText, { events: ["change", "submit"], passId: true, displayName: "LongText" });
// 提示词输入框：onSend({ text, files }) 返回 Promise——发送后进入"生成中"（发送键变停止），Promise 结束回到可发送；onStop
export const Composer = /* @__PURE__ */ wrap(S.createComposer, { events: ["send", "stop", "modelChange", "modeChange", "contextChange", "contextClick"], displayName: "Composer" });
// 表格：columns + data（树形用 children）。勾选 selected + onSelect 受控（defaultSelected 非受控）；展开 expandedKeys + onExpandChange 受控（defaultExpandedKeys 非受控）；
// sort + onSort（defaultSort）；拖行、拖列、改宽、改行高、改格子、重试：onRowReorder、onColumnReorder、onColumnResize、onRowResize、onCellEdit、onRetry。
// 受控的值"传进来的值换了（按值比）"才跟过去；ref 拿到实例（expand、expandAll、select、refresh、edit……）。
// 列的 render 可以返回 React 节点：每个格子一个小的 React 根（拿不到外面的 Context，要用就把值放进行数据里）；服务端和第一帧先空着，挂上以后画
const TABLE_EVENTS = ["sort", "select", "rowClick", "expandChange", "rowReorder", "columnReorder", "columnResize", "rowResize", "cellEdit", "pageChange", "retry", "layout"];
const TableInstance = /* @__PURE__ */ wrap(S.createTable, { valueKey: "selected", events: TABLE_EVENTS, displayName: "TableInstance" });
// 格子 → React 根记在这里（不挂在格子元素上：StrictMode 里表格销毁再挂时会清掉元素上的 _xxx）；模拟卸载后马上又挂上时不卸，
// 真卸载了才在微任务里统一卸；整表重画换下来的格子，在微任务里卸掉它们的根
function useTableCells(columns) {
  const box = useRef(null); if (box.current === null) box.current = { roots: new Map(), alive: true, sweep: false };
  useEffect(() => { const b = box.current; b.alive = true; return () => { b.alive = false; queueMicrotask(() => { if (b.alive) return; for (const r of b.roots.values()) r.unmount(); b.roots.clear(); }); }; }, []);
  return useMemo(() => (columns || []).map((c) => (typeof c.render !== "function" ? c : { ...c, render: (v, row, ctx) => {
    const out = c.render(v, row, ctx);
    if (!isValidElement(out)) return out;
    if (!ctx.cell) return ""; // 字符串阶段（服务端、第一帧）：先空着
    const b = box.current; let root = b.roots.get(ctx.cell);
    if (!root) {
      ctx.cell.replaceChildren(); root = createRoot(ctx.cell); b.roots.set(ctx.cell, root);
      if (!b.sweep) { b.sweep = true; queueMicrotask(() => { b.sweep = false; for (const [el, r] of b.roots) if (!el.isConnected) { r.unmount(); b.roots.delete(el); } }); }
    }
    root.render(out); return undefined;
  } })), [columns]);
}
export const Table = /* @__PURE__ */ forwardRef(function Table({ columns, ...rest }, ref) {
  return h(TableInstance, { ...rest, columns: useTableCells(columns), ref });
});
// 日期、时间、地址选择器：kind（date | range | time | datetime | region）、placeholder、label；onChange({ text }) 拿到触发框里显示的文字。
// today / now 固定"今天""现在"（测试、截图用）。kind、placeholder、label 只在创建时用：要换种类就换 key 重新挂
export const DatePicker = /* @__PURE__ */ wrap(S.createPicker, { displayName: "DatePicker" });

// ———— 纯样式组件：直接渲染元素（子节点、事件都是 React 自己的） ————
// 等待：loading 变成 true 以后过了 300ms 还没结束才转圈；转圈出现后至少留 500ms（和 busy() 函数同一条规矩，快的请求不闪）
function useSpin(on) {
  // 一挂上就在等：直接转圈（300ms 是防"从不等待变成等待"时闪一下的，本来就在等没有这个问题），服务端输出也一样
  const [shown, setShown] = useState(on), at = useRef(0);
  useEffect(() => {
    if (on) { if (shown) return; const t = setTimeout(() => { at.current = performance.now(); setShown(true); }, 300); return () => clearTimeout(t); }
    if (!shown) return;
    const t = setTimeout(() => setShown(false), Math.max(0, 500 - (performance.now() - at.current)));
    return () => clearTimeout(t);
  }, [on, shown]);
  return shown;
}
// 徽标：数字 → 右上角的计数（.sn-count），true → 小红点（.sn-dot）；0、false、不给都不显示
const badgeOf = (b) => (b === true ? h("span", { className: "sn-dot", key: "badge" }) : typeof b === "number" && b > 0 || typeof b === "string" && b ? h("span", { className: "sn-count", key: "badge" }, b) : null);
const Tick = () => h("svg", { className: "sn-tick", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: "M3.5 8.5l3 3 6-7" }));
// loading、done 写了（true 或 false）才套等待要用的结构（.sn-label > .sn-spin + .sn-tick + .sn-txt）：从一开始就在，转圈、打勾时宽度不跳；
// 没写就和手写的 <button class="sn-btn"> 一模一样。等待中、打勾时点了不触发 onClick
export const Button = /* @__PURE__ */ forwardRef(function Button({ variant = "secondary", size, icon, iconAfter, caret, round, selected, loading, done, badge, disabled, tip, className, children, onClick, type = "button", ...rest }, ref) {
  const iconOnly = !children && icon && !iconAfter, spin = useSpin(!!loading), ok = !!done && !spin; // 转圈收起以后再打勾
  // caret：菜单按钮后面的小箭头（12px、半透明，菜单开着时转过去）
  const lead = icon ? h(Icon, { name: icon }) : null, tail = iconAfter ? h(Icon, { name: iconAfter, className: "sn-after" }) : caret ? h(Icon, { name: "chevron-down", className: "sn-caret" }) : null;
  return h("button", {
    ref, type, ...rest, className: cx("sn-btn", `sn-${variant}`, size && size !== "md" && `sn-${size}`, iconOnly && "sn-ibtn", round && "sn-round", selected && "sn-selected", disabled && "sn-is-disabled", spin && "sn-busy", ok && "sn-ok", className),
    "aria-disabled": disabled ? "true" : undefined, "data-tip": tip ?? rest["data-tip"], "aria-label": iconOnly ? rest["aria-label"] ?? tip : rest["aria-label"], // 外面包了 <Tooltip> 时 data-tip 从 rest 来
    onClick: disabled || loading || ok ? undefined : onClick,
  }, ...(loading !== undefined || done !== undefined
    ? [h("span", { className: "sn-sheen", key: "sheen" }), h("span", { className: "sn-label", key: "label" }, h("span", { className: "sn-spin" }), h(Tick), h("span", { className: "sn-txt" }, lead, children, tail))]
    : [lead, children, tail]), badgeOf(badge));
});
// 图标：satin-ui/icons 里的名字。直接渲染 <svg class="sn-ic">（和 icon() 生成的一模一样，按钮里 .sn-btn > .sn-ic 这类选择器照样命中）
export function Icon({ name, size = 16, className }) {
  return h("svg", { className: cx("sn-ic", className), "data-icon": name, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", dangerouslySetInnerHTML: { __html: ICONS[name] || "" } });
}
// 空状态场景插画：<EmptyArt name="projects" />（projects / search / error / inbox / folder / lock），纯中性语义令牌 SVG，SSR 零闪烁直出
export function EmptyArt({ name = "projects", label, className, style, id } = {}) {
  return h("span", { id, style, className: cx("sn-empty-art", className), role: label ? "img" : undefined, "aria-label": label, "aria-hidden": label ? undefined : "true", dangerouslySetInnerHTML: { __html: emptyArtSvg(name) } });
}
export const Input = /* @__PURE__ */ forwardRef(function Input({ size, invalid, className, ...rest }, ref) {
  return h("input", { ref, ...rest, className: cx("sn-input", size && size !== "md" && `sn-${size}`, className), "aria-invalid": invalid ? "true" : undefined });
});
export const Textarea = /* @__PURE__ */ forwardRef(function Textarea({ className, ...rest }, ref) { return h("textarea", { ref, ...rest, className: cx("sn-input", className) }); });
export function Field({ label, help, error, htmlFor, className, children }) {
  // 错误区：error 传了（空字符串也算）就一直在，有字时展开、清空时收起（有动画）；不传就没有。错误出现的那一下输入框抖两下
  const el = useRef(null), bad = !!error, was = useRef(bad);
  useEffect(() => { if (bad && !was.current) shakeInput(el.current); was.current = bad; }, [bad]);
  return h("div", { ref: el, className: cx("sn-field", error && "sn-bad", className) }, label ? h("label", { className: "sn-lbl", htmlFor }, label) : null, children, help ? h("div", { className: "sn-help" }, help) : null, error != null ? h("div", { className: "sn-err" }, h("span", null, error)) : null);
}
// 复选框的方框（和 form.js 的 BOX 同一份路径和线宽）：input 后面紧跟着它，样式靠 input:checked + .sn-box
const Box = () => h("span", { className: "sn-box" }, h("svg", { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: CHECK.stroke, strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: CHECK.path })), h("span", { className: "sn-bar" }));
export const Checkbox = /* @__PURE__ */ forwardRef(function Checkbox({ label, children, className, indeterminate, ...rest }, ref) {
  const own = useRef(null);
  useIso(() => { if (own.current) own.current.indeterminate = !!indeterminate; });
  return h("label", { className: cx("sn-check", className) }, h("input", { ref: (n) => { own.current = n; if (typeof ref === "function") ref(n); else if (ref) ref.current = n; }, type: "checkbox", ...rest }), h(Box), label ?? children);
});
// 单选：同一组写同一个 name；checked + onChange 受控，defaultChecked 非受控（和原生 <input type="radio"> 一样）
export const Radio = /* @__PURE__ */ forwardRef(function Radio({ label, children, className, ...rest }, ref) {
  return h("label", { className: cx("sn-radio", className) }, h("input", { ref, type: "radio", ...rest }), h("span", { className: "sn-box" }), label ?? children);
});
export const Switch = /* @__PURE__ */ forwardRef(function Switch({ label, children, className, ...rest }, ref) {
  return h("label", { className: cx("sn-switch", className) }, h("input", { ref, type: "checkbox", role: "switch", ...rest }), h("span", { className: "sn-track" }, h("span", { className: "sn-knob" })), label ?? children);
});
// 芯片三种：
// · 给了 onChange 或 defaultSelected：能切换的筛选芯片（<button aria-pressed>，选中时前面长出对勾）；selected + onChange 受控，defaultSelected 非受控
// · removable：能移除的标签（点 × 先收起、旁边的补位，动画放完才调 onRemove——父组件这时再从列表里删掉这一项）
// · 都没给：只显示的芯片（selected 只决定选中的样子）
export const Chip = /* @__PURE__ */ forwardRef(function Chip({ selected, defaultSelected, onChange, removable, onRemove, removeLabel, className, children, onClick, ...rest }, ref) {
  const own = useRef(null), [inner, setInner] = useState(!!defaultSelected), on = selected ?? inner;
  const setRefs = (n) => { own.current = n; if (typeof ref === "function") ref(n); else if (ref) ref.current = n; };
  if (removable) {
    const label = removeLabel ?? `${tt("components.remove")} ${typeof children === "string" ? children : ""}`.trim();
    return h("span", { ...rest, ref: setRefs, className: cx("sn-chip", "sn-tag", on && "sn-on", className) }, children,
      h("button", { type: "button", className: "sn-x", "aria-label": label, onClick: () => removeChip(own.current, { keep: true, onRemoved: () => onRemove?.() }) }, h(Icon, { name: "x" })));
  }
  if (defaultSelected !== undefined || onChange) {
    return h("button", { type: "button", ...rest, ref: setRefs, className: cx("sn-chip", on && "sn-on", className), "aria-pressed": on,
      onClick: (e) => { onClick?.(e); if (e.defaultPrevented) return; const v = !on; if (selected === undefined) setInner(v); onChange?.(v); } }, h(Icon, { name: "check" }), children);
  }
  return h("span", { ...rest, ref: setRefs, className: cx("sn-chip", on && "sn-on", className) }, children);
});
// 进度：value 0～1，不给是不确定双段变速条；支持 active 微光、tone 状态色、segments 分段刻度、ring / svg 圆头数值环、height 自定义粗细
const progressAria = (value, label) => ({ role: "progressbar", "aria-label": label, ...(value == null ? {} : { "aria-valuenow": Math.round(value * 100), "aria-valuemin": 0, "aria-valuemax": 100 }) });
export function Progress({ value, ring, svg: svgRing, size, tone, active, segments, showValue, height, label, className, style }) {
  const tn = tone && tone !== "run" ? `sn-${tone}` : "";
  if (segments > 0) {
    const p = Math.max(0, Math.min(1, value ?? 0)), filled = Math.floor(p * segments), partial = p > 0 && p < 1 && filled < segments;
    return h("div", { className: cx("sn-pseg", tn, className), style: height ? { ...style, "--sn-p-h": `${height}px` } : style, ...progressAria(p, label) },
      Array.from({ length: segments }, (_, i) => h("i", { key: i, className: i < filled ? "sn-done" : i === filled && partial ? "sn-cur" : undefined })));
  }
  if (ring && (svgRing || showValue)) {
    const p = Math.max(0, Math.min(1, value ?? 0)), v = String(+p).replace(/^0\./, ".");
    return h("span", { className: cx("sn-pring-svg", size && size !== "md" && `sn-${size}`, tn, className), style: { ...style, "--sn-p": v }, ...progressAria(p, label) },
      h("svg", { viewBox: "0 0 36 36", "aria-hidden": "true" },
        h("circle", { className: "sn-pr-tr", cx: 18, cy: 18, r: 15.9 }),
        h("circle", { className: "sn-pr-fg", cx: 18, cy: 18, r: 15.9, pathLength: 100 })),
      showValue ? h("b", null, `${Math.round(p * 100)}%`) : null);
  }
  const v = value == null ? undefined : String(+value).replace(/^0\./, ".");
  if (ring) return h("span", { className: cx("sn-pring", size === "lg" && "sn-lg", className), style: { ...style, "--sn-p": v ?? "0" }, ...progressAria(value ?? 0, label) });
  const barStyle = { ...style, ...(v != null ? { "--sn-p": v } : null), ...(height ? { "--sn-p-h": `${height}px` } : null) };
  return h("div", { className: cx("sn-pbar", value == null && "sn-indet", active && "sn-active", size && size !== "md" && `sn-${size}`, tn, className), style: Object.keys(barStyle).length ? barStyle : undefined, ...progressAria(value, label) }, h("i"));
}
// 动感几何加载器：8 款纯 CSS/SVG 物理动效（matrix / dots / arc / orbit / bars / grid / radar / morph），全面支持 size / color / speed 定制
const LD_NODES = {
  matrix: () => Array.from({ length: 9 }, (_, i) => h("i", { key: i })),
  dots: () => Array.from({ length: 3 }, (_, i) => h("i", { key: i })),
  arc: () => [h("svg", { key: "s", viewBox: "0 0 24 24", "aria-hidden": "true" }, h("circle", { className: "sn-ld-tr", cx: 12, cy: 12, r: 9 }), h("circle", { className: "sn-ld-hd", cx: 12, cy: 12, r: 9 }))],
  orbit: () => [h("i", { key: 0 }), h("i", { key: 1 })],
  bars: () => Array.from({ length: 4 }, (_, i) => h("i", { key: i })),
  grid: () => Array.from({ length: 4 }, (_, i) => h("i", { key: i })),
  radar: () => [h("i", { key: 0 }), h("i", { key: 1 }), h("b", { key: 2 })],
  morph: () => [h("i", { key: 0 })],
};
export function Loader({ variant = "matrix", size, color, speed, label, className, style }) {
  const v = Object.hasOwn(LD_NODES, variant) ? variant : "matrix";
  const st = { ...style, ...(typeof size === "number" ? { "--sn-ld-size": `${size}px` } : null), ...(color ? { "--sn-ld-color": color } : null), ...(speed != null && speed !== 1 ? { "--sn-ld-speed": String(speed) } : null) };
  return h("span", { className: cx("sn-ld", `sn-ld-${v}`, typeof size === "string" && size !== "md" && `sn-${size}`, className), role: "status", style: Object.keys(st).length ? st : undefined },
    ...LD_NODES[v](), h("span", { className: "sn-sr" }, label ?? tt("components.loading")));
}
export function Spinner({ size, label, className }) { return h("span", { className: cx("sn-spinner", size === "lg" && "sn-lg", className), role: "status", "aria-label": label ?? tt("components.loading") }); }
export function Steps({ steps = [], current = 0, className }) {
  const out = [];
  steps.forEach((s, i) => { if (i) out.push(h("span", { key: "l" + i, className: cx("sn-ln", i <= current && "sn-done") }, h("i"))); out.push(h("span", { key: "s" + i, className: cx("sn-st", i < current && "sn-done", i === current && "sn-cur") }, h("span", { className: "sn-n" }, i + 1), s)); });
  return h("div", { className: cx("sn-steps", className) }, out);
}
// 文字层级 × 色调：<Text level="title1">、<Text tone="tertiary">
export function Text({ as = "span", level = "body", tone, num, truncate, className, children, ...rest }) {
  return h(as, { ...rest, className: cx(`sn-t-${level === "bodyStrong" ? "body-strong" : level}`, tone && `sn-c-${tone}`, num && "sn-num", truncate && "sn-truncate", className) }, children);
}
// Tooltip：给子元素加 data-tip（悬停 500ms 出现、键盘聚焦也出现；文字要短）
export function Tooltip({ text, kbd, children }) {
  const child = Children.only(children);
  return isValidElement(child) ? cloneElement(child, { "data-tip": text, "data-kbd": kbd }) : child;
}

// ———— 对话框：open 控制开关；标题、说明、内容、底部按钮都是 React 节点 ————
// 取消按钮写 data-cancel、关闭按钮写 data-x：和 Esc 一样先走 guard 再关。onSubmit 接住表单提交（主按钮写 type="submit"，输入框里按回车也算），弹窗不会因为提交自己关
// icon：标题左边的图标（危险确认用 trash-2）；footerClassName 加在底栏上（比如两组按钮原地切换的 sn-two、sn-asking）
export function Dialog({ open, onClose, title, description, icon, footer, footerClassName, children, className, guard, onSubmit, draggable = true }) {
  const ref = useRef(null), was = useRef(false), tid = useId();
  useIso(() => { const d = ref.current; wireDialog(d); const off = () => onCloseRef.current?.(); d.addEventListener("close", off); return () => d.removeEventListener("close", off); }, []);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useIso(() => { const d = ref.current; d.guard = guard ? () => guard(() => closeDialog(d)) : undefined; });
  useIso(() => { const d = ref.current; if (open && !d.open) { was.current = document.activeElement; openDialog(d, was.current); } else if (!open && d.open) closeDialog(d); }, [open]);
  return h("dialog", { ref, className: cx("sn-dlg", className), "aria-labelledby": title ? tid : undefined, "data-draggable": draggable === false ? "false" : undefined },
    h("form", { method: "dialog", onSubmit },
      title || description || icon ? h("div", { className: "sn-hd" }, icon ? h("span", { className: "sn-dlg-icon" }, h(Icon, { name: icon })) : null, h("div", { style: { flex: 1 } }, title ? h("h3", { id: tid }, title) : null, description ? h("div", { className: "sn-sub" }, description) : null)) : null,
      children != null && children !== false ? h("div", { className: "sn-bd" }, children) : null,
      footer ? h("div", { className: cx("sn-ft", footerClassName) }, footer) : null));
}
// 抽屉：从右边滑进来
export function Drawer({ open, onClose, title, children, footer, className }) {
  const ref = useRef(null), layer = useRef(null), tid = useId(); // 标题的 id：抽屉 aria-labelledby 指向它，读屏读得出这是什么抽屉
  useIso(() => { if (open && !layer.current) layer.current = openDrawer(ref.current, { trigger: document.activeElement, onClose: () => { layer.current = null; onClose?.(); } }); else if (!open && layer.current) { layer.current.close(true); layer.current = null; } }, [open]);
  return h("aside", { ref, className: cx("sn-drawer", className), role: "dialog", "aria-modal": "true", "aria-labelledby": title ? tid : undefined, tabIndex: -1 },
    h("div", { className: "sn-hd" }, h("h3", { id: tid }, title), h("button", { type: "button", className: "sn-btn sn-ghost sn-sm sn-ibtn", "data-x": "", "aria-label": tt("components.close"), "data-tip": tt("components.close"), "data-kbd": "Esc" }, h(Icon, { name: "x", size: 16 }))),
    h("div", { className: "sn-bd" }, children), footer ? h("div", { className: "sn-ft" }, footer) : null);
}

// ———— 应用根部：页面级行为装一次，并支持声明式配置全局深浅模式、主题与多语言（对标 ConfigProvider） ————
// 用法：<SatinProvider mode="auto" locale="en" messages={en} theme={{ accent: "blue", radius: "8" }}><App /></SatinProvider>
export function SatinProvider({ mode, theme, locale, messages, persist = false, children }) {
  const themeKey = theme ? JSON.stringify(theme) : "";
  useIso(() => setup(), []);
  useIso(() => {
    if (locale) setI18nLocale(locale, messages);
    else if (messages) setI18nLocale(messages);
  }, [locale, messages]);
  useIso(() => {
    if (mode) setMode(mode, { animate: false, persist });
  }, [mode, persist]);
  useIso(() => {
    if (!themeKey) return;
    const t = JSON.parse(themeKey);
    if (persist) setThemeChoice(t);
    else paintTheme(document.documentElement, { ...THEME_DEFAULTS, ...getTheme(), ...t });
  }, [themeKey, persist]);
  return children ?? null;
}

// 响应式多语言 Hook：读取当前语言并支持切换（setLocale("en", enPack) / setLocale("zh-CN")）
export function useLocale() {
  const [locale, setLocState] = useState(() => getI18nLocale());
  useEffect(() => onLocaleChange((l) => setLocState(l)), []);
  const updateLocale = useCallback((nameOrMessages, pack) => { setI18nLocale(nameOrMessages, pack); setLocState(getI18nLocale()); }, []);
  return { locale, setLocale: updateLocale };
}

// 局部主题作用域：让页面某一块独立使用深浅主题 / 主色 / 圆角 / 动效节奏，不触碰根元素和 localStorage
export const ThemeScope = /* @__PURE__ */ forwardRef(function ThemeScope({ as = "div", mode, accent, custom, font, scale, radius, line, motion, success, warning, danger, className, style, children, ...rest }, ref) {
  const own = useRef(null);
  const setRefs = (n) => { own.current = n; if (typeof ref === "function") ref(n); else if (ref) ref.current = n; };
  useIso(() => {
    const el = own.current; if (!el) return;
    return applyTheme(el, { mode, accent, custom, font, scale, radius, line, motion, success, warning, danger });
  }, [mode, accent, custom, font, scale, radius, line, motion, success, warning, danger]);
  return h(as, { ...rest, ref: setRefs, className, style }, children);
});

// 响应式主题 Hook：读取当前主题与深浅模式，并提供 setMode / setTheme / resetTheme
export function useTheme() {
  const [theme, setState] = useState(() => (typeof document === "undefined" ? { ...THEME_DEFAULTS } : getTheme()));
  const [mode, setModeState] = useState(() => (typeof document === "undefined" ? "auto" : getMode()));
  useEffect(() => onThemeChange((t) => setState(t)), []);
  const updateMode = useCallback((m, opts) => { setMode(m, opts); setModeState(m); }, []);
  const updateTheme = useCallback((patch) => { setThemeChoice(patch); setState(getTheme()); }, []);
  const reset = useCallback(() => { resetThemeChoice(); setState(getTheme()); }, []);
  return { mode, theme, setMode: updateMode, setTheme: updateTheme, resetTheme: reset };
}

// ———— 命令式：Toast、通知 ————
export const toast = (o) => (setup(), S.toast(o));
export const notify = (o) => (setup(), S.notify(o));
// 拿到 Satin 实例的小工具：const ref = useSatin(); <Slider ref={ref} />; ref.current.update(...)
export const useSatin = () => useRef(null);
export { initSeg };
export const useToast = () => useCallback((o) => toast(o), []);
// 菜单、右键菜单、Popover、命令面板、看图、上传、侧栏、无限列表、滚动区域、视频、音频（react/extra.js）
export * from "./extra.js";
