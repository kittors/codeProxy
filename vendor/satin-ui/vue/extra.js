// satin-ui/vue 主入口的第二部分：菜单、右键菜单、Popover、命令面板、看图、上传、侧栏、无限列表、滚动区域、视频、音频。
// 写法和主入口其余组件一样：v-model 绑值（v-model:open、v-model:index 这类具名的也有）、@事件、模板 ref 的 instance 是 Satin 实例；
// 页面级行为（浮层栈、Esc、点外面关）第一次挂载时自动装上。
// · 浮在页面上的东西（菜单、Popover 面板）挂载以后才 Teleport 到 <body>：服务端不输出，关着的时候本来也看不见；
//   放在 <body> 下，祖先元素有 transform、overflow: hidden 也不会把它裁掉或定歪
// · 触发器写在默认插槽里（一个按钮、一张卡片）：<SnMenu :items="items" @select="run"><SnButton>更多</SnButton></SnMenu>
import { defineComponent, h, ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, cloneVNode, Teleport, Fragment, Comment, Text, render as vueRender, getCurrentInstance } from "vue";
import * as S from "../src/components.js";
import { setup } from "../src/setup.js";
import { openMenu, closeMenu, menuOpenFor, openPopover, popoverOf, mountCmdk } from "../src/overlay/overlay.js";
import { openLightbox } from "../src/media/lightbox.js";
import { track } from "../src/core/lifecycle.js";
import { menuHTML, findItem, uploadHTML, acceptRe, sidebarHTML } from "../src/core/markup.js";
import { wrap, cx } from "./wrap.js";
import { ICONS } from "../src/foundation/icons.js";
import { scoped } from "../src/foundation/i18n.js";
import I18N_COMPONENTS from "../src/foundation/locales/zh-CN/components.js";
const tt = /* @__PURE__ */ scoped(I18N_COMPONENTS);
const Ic = (name) => h("svg", { class: "sn-ic", "data-icon": name, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", innerHTML: ICONS[name] || "" });
let pcN = 0;

// 挂载时 setup()（引用计数），卸载时撤掉
function useSetup() { let un = null; onMounted(() => { un = setup(); }); onBeforeUnmount(() => { un?.(); un = null; }); }
function useMounted() { const m = ref(false); onMounted(() => { m.value = true; }); return m; }
// 插槽里第一个真正的元素 / 组件（跳过注释、空白文字）
const firstNode = (nodes = []) => { for (const n of nodes) { if (n.type === Comment || (n.type === Text && !String(n.children).trim())) continue; if (n.type === Fragment) { const r = firstNode(n.children); if (r) return r; continue; } return n; } return null; };
// 模板 ref 拿到的可能是组件实例（<SnButton>）：取它的根元素
const elOf = (r) => r?.$el ?? r ?? null;
let seq = 0;
const nextId = () => "sn-vm-" + ++seq;

// ———— 菜单、右键菜单 ————
// items：[{ key, label, icon, kbd, danger, disabled, checked, children }]；分隔线 { type: "divider" }；分组标题 { type: "group", label }。@select(key, item)
function useFloatMenu(p) {
  const id = nextId(), box = ref(null), mounted = useMounted();
  onBeforeUnmount(() => { if (box.value?.firstElementChild?.classList.contains("sn-open")) closeMenu(false); });
  const node = () => (mounted.value ? h(Teleport, { to: "body" }, h("div", { ref: box, style: "display: contents", innerHTML: menuHTML(p.items, id, p.label, p.surface) })) : null);
  return [box, node];
}
const menuProps = { items: { type: Array, default: () => [] }, label: String, bound: { type: null, default: undefined }, surface: String };
// 菜单按钮：默认插槽是触发器（点了贴着它弹出，↓ 键也能打开；键盘打开时先高亮第一项）
export const Menu = /* @__PURE__ */ defineComponent({
  name: "SnMenu", inheritAttrs: false,
  props: { ...menuProps, align: String },
  emits: ["select"],
  setup(p, { slots, emit }) {
    useSetup();
    const [box, menu] = useFloatMenu(p), trig = ref(null);
    const open = (keyboard) => { const t = elOf(trig.value); openMenu(box.value.firstElementChild, { trigger: t, anchor: t, keyboard, align: p.align, bound: elOf(p.bound) ?? undefined, surface: p.surface, onSelect: ({ item }) => emit("select", item.dataset.key, findItem(p.items, item.dataset.key)) }); };
    return () => {
      const first = firstNode(slots.default?.());
      const trigger = first && cloneVNode(first, {
        ref: trig, "aria-haspopup": "menu", "aria-expanded": "false",
        onClick: (e) => { if (e.defaultPrevented) return; const t = elOf(trig.value); if (menuOpenFor(t)) closeMenu(false); else open(e.detail === 0); },
        onKeydown: (e) => { if (e.defaultPrevented) return; if (e.key === "ArrowDown" && !menuOpenFor(elOf(trig.value))) { e.preventDefault(); open(true); } },
      }, true);
      return [trigger, menu()];
    };
  },
});
// 右键菜单：默认插槽是右键区域（右键、触屏长按 500ms、Shift+F10 / 菜单键在指针处弹出）。bound：菜单只能待在这个容器里
export const ContextMenu = /* @__PURE__ */ defineComponent({
  name: "SnContextMenu", inheritAttrs: false,
  props: menuProps,
  emits: ["select"],
  setup(p, { slots, emit }) {
    useSetup();
    const [box, menu] = useFloatMenu(p), zone = ref(null); let lp = null;
    const open = (x, y, keyboard) => { const z = elOf(zone.value); openMenu(box.value.firstElementChild, { trigger: z, x, y, keyboard, bound: elOf(p.bound) ?? undefined, surface: p.surface, onSelect: ({ item }) => emit("select", item.dataset.key, findItem(p.items, item.dataset.key)) }); z.classList.add("sn-active"); };
    const cancel = (e) => { if (!lp || lp.fired) return; if (e.type === "pointermove" && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) < 8) return; clearTimeout(lp.t); lp = null; };
    onBeforeUnmount(() => clearTimeout(lp?.t));
    return () => {
      const first = firstNode(slots.default?.());
      const z = first && cloneVNode(first, {
        ref: zone, tabindex: first.props?.tabindex ?? "0",
        onContextmenu: (e) => { e.preventDefault(); if (lp?.fired) { lp = null; return; } open(e.clientX, e.clientY); },
        onPointerdown: (e) => { if (e.pointerType !== "touch") return; clearTimeout(lp?.t); const x = e.clientX, y = e.clientY; lp = { x, y, fired: false, t: setTimeout(() => { lp.fired = true; open(x, y); }, 500) }; },
        onPointermove: cancel, onPointerup: cancel, onPointercancel: cancel,
        onKeydown: (e) => { if (e.defaultPrevented) return; if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") { e.preventDefault(); const r = elOf(zone.value).getBoundingClientRect(); open(r.left + 24, r.top + 24, true); } },
      }, true);
      return [z, menu()];
    };
  },
});

// ———— Popover：默认插槽是触发按钮，#content 插槽是面板内容；v-model:open（不绑就自己管开关） ————
// Esc、点外面、焦点离开面板都会关上
export const Popover = /* @__PURE__ */ defineComponent({
  name: "SnPopover", inheritAttrs: false,
  props: { title: String, align: { type: String, default: "start" }, open: { type: Boolean, default: undefined }, defaultOpen: Boolean, label: String },
  emits: ["update:open"],
  setup(p, { slots, emit, attrs }) {
    useSetup();
    const pop = ref(null), trig = ref(null), mounted = useMounted(), inner = ref(p.defaultOpen);
    const isOpen = computed(() => p.open ?? inner.value);
    const set = (v) => { if (p.open === undefined) inner.value = v; emit("update:open", v); };
    watch([isOpen, mounted], ([o, m]) => {
      if (!m) return;
      const el = pop.value, l = popoverOf(el);
      if (o && !l) openPopover(el, elOf(trig.value), { align: p.align, onClose: () => { if (!el._snQuiet) set(false); } });
      else if (!o && l) { el._snQuiet = true; l.close(false); el._snQuiet = false; }
    }, { flush: "post" });
    onBeforeUnmount(() => { const el = pop.value, l = el && popoverOf(el); if (l) { el._snQuiet = true; l.close(false); } });
    return () => {
      const first = firstNode(slots.default?.());
      const trigger = first && cloneVNode(first, { ref: trig, "aria-haspopup": "dialog", "aria-expanded": "false", onClick: (e) => { if (!e.defaultPrevented) set(!popoverOf(pop.value)); } }, true);
      const panel = mounted.value ? h(Teleport, { to: "body" }, h("div", { ...attrs, ref: pop, class: cx("sn-pop sn-popover", attrs.class), role: "dialog", "aria-label": p.label ?? p.title }, [p.title ? h("h4", p.title) : null, slots.content?.()])) : null;
      return [trigger, panel];
    };
  },
});

// ———— 气泡确认：默认插槽是触发按钮。只给单条、属于自己、不能撤销的操作；@confirm / @cancel；打开时焦点先落在"取消"上 ————
export const Popconfirm = /* @__PURE__ */ defineComponent({
  name: "SnPopconfirm",
  props: { title: String, description: String, confirmText: String, cancelText: String, danger: { type: Boolean, default: true }, align: { type: String, default: "end" } },
  emits: ["confirm", "cancel"],
  setup(p, { slots, emit }) {
    useSetup();
    const pop = ref(null), trig = ref(null), mounted = useMounted(), uid = "sn-pc-" + ++pcN;
    const close = (refocus) => popoverOf(pop.value)?.close(refocus);
    onBeforeUnmount(() => { const el = pop.value, l = el && popoverOf(el); if (l) l.close(false); });
    return () => {
      const first = firstNode(slots.default?.());
      const trigger = first && cloneVNode(first, { ref: trig, "aria-haspopup": "dialog", "aria-expanded": "false", onClick: (e) => { if (e.defaultPrevented) return; const l = popoverOf(pop.value); l ? l.close(false) : openPopover(pop.value, elOf(trig.value), { align: p.align }); } }, true);
      const panel = mounted.value ? h(Teleport, { to: "body" }, h("div", { ref: pop, class: "sn-pop sn-popconfirm", role: "alertdialog", "aria-labelledby": uid + "-q", "aria-describedby": p.description ? uid + "-d" : undefined }, [
        h("div", { class: "sn-q" }, [Ic("triangle-alert"), h("div", [h("div", { id: uid + "-q" }, p.title), p.description ? h("div", { class: "sn-d", id: uid + "-d" }, p.description) : null])]),
        h("div", { class: "sn-acts" }, [
          // data-no：打开时焦点先落在它上面（和设计稿的标记一样）
          h("button", { type: "button", class: "sn-btn sn-ghost sn-sm", "data-no": "", onClick: () => { close(true); emit("cancel"); } }, p.cancelText ?? tt("components.cancel")),
          h("button", { type: "button", class: cx("sn-btn", p.danger ? "sn-danger" : "sn-primary", "sn-sm"), "data-yes": "", onClick: () => { close(false); emit("confirm"); } }, p.confirmText ?? tt("components.confirm")),
        ]),
      ])) : null;
      return [trigger, panel];
    };
  },
});

// ———— 命令面板：⌘K 打开（:hotkey="false" 关掉快捷键），groups = [{ name, items: [{ name, icon, sub, key, keys }] }]，选中一条 @run(item) ————
// v-model:open（Esc、点外面、选中以后关上也会回写 false）；模板 ref 也能调 open() / close() / toggle()。面板只有一个，渲染在 <body> 末尾
export const CommandPalette = /* @__PURE__ */ defineComponent({
  name: "SnCommandPalette",
  props: { groups: { type: Array, default: () => [] }, placeholder: String, hotkey: { type: Boolean, default: true }, enterLabel: String, empty: Function, open: { type: Boolean, default: undefined } },
  emits: ["run", "empty", "update:open"],
  setup(p, { emit, expose }) {
    let api = null, off = null;
    // 父组件有没有听 @empty（声明过的事件不在 attrs 里，从 vnode 上看）
    const ins = getCurrentInstance(), hasEmpty = () => !!ins?.vnode.props?.onEmpty;
    const sig = computed(() => JSON.stringify([p.groups.map((g) => [g.name, g.items.map((i) => [i.name, i.icon, i.sub, i.key, i.keys])]), p.placeholder, p.hotkey, p.enterLabel, !!p.empty]));
    const mount = () => {
      const unsetup = setup();
      const had = !!document.getElementById("cmdk-panel"), before = had ? new Set(document.getElementById("cmdkList").children) : null;
      const [a, dispose] = track(() => mountCmdk(p.groups, { onRun: (it) => emit("run", it), placeholder: p.placeholder, hotkey: p.hotkey, enterLabel: p.enterLabel, empty: p.empty ? (q) => p.empty(q) : undefined, onEmpty: hasEmpty() ? (q) => emit("empty", q) : undefined }));
      const panel = document.getElementById("cmdk-panel"), scrim = document.getElementById("cmdkScrim"), list = document.getElementById("cmdkList");
      const added = [...list.children].filter((c) => !before?.has(c));
      let was = panel.classList.contains("sn-open");
      const mo = new MutationObserver(() => { const now = panel.classList.contains("sn-open"); if (now !== was) { was = now; emit("update:open", now); } });
      mo.observe(panel, { attributes: true, attributeFilter: ["class"] });
      api = a;
      off = () => { mo.disconnect(); if (panel.classList.contains("sn-open")) a.close(); dispose(); for (const c of added) c.remove(); if (!had) { panel.remove(); scrim?.remove(); } api = null; unsetup(); };
    };
    const sync = () => { if (!api || p.open === undefined) return; const now = document.getElementById("cmdk-panel")?.classList.contains("sn-open"); if (p.open && !now) api.open(); else if (!p.open && now) api.close(); };
    onMounted(() => { mount(); sync(); });
    watch(sig, () => { off?.(); mount(); sync(); });
    watch(() => p.open, sync);
    onBeforeUnmount(() => { off?.(); off = null; });
    expose({ open: () => api?.open(), close: () => api?.close(), toggle: () => api?.toggle() });
    return () => null;
  },
});

// ———— 看图：v-model:index（数字就打开到那一张，关上时回写 null） ————
// items：[{ src, ratio, caption, video, bg }]；thumbOf(i) 返回第 i 张的缩略图元素（打开、关上时从缩略图放大、缩回去）
export const Lightbox = /* @__PURE__ */ defineComponent({
  name: "SnLightbox",
  props: { items: { type: Array, default: () => [] }, index: { type: Number, default: null }, thumbOf: Function, enabled: Function },
  emits: ["close", "update:index"],
  setup(p, { emit }) {
    useSetup();
    let lb = null;
    const sync = (i) => {
      if (i == null || i < 0) { const x = lb; lb = null; x?.close(); return; }
      if (lb) return;
      lb = openLightbox(p.items, i, { thumbOf: (k) => elOf(p.thumbOf?.(k)) ?? null, enabled: (k) => p.enabled?.(k) ?? true, onClose: () => { lb = null; emit("close"); emit("update:index", null); } });
    };
    onMounted(() => sync(p.index));
    watch(() => p.index, sync);
    onBeforeUnmount(() => { const x = lb; lb = null; x?.close(); });
    return () => null;
  },
});

// ———— 上传：拖放区 + 文件列表（各自显示进度，能取消、重试） ————
// accept：".txt,.docx" 这种扩展名列表或正则；max-size：字节；upload(file, progress) 返回 Promise（不给就是演示用的模拟上传）
export const Upload = /* @__PURE__ */ defineComponent({
  name: "SnUpload", inheritAttrs: false,
  props: { accept: { type: null, default: undefined }, maxSize: Number, upload: Function, title: String, pick: String, hint: String, label: String, multiple: { type: Boolean, default: true }, badType: String, tooBig: String },
  setup(p, { attrs, expose }) {
    const host = ref(null), inst = shallowRef(null);
    const html = uploadHTML({ title: p.title, pick: p.pick, hint: p.hint, label: p.label, multiple: p.multiple, accept: p.accept });
    let unsetup = null;
    onMounted(() => {
      unsetup = setup(); const drop = host.value.firstElementChild;
      inst.value = S.createUpload(drop, { list: drop.nextElementSibling, accept: acceptRe(p.accept), maxSize: p.maxSize, badType: p.badType, tooBig: p.tooBig, upload: p.upload ? (f, pr) => p.upload(f, pr) : undefined });
    });
    onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; unsetup?.(); });
    expose({ instance: inst });
    return () => h("div", { ...attrs, ref: host, class: cx("sn-host", attrs.class), style: ["display: contents", attrs.style], innerHTML: html });
  },
});

