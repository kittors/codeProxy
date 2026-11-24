"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react 主入口的第二部分：菜单、右键菜单、Popover、命令面板、看图、上传、侧栏、无限列表、滚动区域、视频、音频。
// 写法和主入口其余组件一样：属性受控、回调 onXxx、ref 拿到 Satin 实例；页面级行为（浮层栈、Esc、点外面关）第一次挂载时自动装上。
// · 浮在页面上的东西（菜单、Popover 面板）挂载以后才渲染到 <body>（createPortal）：服务端不输出，关着的时候本来也看不见；
//   放在 <body> 下，祖先元素有 transform、overflow: hidden 也不会把它裁掉或定歪
// · 触发器就是子元素（一个按钮、一张卡片）：<Menu items={…}><Button>更多</Button></Menu>，子元素自己的 ref、onClick 照常生效
import { createElement as h, Fragment, forwardRef, useRef, useState, useId, useImperativeHandle, cloneElement, Children, version } from "react";
import { createPortal, flushSync } from "react-dom";
import * as S from "../src/components.js";
import { setup } from "../src/setup.js";
import { openMenu, closeMenu, menuOpenFor, openPopover, popoverOf, mountCmdk } from "../src/overlay.js";
import { openLightbox } from "../src/lightbox.js";
import { track } from "../src/lifecycle.js";
import { menuHTML, findItem, uploadHTML, acceptRe, sidebarHTML } from "../src/markup.js";
import { ICONS } from "../src/icons.js";
import { scoped } from "../src/i18n.js";
import I18N_COMPONENTS from "../src/locales/zh-CN/components.js";
const tt = /* @__PURE__ */ scoped(I18N_COMPONENTS);
// 图标（和主入口的 <Icon> 同一份标记）：这里直接画，免得和主入口互相导入
const Ic = (name) => h("svg", { className: "sn-ic", "data-icon": name, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", dangerouslySetInnerHTML: { __html: ICONS[name] || "" } });
import { wrap, useIso, cx } from "./wrap.js";

const R19 = +version.split(".")[0] >= 19;
// 子元素原来的 ref（React 19 起 ref 是普通属性，18 在 element.ref 上）
const refOf = (el) => (R19 ? el.props.ref : el.ref);
const setRef = (r, v) => { if (typeof r === "function") r(v); else if (r) r.current = v; };
// useId 给的是 «r0» / :r0: 这种，库里按 "#" + id 查子菜单：只留字母数字
const domId = (id) => "sn-" + id.replace(/[^a-zA-Z0-9_-]/g, "");
// 挂载时 setup()（引用计数），卸载时撤掉
const useSetup = () => useIso(() => setup(), []);
// 挂载以后才为 true：服务端和水合的第一帧不渲染浮层（createPortal 只能在浏览器里用）
function useMounted() { const [m, set] = useState(false); useIso(() => set(true), []); return m; }
// 回调总是拿最新的 props（不用因为回调换了重新挂）
function useLatest(v) { const r = useRef(v); r.current = v; return r; }

// ———— 菜单、右键菜单 ————
// items：[{ key, label, icon, kbd, danger, disabled, checked, children }]；分隔线 { type: "divider" }；分组标题 { type: "group", label }（标记见 menuHTML）
// 菜单本体（根菜单 + 各层子菜单）渲染到 <body>
function useFloatMenu(items, label, surface) {
  const uid = domId(useId()), box = useRef(null), mounted = useMounted();
  const html = menuHTML(items, uid, label, surface);
  const portal = mounted ? createPortal(h("div", { ref: box, style: { display: "contents" }, dangerouslySetInnerHTML: { __html: html } }), document.body) : null;
  // 卸载时菜单正开着：先关上（库里还记着这套菜单）
  useIso(() => () => { const root = box.current?.firstElementChild; if (root?.classList.contains("sn-open")) closeMenu(false); }, []);
  return [box, portal];
}
const selectFrom = (latest) => ({ item }) => { const k = item.dataset.key; latest.current.onSelect?.(k, findItem(latest.current.items, k)); };

// 菜单按钮：子元素是触发器（点了贴着它弹出，↓ 键也能打开；键盘打开时先高亮第一项）。onSelect(key, item)
export function Menu({ items = [], onSelect, align, label, bound, surface, children }) {
  useSetup();
  const [box, portal] = useFloatMenu(items, label, surface), trig = useRef(null), latest = useLatest({ items, onSelect, align, bound, surface });
  const open = (keyboard) => openMenu(box.current.firstElementChild, { trigger: trig.current, anchor: trig.current, keyboard, align: latest.current.align, bound: latest.current.bound?.current ?? latest.current.bound, surface: latest.current.surface, onSelect: selectFrom(latest) });
  const child = Children.only(children), p = child.props;
  const trigger = cloneElement(child, {
    ref: (n) => { trig.current = n; setRef(refOf(child), n); },
    "aria-haspopup": "menu", "aria-expanded": false,
    onClick: (e) => { p.onClick?.(e); if (e.defaultPrevented) return; if (menuOpenFor(trig.current)) closeMenu(false); else open(e.detail === 0); },
    onKeyDown: (e) => { p.onKeyDown?.(e); if (e.defaultPrevented) return; if (e.key === "ArrowDown" && !menuOpenFor(trig.current)) { e.preventDefault(); open(true); } },
  });
  return h(Fragment, null, trigger, portal);
}

// 右键菜单：子元素是右键区域（右键、触屏长按 500ms、Shift+F10 / 菜单键在指针处弹出）。bound：菜单只能待在这个容器里（ref 或元素）
export function ContextMenu({ items = [], onSelect, label, bound, surface, children }) {
  useSetup();
  const [box, portal] = useFloatMenu(items, label, surface), zone = useRef(null), lp = useRef(null), latest = useLatest({ items, onSelect, bound, surface });
  const open = (x, y, keyboard) => {
    openMenu(box.current.firstElementChild, { trigger: zone.current, x, y, keyboard, bound: latest.current.bound?.current ?? latest.current.bound, surface: latest.current.surface, onSelect: selectFrom(latest) });
    zone.current.classList.add("sn-active");
  };
  const cancel = (e) => { const l = lp.current; if (!l || l.fired) return; if (e.type === "pointermove" && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 8) return; clearTimeout(l.t); lp.current = null; };
  useIso(() => () => clearTimeout(lp.current?.t), []);
  const child = Children.only(children), p = child.props;
  const zoneEl = cloneElement(child, {
    ref: (n) => { zone.current = n; setRef(refOf(child), n); },
    tabIndex: p.tabIndex ?? 0,
    onContextMenu: (e) => { p.onContextMenu?.(e); e.preventDefault(); if (lp.current?.fired) { lp.current = null; return; } open(e.clientX, e.clientY); },
    onPointerDown: (e) => {
      p.onPointerDown?.(e); if (e.pointerType !== "touch") return; clearTimeout(lp.current?.t);
      const x = e.clientX, y = e.clientY; lp.current = { x, y, fired: false, t: setTimeout(() => { lp.current.fired = true; open(x, y); }, 500) };
    },
    onPointerMove: (e) => { p.onPointerMove?.(e); cancel(e); },
    onPointerUp: (e) => { p.onPointerUp?.(e); cancel(e); },
    onPointerCancel: (e) => { p.onPointerCancel?.(e); cancel(e); },
    onKeyDown: (e) => {
      p.onKeyDown?.(e); if (e.defaultPrevented) return;
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") { e.preventDefault(); const r = zone.current.getBoundingClientRect(); open(r.left + 24, r.top + 24, true); }
    },
  });
  return h(Fragment, null, zoneEl, portal);
}

// ———— Popover：子元素是触发按钮，content 是面板内容（React 节点） ————
// open 受控（onOpenChange 里更新）；只给 defaultOpen 就是非受控。Esc、点外面、焦点离开面板都会关上（onOpenChange(false)）
export function Popover({ content, title, align = "start", open, defaultOpen = false, onOpenChange, label, className, style, children }) {
  useSetup();
  const pop = useRef(null), trig = useRef(null), mounted = useMounted();
  const [inner, setInner] = useState(defaultOpen), isOpen = open ?? inner;
  const latest = useLatest({ align, set: (v) => { if (open === undefined) setInner(v); onOpenChange?.(v); } });
  useIso(() => {
    if (!mounted) return;
    const el = pop.current, l = popoverOf(el);
    if (isOpen && !l) openPopover(el, trig.current, { align: latest.current.align, onClose: () => { if (!el._snQuiet) latest.current.set(false); } });
    else if (!isOpen && l) { el._snQuiet = true; l.close(false); el._snQuiet = false; }
  }, [isOpen, mounted]);
  useIso(() => () => { const el = pop.current, l = el && popoverOf(el); if (l) { el._snQuiet = true; l.close(false); } }, []);
  const child = Children.only(children), p = child.props;
  const trigger = cloneElement(child, {
    ref: (n) => { trig.current = n; setRef(refOf(child), n); },
    "aria-haspopup": "dialog", "aria-expanded": false,
    onClick: (e) => { p.onClick?.(e); if (!e.defaultPrevented) latest.current.set(!popoverOf(pop.current)); },
  });
  const panel = mounted ? createPortal(h("div", { ref: pop, className: cx("sn-pop sn-popover", className), role: "dialog", "aria-label": label ?? (typeof title === "string" ? title : undefined), style }, title ? h("h4", null, title) : null, content), document.body) : null;
  return h(Fragment, null, trigger, panel);
}

// ———— 气泡确认：子元素是触发按钮。只给单条、属于自己、不能撤销的操作（能撤销的直接做、用轻提示给"撤销"） ————
// title 问的是什么（"永久删除这个镜头？"）、description 后果、confirmText 确认按钮的字（写清楚做什么）；onConfirm / onCancel。
// 锚在按钮上、从按钮那里展开；打开时焦点先落在"取消"上；Esc、点外面关上
export function Popconfirm({ title, description, confirmText, cancelText, danger = true, align = "end", onConfirm, onCancel, children }) {
  useSetup();
  const pop = useRef(null), trig = useRef(null), mounted = useMounted(), uid = domId(useId()), latest = useLatest({ onConfirm, onCancel, align });
  const close = (refocus) => popoverOf(pop.current)?.close(refocus);
  useIso(() => () => { const el = pop.current, l = el && popoverOf(el); if (l) l.close(false); }, []);
  const child = Children.only(children), p = child.props;
  const trigger = cloneElement(child, {
    ref: (n) => { trig.current = n; setRef(refOf(child), n); },
    "aria-haspopup": "dialog", "aria-expanded": false,
    onClick: (e) => { p.onClick?.(e); if (e.defaultPrevented) return; const l = popoverOf(pop.current); l ? l.close(false) : openPopover(pop.current, trig.current, { align: latest.current.align }); },
  });
  const panel = mounted ? createPortal(h("div", { ref: pop, className: "sn-pop sn-popconfirm", role: "alertdialog", "aria-labelledby": uid + "-q", "aria-describedby": description ? uid + "-d" : undefined },
    h("div", { className: "sn-q" }, Ic("triangle-alert"), h("div", null, h("div", { id: uid + "-q" }, title), description ? h("div", { className: "sn-d", id: uid + "-d" }, description) : null)),
    h("div", { className: "sn-acts" },
      // data-no：打开时焦点先落在它上面（和设计稿的标记一样）
      h("button", { type: "button", className: "sn-btn sn-ghost sn-sm", "data-no": "", onClick: () => { close(true); latest.current.onCancel?.(); } }, cancelText ?? tt("components.cancel")),
      h("button", { type: "button", className: cx("sn-btn", danger ? "sn-danger" : "sn-primary", "sn-sm"), "data-yes": "", onClick: () => { close(false); latest.current.onConfirm?.(); } }, confirmText ?? tt("components.confirm")))), document.body) : null;
  return h(Fragment, null, trigger, panel);
}

// ———— 命令面板：⌘K 打开（hotkey=false 关掉快捷键），groups = [{ name, items: [{ name, icon, sub, key, keys }] }]，选中一条 onRun(item) ————
// open 受控（Esc、点外面关上时 onOpenChange(false)）；也可以用 ref 调 open() / close() / toggle()。面板只有一个，渲染在 <body> 末尾
export const CommandPalette = /* @__PURE__ */ forwardRef(function CommandPalette({ groups = [], onRun, placeholder, empty, onEmpty, hotkey = true, enterLabel, open, onOpenChange }, ref) {
  const api = useRef(null), latest = useLatest({ onRun, empty, onEmpty, onOpenChange });
  const sig = JSON.stringify([groups.map((g) => [g.name, g.items.map((i) => [i.name, i.icon, i.sub, i.key, i.keys])]), placeholder, hotkey, enterLabel, !!empty, !!onEmpty]);
  useIso(() => {
    const unsetup = setup();
    const had = !!document.getElementById("cmdk-panel"), before = had ? new Set(document.getElementById("cmdkList").children) : null;
    const [a, dispose] = track(() => mountCmdk(groups, {
      onRun: (it) => latest.current.onRun?.(it), placeholder, hotkey, enterLabel,
      empty: latest.current.empty ? (q) => latest.current.empty(q) : undefined, onEmpty: latest.current.onEmpty ? (q) => latest.current.onEmpty(q) : undefined,
    }));
    const panel = document.getElementById("cmdk-panel"), scrim = document.getElementById("cmdkScrim"), list = document.getElementById("cmdkList");
    const added = [...list.children].filter((c) => !before?.has(c));
    // 开关状态：面板的 sn-open 类变了就告诉父组件（Esc、点外面、选中以后关上的也算）
    let was = panel.classList.contains("sn-open");
    const mo = new MutationObserver(() => { const now = panel.classList.contains("sn-open"); if (now !== was) { was = now; latest.current.onOpenChange?.(now); } });
    mo.observe(panel, { attributes: true, attributeFilter: ["class"] });
    api.current = a;
    return () => { mo.disconnect(); if (panel.classList.contains("sn-open")) a.close(); dispose(); for (const c of added) c.remove(); if (!had) { panel.remove(); scrim?.remove(); } api.current = null; unsetup(); };
  }, [sig]);
  useIso(() => {
    const a = api.current; if (!a || open === undefined) return;
    const now = document.getElementById("cmdk-panel")?.classList.contains("sn-open");
    if (open && !now) a.open(); else if (!open && now) a.close();
  }, [open, sig]);
  useImperativeHandle(ref, () => ({ open: () => api.current?.open(), close: () => api.current?.close(), toggle: () => api.current?.toggle() }), []);
  return null;
});

// ———— 看图：index 是数字就打开到那一张，null 关上；onClose 里把 index 设回 null ————
// items：[{ src, ratio, caption, video, bg }]；thumbOf(i) 返回第 i 张的缩略图元素（打开、关上时从缩略图放大、缩回去）
export function Lightbox({ items = [], index = null, onClose, thumbOf, enabled }) {
  useSetup();
  const lb = useRef(null), latest = useLatest({ onClose, thumbOf, enabled });
  useIso(() => {
    if (index == null || index < 0) { const x = lb.current; lb.current = null; x?.close(); return; }
    if (lb.current) return;
    lb.current = openLightbox(items, index, {
      thumbOf: (i) => latest.current.thumbOf?.(i) ?? null, enabled: (i) => latest.current.enabled?.(i) ?? true,
      onClose: () => { lb.current = null; latest.current.onClose?.(); },
    });
  }, [index]);
  useIso(() => () => { const x = lb.current; lb.current = null; x?.close(); }, []);
  return null;
}

// ———— 上传：拖放区 + 文件列表（各自显示进度，能取消、重试） ————
// accept：".txt,.docx" 这种扩展名列表或正则；maxSize：字节；upload(file, progress) 返回 Promise（不给就是演示用的模拟上传）
export const Upload = /* @__PURE__ */ forwardRef(function Upload({ accept, maxSize, upload, title, pick, hint, label, multiple = true, badType, tooBig, className, style, id }, ref) {
  const host = useRef(null), inst = useRef(null), latest = useLatest({ upload });
  const [html] = useState(() => uploadHTML({ title, pick, hint, label, multiple, accept }));
  useIso(() => {
    const unsetup = setup(), drop = host.current.firstElementChild;
    inst.current = S.createUpload(drop, { list: drop.nextElementSibling, accept: acceptRe(accept), maxSize, badType, tooBig, upload: latest.current.upload ? (f, p) => latest.current.upload(f, p) : undefined });
    return () => { inst.current?.destroy(); inst.current = null; unsetup(); };
  }, []);
  useImperativeHandle(ref, () => inst.current, []);
  return h("div", { ref: host, id, className: cx("sn-host", className), style: { display: "contents", ...style }, dangerouslySetInnerHTML: { __html: html }, suppressHydrationWarning: true });
});

// ———— 侧栏布局：左边侧栏（选中切换、收起成图标栏 ⌘\），右边主区放 children ————
// items / footer：[{ key, label, icon, badge, href }]，分组标题 { type: "group", label }；value 是选中的 key（onNavigate(key, item) 里更新）
// fx：选中切换的动效 "slide"（底色滑过去）| "bar"（指示条）| "fade"（原地淡入）| "text"（仅文字）
export const Sidebar = /* @__PURE__ */ forwardRef(function Sidebar({ items = [], footer = [], value, defaultValue, onNavigate, title, logo, collapsible, collapseBelow, fx = "slide", className, style, children }, ref) {
  const app = useRef(null), inst = useRef(null), latest = useLatest({ items, footer, onNavigate });
  const cur = value ?? defaultValue;
  // 侧栏的标记交给库管（选中、收起都是库改的）；条目变了换一份新的
  const sig = JSON.stringify([items, footer, title, logo, collapsible]);
  const [side, setSide] = useState(() => ({ sig, html: sidebarHTML({ items, footer, value: cur, title, logo, collapsible }) }));
  if (side.sig !== sig) setSide({ sig, html: sidebarHTML({ items, footer, value: cur, title, logo, collapsible }) });
  useIso(() => {
    const unsetup = setup();
    inst.current = S.createSidebar(app.current, { collapseBelow, onNavigate: (a) => { const k = a.dataset.key; latest.current.onNavigate?.(k, findItem([...latest.current.items, ...latest.current.footer], k)); } });
    return () => { inst.current?.destroy(); inst.current = null; unsetup(); };
  }, [side.html, collapseBelow]);
  // 受控：value 变了，选中对应的那一项（库按 fx 播切换动效）
  useIso(() => {
    if (value === undefined || !inst.current) return;
    const a = [...app.current.querySelectorAll(".sn-side a[data-key]")].find((x) => x.dataset.key === String(value));
    if (a && !a.classList.contains("sn-on")) inst.current.select(a);
  }, [value]);
  useImperativeHandle(ref, () => inst.current, []);
  return h("div", { ref: app, className: cx("sn-app", className), "data-navfx": fx, style },
    h("aside", { className: "sn-side", dangerouslySetInnerHTML: { __html: side.html } }),
    h("main", { className: "sn-app-main" }, children));
});

// ———— 无限列表：滚到底自动加载下一页，只渲染看得见的行（固定行高） ————
// loadPage(offset, size) 返回这一页的数据；renderItem(item, index) 返回这一行的 React 节点（行元素会复用，内容按 key 更新）
// 也可以给 renderRow(row, item, index) 直接改 DOM（最快，不经过 React）
export const InfiniteList = /* @__PURE__ */ forwardRef(function InfiniteList({ loadPage, renderItem, renderRow, rowHeight = 56, total, pageSize, onCount, className, style, id }, ref) {
  const vl = useRef(null), inst = useRef(null), latest = useLatest({ loadPage, renderItem, renderRow, onCount });
  const slots = useRef(new Map()), pending = useRef(false), [, force] = useState(0);
  useIso(() => {
    const unsetup = setup();
    inst.current = S.createInfiniteList(vl.current, {
      rowHeight, total, pageSize,
      loadPage: (o, n) => latest.current.loadPage(o, n),
      onCount: (n) => latest.current.onCount?.(n),
      renderRow: (row, item, i) => {
        if (latest.current.renderRow) return latest.current.renderRow(row, item, i);
        // 行里放一个自己的容器渲染 React 内容：库把这一行改成骨架、错误行时会清空行，清掉的只是这个容器（React 那边照样一致）
        let c = row._snc; if (!c || c.parentNode !== row) { c = document.createElement("div"); c.style.display = "contents"; row.append(c); row._snc = c; }
        slots.current.set(c, { item, i });
        if (!pending.current) { pending.current = true; queueMicrotask(() => { pending.current = false; if (inst.current) flushSync(() => force((x) => x + 1)); }); }
      },
    });
    return () => { inst.current?.destroy(); inst.current = null; slots.current.clear(); unsetup(); };
  }, []);
  useImperativeHandle(ref, () => inst.current, []);
  // 已经不在行里的容器（行被库清空过）丢掉
  for (const [c] of slots.current) if (!c.parentNode) slots.current.delete(c);
  const portals = latest.current.renderItem ? [...slots.current].map(([c, s]) => createPortal(latest.current.renderItem(s.item, s.i), c, String(c._snk ??= Math.random()))) : null;
  return h(Fragment, null, h("div", { ref: vl, id, className: cx("sn-vl", className), style }, h("div", { className: "sn-vl-space" })), portals);
});

// ———— 滚动区域：内容超出时两头渐隐、细滚动条（滚动或悬停时出现） ————
// 写法和普通 div 一样，限高（maxHeight）写在 style 上；as 换成别的标签。fade、bar、size、barSize、barInset、overscroll、wheel 见 createScrollArea
export const ScrollArea = /* @__PURE__ */ forwardRef(function ScrollArea({ as = "div", fade, size, bar, barSize, barInset, overscroll, wheel, className, children, ...rest }, ref) {
  const vp = useRef(null), inst = useRef(null), first = useRef(true);
  const opts = {}; for (const [k, v] of Object.entries({ fade, size, bar, barSize, barInset, overscroll, wheel })) if (v !== undefined) opts[k] = v;
  const sig = JSON.stringify(opts);
  useIso(() => { const unsetup = setup(); inst.current = S.createScrollArea(vp.current, opts); return () => { inst.current?.destroy(); inst.current = null; unsetup(); }; }, []);
  useIso(() => { if (first.current) { first.current = false; return; } inst.current?.set(opts); }, [sig]);
  useImperativeHandle(ref, () => inst.current, []);
  // 库会在视口外面包一层（.sn-sa，放滚动条和渐隐）：外面再套一层 display: contents，React 管的父子关系不受影响
  return h("div", { style: { display: "contents" } }, h(as, { ...rest, ref: vp, className: cx("sn-sa-vp", className) }, children));
});

// ———— 视频、音频 ————
// src 变了换一个新的播放器（React 的 key）；ref 拿到实例：play() / pause() / toggle()、video / audio 元素
const PlayerBase = /* @__PURE__ */ wrap(S.createPlayer, { events: ["error"], displayName: "PlayerInstance" });
const AudioBase = /* @__PURE__ */ wrap(S.createAudio, { events: ["error"], displayName: "AudioPlayerInstance" });
export const Player = /* @__PURE__ */ forwardRef(function Player(props, ref) { return h(PlayerBase, { ...props, ref, key: props.src ?? "" }); });
export const AudioPlayer = /* @__PURE__ */ forwardRef(function AudioPlayer(props, ref) { return h(AudioBase, { ...props, ref, key: props.src ?? "" }); });
