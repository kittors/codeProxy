// satin-ui/vue：Vue 3.3+ 的薄封装（渲染函数写的，不需要编译 .vue 文件）。
// · v-model：modelValue + update:modelValue（分段控件、滑块、下拉、标签页、分页、步进器、标签输入……）
// · 模板 ref 拿到 Satin 实例（expose 出 instance）
// · SSR 安全：服务端输出和浏览器第一帧一样的标记（createXxx.html），水合以后再接交互；导入时不碰 document
// · 第一次挂载任何组件时自动调 setup()（Tooltip、浮层栈这些页面级行为），最后一个组件卸载时撤掉
import * as Vue from "vue";
import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch, cloneVNode, mergeProps } from "vue";
import * as S from "../src/components.js";
import { setup } from "../src/setup.js";
import { get as getTheme, set as setThemeChoice, reset as resetThemeChoice, paint as paintTheme, applyTheme, onChange as onThemeChange, getMode, setMode, DEFAULTS as THEME_DEFAULTS } from "../src/foundation/theme.js";
import { openDialog, closeDialog, wireDialog, openDrawer } from "../src/overlay/overlay.js";
import { ICONS } from "../src/foundation/icons.js";
import { check as IC_CHECK, x as IC_X } from "../src/foundation/icons/index.js";
import { emptyArtSvg } from "../src/feedback/empty-art.js";
import { CHECK, removeChip, shakeInput } from "../src/form/form.js";
import { scoped, setLocale as setI18nLocale, getLocale as getI18nLocale, onLocaleChange } from "../src/foundation/i18n.js";
import I18N_COMPONENTS from "../src/foundation/locales/zh-CN/components.js";
import { wrap, cx } from "./wrap.js";
import * as X from "./extra.js";
const tt = /* @__PURE__ */ scoped(I18N_COMPONENTS);
const icSvg = (paths, name, size = 16, cls) => h("svg", { class: cx("sn-ic", cls), "data-icon": name, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", innerHTML: paths });

// 自己包：重组件（对话、Markdown、流程图、数据表格……，各自单独引入）或别的 createXxx 也能变成 Vue 组件。props 列出要传给组件的选项名
//   import { createChat } from "satin-ui/chat";  const SnChat = wrapSatin(createChat, { name: "SnChat", props: ["title", "respond", "placeholder"], events: [] });
//   数据表格已经包好了：import { DataGrid } from "satin-ui/vue/grid"
export const wrapSatin = (create, opts) => wrap(create, opts);

export const Segmented = /* @__PURE__ */ wrap(S.createSegmented, { name: "SnSegmented", props: ["items", "value", "size", "label"] });
// 头像：src 优先、加载失败退回预设；没有 src 按 name / seed 稳定地挑一张预设。旁边已经写了名字就加 decorative
export const Avatar = /* @__PURE__ */ wrap(S.createAvatar, { name: "SnAvatar", props: ["src", "name", "seed", "size", "label", "decorative", "online"], events: [] });
export const Slider = /* @__PURE__ */ wrap(S.createSlider, { name: "SnSlider", props: ["value", "max", "label"] });
export const Select = /* @__PURE__ */ wrap(S.createSelect, { name: "SnSelect", props: ["items", "value", "placeholder", "label"] });
export const Otp = /* @__PURE__ */ wrap(S.createOtp, { name: "SnOtp", props: ["length", "mask", "reveal"], events: ["complete"] });
export const Tabs = /* @__PURE__ */ wrap(S.createTabs, { name: "SnTabs", props: ["tabs", "value"] });
export const Pager = /* @__PURE__ */ wrap(S.createPager, { name: "SnPager", props: ["total", "page", "count"], valueKey: "page" });
export const Collapse = /* @__PURE__ */ wrap(S.createCollapse, { name: "SnCollapse", props: ["items", "single", "open"], valueKey: "open", events: ["toggle", "change"] });
export const TagInput = /* @__PURE__ */ wrap(S.createTagInput, { name: "SnTagInput", props: ["tags", "max", "placeholder", "hint"], valueKey: "tags" });
// 密码框、邮箱框：v-model 绑值；label、help、name、placeholder（密码框 meter 出强度条）
export const Password = /* @__PURE__ */ wrap(S.createPassword, { name: "SnPassword", props: ["value", "label", "help", "name", "id", "placeholder", "meter", "size", "autocomplete"] });
export const Email = /* @__PURE__ */ wrap(S.createEmail, { name: "SnEmail", props: ["value", "label", "help", "name", "id", "placeholder", "size", "autocomplete"] });
// 表格：:columns + :data（树形用 children）。v-model 绑勾上的行（selected），v-model:expanded 绑展开着的行（expandedKeys），v-model:sort 绑排序；
// 事件 @sort、@select、@row-click、@expand-change、@row-reorder、@column-reorder、@column-resize、@row-resize、@cell-edit、@retry、@layout；
// 自己画格子：插槽 #cell-<列的 key>="{ value, row, index }"，或者列的 render 返回 VNode（用 h() 写）；模板 ref 的 instance 是实例。
// data 改了（换数组、就地 push / 改行里的字段）都跟着变：只换内容变了的行，行移到新位置
// （属性、事件都写成字面量：defineComponent 的参数里有函数调用，打包时摇不掉，只用别的组件也会把表格带进来）
const TABLE_PROPS = ["columns", "data", "rows", "rowKey", "detail", "rowExpandable", "expandOnRowClick", "sort", "defaultSort", "sortLocal", "selectable", "selected", "defaultSelected", "expanded", "expandedKeys", "defaultExpandedKeys", "filter", "spans", "draggableRows", "draggableColumns", "resizableRows", "cellSelect", "rowAttrs", "empty", "loading", "skeleton", "error", "label", "striped", "compact", "plain", "fill", "lines", "maxHeight", "pagination"];
const TABLE_EVENTS = ["sort", "select", "rowClick", "expandChange", "rowReorder", "columnReorder", "columnResize", "rowResize", "cellEdit", "pageChange", "retry", "layout"];
const anyP = { type: null, default: undefined }, boolP = { type: Boolean, default: undefined };
// 插槽在这个小组件的 render 里调（依赖跟着它收集：插槽里用到的响应式数据变了，这一格自己重画）
const TableSlotCell = { name: "SnTableCell", props: { s: anyP, a: anyP }, render() { return this.s(this.a); } }; /* 布尔的写 Boolean：模板里 <Table selectable draggable-rows> 就是 true（不传还是 undefined） */
export const Table = /* @__PURE__ */ defineComponent({
  name: "SnTable", inheritAttrs: false,
  props: { columns: anyP, data: anyP, rows: anyP, rowKey: anyP, detail: anyP, rowExpandable: anyP, expandOnRowClick: boolP, sort: anyP, defaultSort: anyP, sortLocal: boolP, selectable: boolP, selected: anyP, defaultSelected: anyP, expanded: anyP, expandedKeys: anyP, defaultExpandedKeys: anyP, filter: anyP, spans: anyP,
    draggableRows: boolP, draggableColumns: boolP, resizableRows: boolP, cellSelect: boolP, rowAttrs: anyP, empty: anyP, loading: boolP, skeleton: anyP, error: { type: [Boolean, String], default: undefined },
    label: anyP, striped: boolP, compact: boolP, plain: boolP, fill: boolP, lines: anyP, maxHeight: anyP, pagination: anyP, modelValue: anyP },
  emits: ["sort", "select", "rowClick", "expandChange", "rowReorder", "columnReorder", "columnResize", "rowResize", "cellEdit", "pageChange", "retry", "layout", "update:modelValue", "update:expanded", "update:sort"],
  setup(p, { emit, expose, attrs, slots }) {
    const host = ref(null), inst = Vue.shallowRef(null), app = Vue.getCurrentInstance()?.appContext, cells = new Set();
    // 插槽格子攒到微任务里一起画（同一帧、绘制之前）：表格是在 onMounted 里建的，钩子执行期间调插槽 Vue 会警告"在 render 外调插槽"
    const pending = new Map(); let queued = false;
    const later = (cell, vnode) => { pending.set(cell, vnode); if (queued) return; queued = true; queueMicrotask(() => { queued = false; for (const [c, v] of pending) if (c.isConnected) { Vue.render(v, c); cells.add(c); } pending.clear(); }); };
    // 插槽 #cell-<key>、render 返回 VNode：用 Vue 的 render 画进格子（带上应用的上下文：全局组件、provide 都能用）；服务端和第一帧先空着
    const cols = () => (p.columns || []).map((c) => {
      const slot = slots["cell-" + c.key], fn = typeof c.render === "function" ? c.render : slot ? (v, row, ctx) => h(TableSlotCell, { s: slot, a: { value: v, row, index: ctx.index } }) : null;
      return !fn ? c : { ...c, render: (v, row, ctx) => { if (!ctx.cell && fn !== c.render) return ""; /* 插槽只在挂上以后画（setup 里拼字符串时不调） */ const out = fn(v, row, ctx); if (!Vue.isVNode(out)) return out; if (!ctx.cell) return ""; out.appContext = app; if (fn !== c.render) later(ctx.cell, out); else { Vue.render(out, ctx.cell); cells.add(ctx.cell); } return undefined; } };
    });
    const dataKey = () => (p.data !== undefined ? "data" : "rows");
    const opts = (fresh) => {
      const o = {}; for (const k of TABLE_PROPS) if (p[k] !== undefined && k !== "expanded") o[k] = p[k];
      if (p.modelValue !== undefined) o.selected = p.modelValue; if (p.expanded !== undefined) o.expandedKeys = p.expanded;
      const d = p[dataKey()]; if (fresh && Array.isArray(d)) o[dataKey()] = [...d]; // 就地改的数组：交一个新数组过去，表格才知道要重新看
      o.columns = cols(); return o;
    };
    const html = S.createTable.html(opts());
    let unsetup = null;
    onMounted(() => {
      unsetup = setup();
      const handlers = Object.fromEntries(TABLE_EVENTS.map((ev) => ["on" + ev[0].toUpperCase() + ev.slice(1), (d) => { emit(ev, d); if (ev === "select") emit("update:modelValue", d); if (ev === "expandChange") emit("update:expanded", d.keys); if (ev === "sort") emit("update:sort", d); }]));
      inst.value = S.createTable(host.value.firstElementChild, { ...opts(), ...handlers });
    });
    // 数据深看（就地改也算）；别的选项浅看（数组类的受控值看到每一项）
    const list = (v) => (Array.isArray(v) ? [...v] : v);
    watch(() => p[dataKey()], () => inst.value?.update(opts(true)), { deep: true });
    watch(() => [...TABLE_PROPS.filter((k) => k !== "data" && k !== "rows").map((k) => (k === "columns" ? p[k] : list(p[k]))), list(p.modelValue)], () => inst.value?.update(opts()));
    onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; pending.clear(); for (const c of cells) Vue.render(null, c); cells.clear(); unsetup?.(); });
    expose({ instance: inst });
    return () => h("div", { ...attrs, ref: host, class: cx("sn-host", attrs.class), style: ["display: contents", attrs.style], innerHTML: html });
  },
});
export const Search = /* @__PURE__ */ wrap(S.createSearch, { name: "SnSearch", props: ["search", "debounce", "placeholder", "label", "kbd", "id", "name", "size"], events: ["search"], modelEvent: null });
export const CountInput = /* @__PURE__ */ wrap(S.createCount, { name: "SnCountInput", props: ["value", "max", "placeholder", "size", "id", "name"] });
export const LongText = /* @__PURE__ */ wrap(S.createLongText, { name: "SnLongText", props: ["value", "max", "maxLines", "rows", "placeholder", "hint", "label", "id", "name"], events: ["change", "submit"] });
// 提示词输入框：@send 返回 Promise 时发送后进入"生成中"，Promise 结束回到可发送（所以 send 不走 emit，直接调 @send 拿返回值）
export const Composer = /* @__PURE__ */ wrap(S.createComposer, { name: "SnComposer", props: ["placeholder", "max", "maxLines", "attach", "voice", "send", "submitKey", "upload", "context", "mode", "models", "model"], events: ["send", "stop", "modelChange", "modeChange", "contextChange", "contextClick"], returns: ["send"], modelEvent: null, also: { modelChange: "update:model" } });
export const Stepper = /* @__PURE__ */ wrap(S.createStepper, { name: "SnStepper", props: ["value", "min", "max", "unit", "label"] });
export const NumberFlow = /* @__PURE__ */ wrap(S.createNumberFlow, { name: "SnNumberFlow", props: ["value", "effect", "format"], events: [] });
// 日期、时间、地址选择器：kind（date | range | time | datetime | region）、placeholder、label；@change 拿到 { text }（触发框里显示的文字）。
// 没有 v-model：选择器现在只能读出选中的结果，不能从外面设值。today / now 固定"今天""现在"；kind、placeholder、label 只在创建时用（要换就换 :key）
export const DatePicker = /* @__PURE__ */ wrap(S.createPicker, { name: "SnDatePicker", props: ["kind", "placeholder", "label", "today", "now"], modelEvent: null });