// ———— 侧栏布局：左边侧栏（选中切换、收起成图标栏 ⌘\），默认插槽是右边主区 ————
// items / footer：[{ key, label, icon, badge, href }]，分组标题 { type: "group", label }；v-model 绑选中的 key；@navigate(key, item)
// fx：选中切换的动效 "slide"（底色滑过去）| "bar"（指示条）| "fade"（原地淡入）| "text"（仅文字）
export const Sidebar = /* @__PURE__ */ defineComponent({
  name: "SnSidebar",
  props: { items: { type: Array, default: () => [] }, footer: { type: Array, default: () => [] }, modelValue: { type: null, default: undefined }, title: String, logo: { type: Boolean, default: true }, collapsible: { type: Boolean, default: true }, collapseBelow: Number, fx: { type: String, default: "slide" } },
  emits: ["navigate", "update:modelValue"],
  setup(p, { slots, emit, expose }) {
    const app = ref(null), inst = shallowRef(null);
    // 侧栏的标记交给库管（选中、收起都是库改的）；条目变了换一份新的
    const html = computed(() => sidebarHTML({ items: p.items, footer: p.footer, value: p.modelValue, title: p.title, logo: p.logo, collapsible: p.collapsible }));
    const sig = computed(() => JSON.stringify([p.items, p.footer, p.title, p.logo, p.collapsible]));
    const frozen = ref(html.value);
    let unsetup = null;
    const mount = () => { inst.value = S.createSidebar(app.value, { collapseBelow: p.collapseBelow, onNavigate: (a) => { const k = a.dataset.key; emit("navigate", k, findItem([...p.items, ...p.footer], k)); emit("update:modelValue", k); } }); };
    onMounted(() => { unsetup = setup(); mount(); });
    watch(sig, () => { inst.value?.destroy(); frozen.value = html.value; }, { flush: "pre" });
    watch(frozen, () => mount(), { flush: "post" });
    // v-model 变了：选中对应的那一项（库按 fx 播切换动效）
    watch(() => p.modelValue, (v) => {
      if (v === undefined || !inst.value) return;
      const a = [...app.value.querySelectorAll(".sn-side a[data-key]")].find((x) => x.dataset.key === String(v));
      if (a && !a.classList.contains("sn-on")) inst.value.select(a);
    }, { flush: "post" });
    onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; unsetup?.(); });
    expose({ instance: inst });
    return () => h("div", { ref: app, class: "sn-app", "data-navfx": p.fx }, [h("aside", { class: "sn-side", innerHTML: frozen.value }), h("main", { class: "sn-app-main" }, slots.default?.())]);
  },
});

// ———— 无限列表：滚到底自动加载下一页，只渲染看得见的行（固定行高） ————
// load-page(offset, size) 返回这一页的数据；#row="{ item, index }" 插槽画一行（行元素会复用）；也可以给 render-row(row, item, index) 直接改 DOM
export const InfiniteList = /* @__PURE__ */ defineComponent({
  name: "SnInfiniteList", inheritAttrs: false,
  props: { loadPage: { type: Function, required: true }, renderRow: Function, rowHeight: { type: Number, default: 56 }, total: Number, pageSize: Number },
  emits: ["count"],
  setup(p, { slots, emit, attrs, expose }) {
    const vl = ref(null), inst = shallowRef(null), boxes = new Set(), app = getCurrentInstance()?.appContext;
    // 插槽在这个小组件的渲染函数里调（不在渲染函数外面调插槽）
    const Row = { props: ["item", "index"], setup: (rp) => () => slots.row?.({ item: rp.item, index: rp.index }) };
    let unsetup = null;
    onMounted(() => {
      unsetup = setup();
      inst.value = S.createInfiniteList(vl.value, {
        rowHeight: p.rowHeight, total: p.total, pageSize: p.pageSize,
        loadPage: (o, n) => p.loadPage(o, n), onCount: (n) => emit("count", n),
        renderRow: (row, item, i) => {
          if (p.renderRow) return p.renderRow(row, item, i);
          // 行里放一个自己的容器渲染插槽：库把这一行改成骨架、错误行时清空的只是这个容器
          let c = row._snc; if (!c || c.parentNode !== row) { c = document.createElement("div"); c.style.display = "contents"; row.append(c); row._snc = c; boxes.add(c); }
          const v = h(Row, { item, index: i }); v.appContext = app; vueRender(v, c);
        },
      });
    });
    onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; for (const c of boxes) vueRender(null, c); boxes.clear(); unsetup?.(); });
    expose({ instance: inst });
    return () => h("div", { ...attrs, ref: vl, class: cx("sn-vl", attrs.class) }, [h("div", { class: "sn-vl-space" })]);
  },
});