// ———— 纯样式组件 ————
export const Icon = /* @__PURE__ */ defineComponent({
  name: "SnIcon", props: { name: String, size: { type: Number, default: 16 } },
  setup: (p) => () => h("svg", { class: "sn-ic", "data-icon": p.name, width: p.size, height: p.size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", innerHTML: ICONS[p.name] || "" }),
});
export const EmptyArt = /* @__PURE__ */ defineComponent({
  name: "SnEmptyArt", props: { name: { type: String, default: "projects" }, label: String },
  setup: (p) => () => h("span", { class: "sn-empty-art", role: p.label ? "img" : undefined, "aria-label": p.label, "aria-hidden": p.label ? undefined : "true", innerHTML: emptyArtSvg(p.name) }),
});
// 按钮：loading、done 写了（true 或 false）才套等待要用的结构（.sn-label > .sn-spin + .sn-tick + .sn-txt），宽度全程不跳；没写就和手写的 <button class="sn-btn"> 一样。
// loading 变成 true 以后过了 300ms 还没结束才转圈，转圈出现后至少留 500ms（和 busy() 函数同一条规矩）；done 为 true 时原地打勾（等转圈收起以后）。等待中、打勾时点了不触发 click
const TICK = () => h("svg", { class: "sn-tick", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }, [h("path", { d: "M3.5 8.5l3 3 6-7" })]);
export const Button = /* @__PURE__ */ defineComponent({
  name: "SnButton",
  props: { variant: { type: String, default: "secondary" }, size: String, icon: String, iconAfter: String, caret: Boolean, round: Boolean, selected: Boolean, badge: { type: [Boolean, Number, String], default: undefined }, loading: { type: Boolean, default: undefined }, done: { type: Boolean, default: undefined }, disabled: Boolean, tip: String, type: { type: String, default: "button" } },
  setup(p, { slots, attrs }) {
    // 一挂上就在等：直接转圈（300ms 是防"从不等待变成等待"时闪一下的），服务端输出也带 sn-busy
    const spin = ref(!!p.loading); let at = 0, timer = 0;
    // 只在浏览器里跑（服务端渲染不起定时器）
    onMounted(() => watch(() => !!p.loading, (on) => {
      clearTimeout(timer);
      if (on) { if (!spin.value) timer = setTimeout(() => { at = performance.now(); spin.value = true; }, 300); }
      else if (spin.value) timer = setTimeout(() => (spin.value = false), Math.max(0, 500 - (performance.now() - at)));
    }, { immediate: true }));
    onBeforeUnmount(() => clearTimeout(timer));
    return () => {
      const kids = slots.default?.(), iconOnly = !kids && p.icon && !p.iconAfter, ok = !!p.done && !spin.value, blocked = p.disabled || p.loading || ok;
      const lead = p.icon ? h(Icon, { name: p.icon }) : null, tail = p.iconAfter ? h(Icon, { name: p.iconAfter, class: "sn-after" }) : p.caret ? h(Icon, { name: "chevron-down", class: "sn-caret" }) : null; // caret：菜单按钮后面的小箭头
      return h("button", {
        ...attrs, type: p.type,
        class: cx("sn-btn", `sn-${p.variant}`, p.size && p.size !== "md" && `sn-${p.size}`, iconOnly && "sn-ibtn", p.round && "sn-round", p.selected && "sn-selected", p.disabled && "sn-is-disabled", spin.value && "sn-busy", ok && "sn-ok"),
        "aria-disabled": p.disabled ? "true" : undefined, "data-tip": p.tip, "aria-label": iconOnly ? attrs["aria-label"] ?? p.tip : attrs["aria-label"],
        onClick: blocked ? undefined : attrs.onClick,
      }, [...(p.loading !== undefined || p.done !== undefined
        ? [h("span", { class: "sn-sheen" }), h("span", { class: "sn-label" }, [h("span", { class: "sn-spin" }), TICK(), h("span", { class: "sn-txt" }, [lead, kids, tail])])]
        : [lead, kids, tail]),
        // 徽标：数字 → 右上角的计数（.sn-count），true → 小红点（.sn-dot）
        p.badge === true ? h("span", { class: "sn-dot" }) : (typeof p.badge === "number" && p.badge > 0) || (typeof p.badge === "string" && p.badge) ? h("span", { class: "sn-count" }, p.badge) : null]);
    };
  },
});
export const Input = /* @__PURE__ */ defineComponent({
  name: "SnInput", inheritAttrs: false, props: { modelValue: null, size: String, invalid: Boolean }, emits: ["update:modelValue"],
  // mergeProps：写在组件上的 @input、class 和这里的合在一起（不会被盖掉）
  setup: (p, { attrs, emit }) => () => h("input", mergeProps(attrs, { class: cx("sn-input", p.size && p.size !== "md" && `sn-${p.size}`), value: p.modelValue, "aria-invalid": p.invalid ? "true" : undefined, onInput: (e) => emit("update:modelValue", e.target.value) })),
});
export const Field = /* @__PURE__ */ defineComponent({
  name: "SnField", props: { label: String, help: String, error: { type: String, default: undefined }, for: String },
  setup(p, { slots }) {
    // 错误出现的那一下（从没有变成有）输入框左右抖两下，和 setFieldError 一样
    const el = ref(null);
    watch(() => !!p.error, (bad, was) => { if (bad && !was) shakeInput(el.value); });
    return () => h("div", { ref: el, class: cx("sn-field", p.error && "sn-bad") }, [p.label ? h("label", { class: "sn-lbl", for: p.for }, p.label) : null, slots.default?.(), p.help ? h("div", { class: "sn-help" }, p.help) : null, p.error != null ? h("div", { class: "sn-err" }, [h("span", p.error)]) : null]);
  },
});
const Box = () => h("span", { class: "sn-box" }, [h("svg", { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", "stroke-width": CHECK.stroke, "stroke-linecap": "round", "stroke-linejoin": "round" }, [h("path", { d: CHECK.path })]), h("span", { class: "sn-bar" })]);
export const Checkbox = /* @__PURE__ */ defineComponent({
  name: "SnCheckbox", props: { modelValue: Boolean, label: String, indeterminate: Boolean, disabled: Boolean }, emits: ["update:modelValue"],
  setup(p, { slots, emit }) {
    // 半选只能用 DOM 属性设：没有对应的 HTML 属性，服务端渲染也不该写进标记
    const input = ref(null);
    onMounted(() => watch(() => p.indeterminate, (v) => { if (input.value) input.value.indeterminate = !!v; }, { immediate: true }));
    return () => h("label", { class: "sn-check" }, [h("input", { ref: input, type: "checkbox", checked: p.modelValue, disabled: p.disabled, onChange: (e) => emit("update:modelValue", e.target.checked) }), h(Box), p.label ?? slots.default?.()]);
  },
});
// 单选：v-model 绑这一组选中的值，value 是这一项的值；同一组写同一个 name
export const Radio = /* @__PURE__ */ defineComponent({
  name: "SnRadio", props: { modelValue: null, value: null, name: String, label: String, disabled: Boolean }, emits: ["update:modelValue"],
  setup: (p, { slots, emit }) => () => h("label", { class: "sn-radio" }, [h("input", { type: "radio", name: p.name, value: p.value, checked: p.modelValue === undefined ? undefined : p.modelValue === p.value, disabled: p.disabled, onChange: () => emit("update:modelValue", p.value) }), h("span", { class: "sn-box" }), p.label ?? slots.default?.()]),
});
export const Switch = /* @__PURE__ */ defineComponent({
  name: "SnSwitch", props: { modelValue: Boolean, label: String, disabled: Boolean }, emits: ["update:modelValue"],
  setup: (p, { slots, emit }) => () => h("label", { class: "sn-switch" }, [h("input", { type: "checkbox", role: "switch", checked: p.modelValue, disabled: p.disabled, onChange: (e) => emit("update:modelValue", e.target.checked) }), h("span", { class: "sn-track" }, [h("span", { class: "sn-knob" })]), p.label ?? slots.default?.()]),
});
// 芯片三种：v-model（或 selected）给了是能切换的筛选芯片（<button aria-pressed>）；removable 是能移除的标签（点 × 先收起，动画放完发 remove，父组件这时再删）；都没给只显示
export const Chip = /* @__PURE__ */ defineComponent({
  name: "SnChip", props: { modelValue: { type: Boolean, default: undefined }, selected: { type: Boolean, default: undefined }, removable: Boolean, removeLabel: String }, emits: ["update:modelValue", "change", "remove"],
  setup(p, { slots, emit }) {
    const el = ref(null);
    return () => {
      const on = p.modelValue ?? p.selected ?? false;
      // 移除按钮读作"移除 雨夜"（和 React 版一样带上标签的字；插槽里只有文字时取得到）
      if (p.removable) { const kids = slots.default?.(), text = (kids || []).map((v) => (typeof v.children === "string" ? v.children : "")).join("").trim();
        return h("span", { ref: el, class: cx("sn-chip", "sn-tag", on && "sn-on") }, [kids, h("button", { type: "button", class: "sn-x", "aria-label": p.removeLabel ?? `${tt("components.remove")} ${text}`.trim(), onClick: () => removeChip(el.value, { keep: true, onRemoved: () => emit("remove") }) }, [icSvg(IC_X, "x")])]); }
      if (p.modelValue !== undefined) return h("button", { type: "button", class: cx("sn-chip", on && "sn-on"), "aria-pressed": String(on), onClick: () => { emit("update:modelValue", !on); emit("change", !on); } }, [icSvg(IC_CHECK, "check"), slots.default?.()]);
      return h("span", { class: cx("sn-chip", on && "sn-on") }, slots.default?.());
    };
  },
});
// 读屏：role="progressbar"、aria-valuenow（百分数），label 是读出来的名字；完整支持 active 微光、tone 状态色、segments 分段刻度、svg 圆头数值环、height
const progressAria = (value, label) => ({ role: "progressbar", "aria-label": label, ...(value == null ? {} : { "aria-valuenow": Math.round(value * 100), "aria-valuemin": 0, "aria-valuemax": 100 }) });
export const Progress = /* @__PURE__ */ defineComponent({
  name: "SnProgress",
  props: { value: Number, ring: Boolean, svg: Boolean, size: String, tone: String, active: Boolean, segments: Number, showValue: Boolean, height: Number, label: String },
  setup(p) {
    return () => {
      const tn = p.tone && p.tone !== "run" ? `sn-${p.tone}` : "";
      if (p.segments > 0) {
        const val = Math.max(0, Math.min(1, p.value ?? 0)), filled = Math.floor(val * p.segments), partial = val > 0 && val < 1 && filled < p.segments;
        return h("div", { class: cx("sn-pseg", tn), style: p.height ? { "--sn-p-h": `${p.height}px` } : undefined, ...progressAria(val, p.label) },
          Array.from({ length: p.segments }, (_, i) => h("i", { key: i, class: i < filled ? "sn-done" : i === filled && partial ? "sn-cur" : undefined })));
      }
      if (p.ring && (p.svg || p.showValue)) {
        const val = Math.max(0, Math.min(1, p.value ?? 0)), v = String(+val).replace(/^0\./, ".");
        return h("span", { class: cx("sn-pring-svg", p.size && p.size !== "md" && `sn-${p.size}`, tn), style: { "--sn-p": v }, ...progressAria(val, p.label) }, [
          h("svg", { viewBox: "0 0 36 36", "aria-hidden": "true" }, [
            h("circle", { class: "sn-pr-tr", cx: 18, cy: 18, r: 15.9 }),
            h("circle", { class: "sn-pr-fg", cx: 18, cy: 18, r: 15.9, pathLength: 100 }),
          ]),
          p.showValue ? h("b", `${Math.round(val * 100)}%`) : null,
        ]);
      }
      const v = p.value == null ? undefined : String(+p.value).replace(/^0\./, ".");
      if (p.ring) return h("span", { class: cx("sn-pring", p.size === "lg" && "sn-lg"), style: { "--sn-p": v ?? "0" }, ...progressAria(p.value ?? 0, p.label) });
      const st = { ...(v != null ? { "--sn-p": v } : null), ...(p.height ? { "--sn-p-h": `${p.height}px` } : null) };
      return h("div", { class: cx("sn-pbar", p.value == null && "sn-indet", p.active && "sn-active", p.size && p.size !== "md" && `sn-${p.size}`, tn), ...progressAria(p.value, p.label), style: Object.keys(st).length ? st : undefined }, [h("i")]);
    };
  },
});
// 动感几何加载器：8 款纯 CSS/SVG 物理动效（matrix / dots / arc / orbit / bars / grid / radar / morph）
const LD_NODES = {
  matrix: () => Array.from({ length: 9 }, (_, i) => h("i", { key: i })),
  dots: () => Array.from({ length: 3 }, (_, i) => h("i", { key: i })),
  arc: () => [h("svg", { key: "s", viewBox: "0 0 24 24", "aria-hidden": "true" }, [h("circle", { class: "sn-ld-tr", cx: 12, cy: 12, r: 9 }), h("circle", { class: "sn-ld-hd", cx: 12, cy: 12, r: 9 })])],
  orbit: () => [h("i", { key: 0 }), h("i", { key: 1 })],
  bars: () => Array.from({ length: 4 }, (_, i) => h("i", { key: i })),
  grid: () => Array.from({ length: 4 }, (_, i) => h("i", { key: i })),
  radar: () => [h("i", { key: 0 }), h("i", { key: 1 }), h("b", { key: 2 })],
  morph: () => [h("i", { key: 0 })],
};
export const Loader = /* @__PURE__ */ defineComponent({
  name: "SnLoader",
  props: { variant: { type: String, default: "matrix" }, size: { type: [String, Number], default: undefined }, color: String, speed: Number, label: String },
  setup(p) {
    return () => {
      const v = Object.hasOwn(LD_NODES, p.variant) ? p.variant : "matrix";
      const st = { ...(typeof p.size === "number" ? { "--sn-ld-size": `${p.size}px` } : null), ...(p.color ? { "--sn-ld-color": p.color } : null), ...(p.speed != null && p.speed !== 1 ? { "--sn-ld-speed": String(p.speed) } : null) };
      return h("span", { class: cx("sn-ld", `sn-ld-${v}`, typeof p.size === "string" && p.size !== "md" && `sn-${p.size}`), role: "status", style: Object.keys(st).length ? st : undefined }, [...LD_NODES[v](), h("span", { class: "sn-sr" }, p.label ?? tt("components.loading"))]);
    };
  },
});
export const Spinner = /* @__PURE__ */ defineComponent({ name: "SnSpinner", props: { size: String, label: String }, setup: (p) => () => h("span", { class: cx("sn-spinner", p.size === "lg" && "sn-lg"), role: "status", "aria-label": p.label ?? tt("components.loading") }) });
export const Steps = /* @__PURE__ */ defineComponent({
  name: "SnSteps", props: { steps: { type: Array, default: () => [] }, current: { type: Number, default: 0 } },
  setup: (p) => () => h("div", { class: "sn-steps" }, p.steps.flatMap((s, i) => [i ? h("span", { class: cx("sn-ln", i <= p.current && "sn-done") }, [h("i")]) : null, h("span", { class: cx("sn-st", i < p.current && "sn-done", i === p.current && "sn-cur") }, [h("span", { class: "sn-n" }, String(i + 1)), s])]).filter(Boolean)),
});
export const Text = /* @__PURE__ */ defineComponent({
  name: "SnText", props: { as: { type: String, default: "span" }, level: { type: String, default: "body" }, tone: String, num: Boolean, truncate: Boolean },
  setup: (p, { slots }) => () => h(p.as, { class: cx(`sn-t-${p.level === "bodyStrong" ? "body-strong" : p.level}`, p.tone && `sn-c-${p.tone}`, p.num && "sn-num", p.truncate && "sn-truncate") }, slots.default?.()),
});
// Tooltip：给默认插槽里的第一个元素加 data-tip
export const Tooltip = /* @__PURE__ */ defineComponent({ name: "SnTooltip", props: { text: String, kbd: String }, setup: (p, { slots }) => () => { const [v] = slots.default?.() || []; return v ? cloneVNode(v, { "data-tip": p.text, "data-kbd": p.kbd }) : null; } });

// 弹窗：v-model:open 控制开关；关完（Esc、取消、程序关）发 close。取消按钮写 data-cancel、关闭按钮写 data-x：和 Esc 一样先走 guard 再关。
// @submit 接住表单提交（主按钮写 type="submit"，输入框里按回车也算），弹窗不会因为提交自己关。icon：标题左边的图标；footer-class 加在底栏上
let dlgN = 0;
export const Dialog = /* @__PURE__ */ defineComponent({
  name: "SnDialog", props: { open: Boolean, title: String, description: String, icon: String, guard: Function, footerClass: null, draggable: { type: Boolean, default: true } }, emits: ["close", "update:open", "submit"],
  setup(p, { slots, emit }) {
    const el = ref(null), tid = Vue.useId?.() ?? "sn-dlg-" + ++dlgN;
    onMounted(() => {
      const d = el.value; wireDialog(d);
      d.guard = () => (p.guard ? p.guard(() => closeDialog(d)) : closeDialog(d));
      d.addEventListener("close", () => { emit("close"); emit("update:open", false); });
      if (p.open) openDialog(d, document.activeElement);
    });
    watch(() => p.open, (o) => { const d = el.value; if (!d) return; if (o && !d.open) openDialog(d, document.activeElement); else if (!o && d.open) closeDialog(d); });
    return () => h("dialog", { ref: el, class: "sn-dlg", "aria-labelledby": p.title ? tid : undefined, "data-draggable": p.draggable === false ? "false" : undefined }, [h("form", { method: "dialog", onSubmit: (e) => emit("submit", e) }, [
      p.title || p.description || p.icon ? h("div", { class: "sn-hd" }, [p.icon ? h("span", { class: "sn-dlg-icon" }, [h(Icon, { name: p.icon })]) : null, h("div", { style: "flex:1" }, [p.title ? h("h3", { id: tid }, p.title) : null, p.description ? h("div", { class: "sn-sub" }, p.description) : null])]) : null,
      slots.default ? h("div", { class: "sn-bd" }, slots.default()) : null,
      slots.footer ? h("div", { class: ["sn-ft", p.footerClass] }, slots.footer()) : null,
    ])]);
  },
});
export const Drawer = /* @__PURE__ */ defineComponent({
  name: "SnDrawer", props: { open: Boolean, title: String }, emits: ["close", "update:open"],
  setup(p, { slots, emit }) {
    const el = ref(null), tid = Vue.useId?.() ?? "sn-drw-" + ++dlgN; let layer = null; // 标题的 id：抽屉 aria-labelledby 指向它
    watch(() => p.open, (o) => { if (o && !layer) layer = openDrawer(el.value, { trigger: document.activeElement, onClose: () => { layer = null; emit("close"); emit("update:open", false); } }); else if (!o && layer) { layer.close(true); layer = null; } });
    return () => h("aside", { ref: el, class: "sn-drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": p.title ? tid : undefined, tabindex: "-1" }, [
      h("div", { class: "sn-hd" }, [h("h3", { id: tid }, p.title), h("button", { type: "button", class: "sn-btn sn-ghost sn-sm sn-ibtn", "data-x": "", "aria-label": tt("components.close"), "data-tip": tt("components.close"), "data-kbd": "Esc" }, [icSvg(IC_X, "x", 16)])]),
      h("div", { class: "sn-bd" }, slots.default?.()), slots.footer ? h("div", { class: "sn-ft" }, slots.footer()) : null,
    ]);
  },
});

// v-enhance：照设计稿写好的一段标记（菜单按钮、浮层触发器、折叠面板……）放进这个元素，挂上时接上交互、卸载时撤掉（和 <sn-enhance> 一样，不用配置自定义元素）
//   <script setup> import { vEnhance } from "satin-ui/vue"; </script>   <div v-enhance>…标记…</div>
export const vEnhance = {
  mounted(el) { const unsetup = setup(), off = S.enhance(el); el._snEnhance = () => { off(); unsetup(); }; },
  beforeUnmount(el) { const f = el._snEnhance; el._snEnhance = null; f?.(); },
};

// 局部主题作用域：<SnThemeScope mode="dark" accent="blue">…</SnThemeScope>
export const ThemeScope = /* @__PURE__ */ defineComponent({
  name: "SnThemeScope",
  props: { as: { type: String, default: "div" }, mode: String, accent: String, custom: String, font: String, scale: String, radius: String, line: String, motion: String, success: String, warning: String, danger: String },
  setup(p, { slots }) {
    const el = ref(null); let off = null;
    const sync = () => { off?.(); if (el.value) off = applyTheme(el.value, { mode: p.mode, accent: p.accent, custom: p.custom, font: p.font, scale: p.scale, radius: p.radius, line: p.line, motion: p.motion, success: p.success, warning: p.warning, danger: p.danger }); };
    onMounted(sync);
    watch(() => [p.mode, p.accent, p.custom, p.font, p.scale, p.radius, p.line, p.motion, p.success, p.warning, p.danger], sync);
    onBeforeUnmount(() => { off?.(); off = null; });
    return () => h(p.as, { ref: el }, slots.default?.());
  },
});

// 响应式主题 Composable：读写深浅模式与主色/圆角/线条/动效令牌
export function useTheme() {
  const theme = ref(typeof document === "undefined" ? { ...THEME_DEFAULTS } : getTheme());
  const mode = ref(typeof document === "undefined" ? "auto" : getMode());
  let unsub = null;
  onMounted(() => { unsub = onThemeChange((t) => { theme.value = t; }); });
  onBeforeUnmount(() => { unsub?.(); unsub = null; });
  return {
    mode,
    theme,
    setMode(m, opts) { setMode(m, opts); mode.value = m; },
    setTheme(patch) { setThemeChoice(patch); theme.value = getTheme(); },
    resetTheme() { resetThemeChoice(); theme.value = getTheme(); },
  };
}

// 响应式多语言 Composable：读取当前语言并支持切换（setLocale("en", enPack) / setLocale("zh-CN")）
export function useLocale() {
  const locale = ref(getI18nLocale());
  let unsub = null;
  onMounted(() => { unsub = onLocaleChange((l) => { locale.value = l; }); });
  onBeforeUnmount(() => { unsub?.(); unsub = null; });
  return {
    locale,
    setLocale(nameOrMessages, pack) { setI18nLocale(nameOrMessages, pack); locale.value = getI18nLocale(); },
  };
}

export const toast = (o) => (setup(), S.toast(o));
export const notify = (o) => (setup(), S.notify(o));

// 仅做页面级行为（setup）、全局主题与多语言初始化——不注册任何全局组件，彻底保留 Tree-Shaking：
//   import { createSatin, Button, Segmented } from "satin-ui/vue";
//   app.use(createSatin({ mode: "auto", locale: "zh-CN", theme: { accent: "ink" } }));
function applyPluginOptions(app, options) {
  const off = setup(); app.onUnmount?.(off); // setup() 在服务端直接返回，什么都不做
  if (!options) return;
  const { mode, theme, persist = false, locale, messages } = options;
  if (locale) setI18nLocale(locale, messages);
  else if (messages) setI18nLocale(messages);
  if (typeof document !== "undefined") {
    if (mode) setMode(mode, { animate: false, persist });
    if (theme) { if (persist) setThemeChoice(theme); else paintTheme(document.documentElement, { ...THEME_DEFAULTS, ...getTheme(), ...theme }); }
  }
}
export function createSatin(options) {
  return {
    install(app, extra) {
      const merged = options && extra ? { ...options, ...extra } : (extra ?? options);
      applyPluginOptions(app, merged);
      if (merged?.components) {
        for (const [k, c] of Object.entries(merged.components)) app.component(k.startsWith("Sn") ? k : "Sn" + k, c);
      }
      if (merged?.directives) {
        for (const [k, d] of Object.entries(merged.directives)) app.directive(k, d);
      }
    },
  };
}

// 全局全量注册：app.use(Satin, { mode, theme, persist, locale, messages }) 以后模板直接写 <SnButton>、<SnLoader>、<SnThemeScope>……、v-enhance
// 按需打包请改用 createSatin() + 具名导入（或配合 satin-ui/vite 的 satinResolver 自动按需导入）
export default {
  install(app, options) {
    for (const [k, c] of Object.entries({ ...X, Table, Password, Email, Avatar, EmptyArt, Segmented, Slider, Select, Otp, Tabs, Pager, Collapse, TagInput, Stepper, Search, CountInput, LongText, Composer, NumberFlow, DatePicker, Icon, Button, Input, Field, Checkbox, Radio, Switch, Chip, Progress, Loader, Spinner, Steps, Text, Tooltip, Dialog, Drawer, ThemeScope })) app.component("Sn" + k, c);
    app.directive("enhance", vEnhance);
    applyPluginOptions(app, options);
  },
};
// 菜单、右键菜单、Popover、命令面板、看图、上传、侧栏、无限列表、滚动区域、视频、音频（vue/extra.js）
export * from "./extra.js";