// ———— 滚动区域：内容超出时两头渐隐、细滚动条（滚动或悬停时出现） ————
// 写法和普通 div 一样，限高写在 style 上；as 换成别的标签。fade、bar、size、bar-size、bar-inset、overscroll、wheel 见 createScrollArea
const SA_KEYS = ["fade", "size", "bar", "barSize", "barInset", "overscroll", "wheel"];
export const ScrollArea = /* @__PURE__ */ defineComponent({
  name: "SnScrollArea", inheritAttrs: false,
  props: { as: { type: String, default: "div" }, fade: String, size: Number, bar: String, barSize: Number, barInset: Number, overscroll: String, wheel: String },
  setup(p, { slots, attrs, expose }) {
    const vp = ref(null), inst = shallowRef(null);
    const opts = () => { const o = {}; for (const k of SA_KEYS) if (p[k] !== undefined) o[k] = p[k]; return o; };
    let unsetup = null;
    onMounted(() => { unsetup = setup(); inst.value = S.createScrollArea(vp.value, opts()); });
    watch(() => JSON.stringify(opts()), () => inst.value?.set(opts()));
    onBeforeUnmount(() => { inst.value?.destroy(); inst.value = null; unsetup?.(); });
    expose({ instance: inst });
    // 库会在视口外面包一层（.sn-sa，放滚动条和渐隐）：外面再套一层 display: contents，Vue 管的父子关系不受影响
    return () => h("div", { style: "display: contents" }, [h(p.as, { ...attrs, ref: vp, class: cx("sn-sa-vp", attrs.class) }, slots.default?.())]);
  },
});

// ———— 视频、音频：src 变了换一个新的播放器；模板 ref 的 instance：play() / pause() / toggle()、video / audio 元素 ————
const PlayerBase = /* @__PURE__ */ wrap(S.createPlayer, { name: "SnPlayerInstance", props: ["src", "poster", "label"], events: ["error"], modelEvent: null });
const AudioBase = /* @__PURE__ */ wrap(S.createAudio, { name: "SnAudioInstance", props: ["src", "title", "sub", "wave"], events: ["error"], modelEvent: null });
const keyed = (Base, name, keys) => defineComponent({
  name, inheritAttrs: false,
  props: Object.fromEntries(keys.map((k) => [k, { type: null, default: undefined }])),
  emits: ["error"],
  setup(p, { attrs, emit, expose }) {
    const inner = ref(null);
    expose({ instance: computed(() => inner.value?.instance ?? null) });
    return () => h(Base, { ...attrs, ...p, ref: inner, key: p.src ?? "", onError: (e) => emit("error", e) });
  },
});
export const Player = /* @__PURE__ */ keyed(PlayerBase, "SnPlayer", ["src", "poster", "label"]);
export const AudioPlayer = /* @__PURE__ */ keyed(AudioBase, "SnAudioPlayer", ["src", "title", "sub", "wave"]);
