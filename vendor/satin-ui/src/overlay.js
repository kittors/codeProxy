// UI 库设计稿第二批：浮层的交互。Tooltip 在 kit.js；这里是弹出面板、气泡确认、右键菜单和子菜单（安全三角区）、弹窗、抽屉、命令面板。
// 数值照 09 号 §2、§5：子菜单 220 / 1200 / 360ms、每 80ms 复查；弹窗 320ms ease.open，关闭短三分之一；打开后焦点进去，关闭后回到按钮。
import { $, $$, injectIcons, hideTip, resetTipLayer, reduced } from "./core.js";
import { hitAny, pushDismiss, dropDismiss, findDismiss } from "./dismiss.js";
import { computeFloating, getViewportBounds, isAnchorOutOfView } from "./floating.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/overlay.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
// 打开中的浮层统一交由 dismiss.js 排栈协同（Esc 后进先出、捕获阶段点击外部、焦点移出、窗口失焦、父子浮层保护）
const push = (l) => pushDismiss(l), drop = (l) => dropDismiss(l);


// showModal 会让整页变成不可操作，浏览器要把整页样式重算一遍（长页面要几十毫秒）。
// 所以先把弹窗以透明的状态放上去、等这次重算的那一帧过去，再起动画（命令面板也是隔两帧再起）
const twoFrames = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const OUT = "cubic-bezier(0,0,.58,1)", IN_OUT = "cubic-bezier(.42,0,.58,1)";
const OPEN = "cubic-bezier(.32,.72,0,1)", EASE_IN = "cubic-bezier(.42,0,1,1)";
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const M = 8;
// 浮层离窗口边缘至少 8px
void OPEN;
// ———— 命令面板：展示页的 ⌘K 和官网的搜索共用这一份 ————
// 输入就筛选，上下键选、回车执行、Esc 关闭；高亮条在行间滑过去，筛选时留下的行移到新位置，新出现的淡入。
// groups: [{ name, items: [{ icon, name, sub, key, keys }] }]（keys 是额外的搜索词，比如英文名）；onRun(item) 选中后执行；
// empty(q) 没有结果时显示的 HTML，里面带 data-empty-act 的按钮点了（或直接回车）调 onEmpty(q)。页面里没有 #cmdk-panel 就自己建一个。
export function mountCmdk(groups, { onRun, placeholder, empty = (q) => tt("overlay.0", { p0: esc(q) }), onEmpty, hotkey = true, enterLabel = tt("overlay.1") } = {}) {
  if (!document.getElementById("cmdk-panel")) {
    document.body.insertAdjacentHTML("beforeend", tt("overlay.2")
      + '<div class="sn-q"><span data-i="search"></span><input id="cmdkInput" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmdkList"><span class="sn-kbd">Esc</span></div>'
      + '<div class="sn-list" id="cmdkList" role="listbox"><span class="sn-bar" aria-hidden="true"></span></div>'
      + `<div class="sn-foot"><span><kbd>↑</kbd><kbd>↓</kbd>${tt("overlay.3")}</span><span><kbd>↵</kbd>${esc(enterLabel)}</span><span><kbd>Esc</kbd>${tt("overlay.4")}</span></div></div>`);
    injectIcons(document.getElementById("cmdk-panel"));
  }
  const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
  const cmdk = $("#cmdk-panel"), cmScrim = $("#cmdkScrim"), cmIn = $("#cmdkInput"), cmList = $("#cmdkList"), bar = $(".sn-bar", cmList), items = new Map();
  if (placeholder) cmIn.placeholder = placeholder;
  cmList.insertAdjacentHTML("beforeend", groups.map((g, gi) => `<div class="sn-grp" data-g="${gi}">${esc(g.name)}</div>` + g.items.map((it, oi) => {
    items.set(`opt-${gi}-${oi}`, it);
    return `<div class="sn-opt" role="option" id="opt-${gi}-${oi}" data-g="${gi}" data-name="${esc(it.name)}"${it.keys ? ` data-keys="${esc(it.keys.toLowerCase())}"` : ""}${it.icon ? ` data-i="${it.icon}:before"` : ""}>`
      + `<span class="sn-nm">${esc(it.name)}</span>${it.sub ? `<span class="sn-sub">${esc(it.sub)}</span>` : ""}${it.key ? `<span class="sn-key">${esc(it.key)}</span>` : ""}</div>`;
  }).join("")).join("") + '<div class="sn-empty" hidden></div>');
  injectIcons(cmList);
  const opts = $$(".sn-opt", cmList), emptyEl = $(".sn-empty", cmList);
  let hlOpt = null, cmLayer = null, cmFrom = null;
  const visible = () => opts.filter((o) => !o.hidden);
  function moveBar(o, instant) {
    hlOpt?.classList.remove("sn-hl"); hlOpt = o;
    if (!o) { bar.classList.remove("sn-on"); cmIn.removeAttribute("aria-activedescendant"); return; }
    o.classList.add("sn-hl"); cmIn.setAttribute("aria-activedescendant", o.id);
    bar.classList.toggle("sn-instant", !!instant || reduced()); bar.style.transform = `translateY(${o.offsetTop}px)`; bar.style.height = o.offsetHeight + "px"; bar.classList.add("sn-on");
    if (instant) requestAnimationFrame(() => bar.classList.remove("sn-instant"));
    const top = o.offsetTop, bottom = top + o.offsetHeight;
    if (top < cmList.scrollTop + 6) cmList.scrollTop = top - 6; else if (bottom > cmList.scrollTop + cmList.clientHeight - 6) cmList.scrollTop = bottom - cmList.clientHeight + 6;
  }
  function filter(q, quiet) {
    const k = q.trim().toLowerCase(), shown = visible(), before = new Map(shown.map((o) => [o, o.offsetTop]));
    for (const o of opts) {
      const name = o.dataset.name, i = name.toLowerCase().indexOf(k), sub = $(".sn-sub", o)?.textContent || "";
      const hit = !k || i >= 0 || sub.toLowerCase().includes(k) || (o.dataset.keys || "").includes(k); o.hidden = !hit;
      $(".sn-nm", o).innerHTML = k && i >= 0 ? esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + k.length)) + "</mark>" + esc(name.slice(i + k.length)) : esc(name);
    }
    for (const g of $$(".sn-grp", cmList)) g.hidden = !opts.some((o) => o.dataset.g === g.dataset.g && !o.hidden);
    const v = visible(); emptyEl.hidden = v.length > 0;
    if (!v.length) emptyEl.innerHTML = empty(q.trim());
    if (!reduced() && !quiet) for (const o of v) {
      if (before.has(o)) { const dy = before.get(o) - o.offsetTop; if (dy) o.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 200, easing: IN_OUT }); }
      else o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: OUT });
    }
    moveBar(v[0] || null, true);
  }
  function openCmdk() {
    if (cmLayer) return; hideTip(); cmFrom = document.activeElement;
    // 先把列表准备好（改 DOM、量位置），隔两帧再加 open 类起动画，准备工作不压住动画的第一帧
    cmIn.value = ""; filter("", true);
    twoFrames(() => { if (!cmLayer) return; cmdk.classList.add("sn-open"); cmScrim.classList.add("sn-open"); cmIn.focus({ preventScroll: true }); });
    cmLayer = {
      panel: cmdk, modal: true, blur: false, focusOut: false,
      close(refocus) { cmdk.classList.remove("sn-open"); cmScrim.classList.remove("sn-open"); drop(cmLayer); cmLayer = null; if (refocus) cmFrom?.focus?.({ preventScroll: true }); },
      contains: (t, p) => hitAny(t, p, [cmdk]),
    };
    push(cmLayer);
  }
  function run(o) {
    if (!o) return; o.classList.remove("sn-run"); void o.offsetWidth; o.classList.add("sn-run");
    const it = items.get(o.id);
    setTimeout(() => { cmLayer?.close(true); onRun?.(it); }, reduced() ? 0 : 150);
  }
  cmIn.addEventListener("input", () => filter(cmIn.value));
  cmIn.addEventListener("keydown", (e) => {
    const v = visible(), i = v.indexOf(hlOpt);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (v.length) moveBar(v[(i + (e.key === "ArrowDown" ? 1 : -1) + v.length) % v.length]); }
    else if (e.key === "Enter") { e.preventDefault(); if (hlOpt) run(hlOpt); else if (onEmpty && cmIn.value.trim()) { cmLayer?.close(true); onEmpty(cmIn.value.trim()); } }
    else if (e.key === "Tab") e.preventDefault();
  });
  cmList.addEventListener("pointermove", (e) => { const o = e.target.closest(".sn-opt"); if (o && o !== hlOpt) moveBar(o); });
  cmList.addEventListener("click", (e) => {
    const o = e.target.closest(".sn-opt"); if (o) run(o);
    if (e.target.closest("[data-empty-act]")) { cmLayer?.close(true); onEmpty?.(cmIn.value.trim()); }
  });
  if (hotkey) document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.altKey && !$("dialog[open]")) { e.preventDefault(); cmLayer ? cmLayer.close(true) : openCmdk(); }
  });
  return { open: openCmdk, close: () => cmLayer?.close(true), toggle: () => (cmLayer ? cmLayer.close(true) : openCmdk()), input: cmIn, list: cmList };
}
// ———— 公开接口 1：放置浮层 ————
// placePanel(面板, 锚点, { align: "start" | "center" | "end", gap })：统一交由 floating.js 智能定位，自动避让固定顶栏、四边防溢出、空间不足自动翻转、变换原点对准锚点
export function placePanel(panel, anchor, { align = "start", gap = 6 } = {}) {
  const pos = computeFloating(panel, anchor, { align, gap, margin: M });
  panel.style.left = pos.left + "px";
  panel.style.top = pos.top + "px";
  panel.style.transformOrigin = `${pos.ox}px ${pos.oy}px`;
  panel.classList.toggle("sn-up", pos.up);
  return pos;
}
// 焦点圈在一个容器里（抽屉、弹窗之外的模态面板）
const trap = (box, e) => {
  if (e.key !== "Tab") return;
  const f = $$(FOCUSABLE, box).filter((x) => x.offsetParent !== null); if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
  else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
};
const place = placePanel;
// ———— 公开接口 2：弹出面板（Popover、气泡确认） ————
// openPopover(面板, 触发按钮, { align, onClose })：放到按钮旁、打开、焦点进去；返回 { close(refocus) }。
// Esc、点外面、焦点离开面板都会关上；popoverOf(面板) 拿到正开着的那一个（没开返回 undefined）
export function openPopover(pop, trig, { align = "start", onClose } = {}) {
  hideTip(); place(pop, trig, { align });
  pop.classList.add("sn-open"); trig.classList.add("sn-is-open"); trig.setAttribute("aria-expanded", "true");
  const layer = {
    pop, panel: pop, trigger: trig,
    close(refocus) {
      pop.classList.remove("sn-open"); trig.classList.remove("sn-is-open"); trig.setAttribute("aria-expanded", "false"); drop(layer);
      removeEventListener("resize", re); removeEventListener("scroll", onSc, true); removeEventListener("satin-reposition", re);
      onClose?.(); if (refocus) trig.focus();
    },
    contains: (t, p) => hitAny(t, p, [pop, trig]),
  };
  const re = () => {
    if (!trig.isConnected || isAnchorOutOfView(trig)) { layer.close(false); return; }
    place(pop, trig, { align });
  };
  const onSc = (e) => { if (e.target === pop || pop.contains?.(e.target)) return; re(); };
  addEventListener("resize", re); addEventListener("scroll", onSc, { passive: true, capture: true }); addEventListener("satin-reposition", re);
  push(layer);
  const first = pop.matches(".sn-popconfirm") ? $("[data-no]", pop) : $(FOCUSABLE, pop);
  requestAnimationFrame(() => first?.focus({ preventScroll: true }));
  return layer;
}
export const popoverOf = (pop) => findDismiss((l) => l.pop === pop);
// ———— 公开接口 3：菜单（右键菜单、菜单按钮、子菜单、安全三角区、窄处下钻） ————
// openMenu(菜单, { trigger, anchor, align, x, y, keyboard, bound, onSelect })：
//   anchor：贴着这个元素弹（菜单按钮）；x / y：在指针位置弹（右键菜单）；bound：菜单（连同每一层子菜单）只能待在这个容器里；
//   keyboard：用键盘打开时先高亮第一项；onSelect({ item, label, path, menu })：选中一项时调（同时在根菜单上发 menuselect 事件）。
// closeMenu(refocus)：关上整套菜单。子菜单：条目写 data-sub="子菜单 id"；不可用的条目加 .is-off；分隔线 .sep、分组标题 .head
// T_SWITCH：指针在安全三角区里停住多久就切到它所在的行（原来 1200ms，停住以后子菜单迟迟不换，像卡住了；2026-11-20 改 400ms）
// T_DRILL：容器太窄、子菜单只能下钻时，悬停在这一行多久就下钻（从开始悬停算）
const T_OPEN = 220, T_OPEN_DRAG = 420, T_SWITCH = 400, T_CLOSE = 360, T_CHECK = 80, T_DRILL = 520;
let triDebug = null;
// 调试：把安全三角区画出来（展示页的"显示三角区"开关用）
export const setTriDebug = (v) => { triDebug = v; };
// 展示页的"显示安全三角区"：{ poly, on() }
export const menuOpenFor = (trigger) => !!sys && sys.trigger === trigger;
let sys = null;
// 当前打开的一整套菜单
const rows = (m) => $$(".sn-item", m).filter((x) => !x.classList.contains("sn-back") || m.classList.contains("sn-drill"));
// 返回行只在下钻时算一行
const setHL = (m, it) => rows(m).forEach((x) => x.classList.toggle("sn-hl", x === it));
// 菜单能待的范围：默认整个安全视口（自动避让顶栏与嵌入宿主边界）；传了 bound（某个容器），就取容器与安全视口的交集。四边各留 8px
const area = (bound) => {
  const b = getViewportBounds(M), r = bound?.getBoundingClientRect();
  return {
    l: r ? Math.max(b.left, r.left + M) : b.left,
    t: r ? Math.max(b.top, r.top + M) : b.top,
    r: r ? Math.min(b.right, r.right - M) : b.right,
    b: r ? Math.min(b.bottom, r.bottom - M) : b.bottom,
  };
};
const fitHeight = (m, A) => { m.style.maxHeight = Math.min(420, Math.max(120, A.b - A.t)) + "px"; };
// 比范围还高：限高，在菜单里滚动（菜单本来就是滚动区域）
const applyMenuSurface = (m, surface) => {
  if (!m || !surface) return;
  m.classList.toggle("sn-blur", surface === "blur");
  m.classList.toggle("sn-solid", surface === "solid");
};
export function openMenu(rootMenu, { trigger, x, y, anchor, keyboard, align, bound, surface, onSelect, onClose } = {}) {
  closeMenu(false); hideTip();
  applyMenuSurface(rootMenu, surface);
  sys = { chain: [rootMenu], owner: new Map(), trigger, onSelect, onClose, surface, pts: [], last: 0, holding: false, openT: 0, closeT: 0, closeLevel: -1, check: 0, level: 0, dragging: false, area: area(bound), offRepos: null };
  if (anchor) {
    rootMenu.style.maxHeight = ""; place(rootMenu, anchor, { align }); anchor.classList.add("sn-is-open"); anchor.setAttribute("aria-expanded", "true");
    const onRepos = () => { if (sys && anchor.isConnected) { sys.area = area(bound); place(rootMenu, anchor, { align }); } };
    addEventListener("satin-reposition", onRepos);
    sys.offRepos = () => removeEventListener("satin-reposition", onRepos);
  }
  else {
    const A = sys.area; fitHeight(rootMenu, A);
    const w = rootMenu.offsetWidth, h = rootMenu.offsetHeight, fx = x + w > A.r && (x - w >= A.l || x > (A.l + A.r) / 2), fy = y + h > A.b && (y - h >= A.t || y > (A.t + A.b) / 2);
    // 右边、下边放不下就往左、往上开；两边都放不下（范围太窄、太矮）就贴着范围的边，展开的方向看指针在哪一半
    rootMenu.style.left = Math.max(A.l, Math.min(A.r - w, fx ? x - w : x)) + "px"; rootMenu.style.top = Math.max(A.t, Math.min(A.b - h, fy ? y - h : y)) + "px";
    rootMenu.style.transformOrigin = `${fx ? "right" : "left"} ${fy ? "bottom" : "top"}`; rootMenu.classList.toggle("sn-up", fy);
  }
  rootMenu.classList.add("sn-open"); rootMenu.focus({ preventScroll: true });
  if (keyboard) setHL(rootMenu, rows(rootMenu).find((r) => !r.classList.contains("sn-is-off")));
  sys.check = setInterval(recheck, T_CHECK);
  document.addEventListener("pointermove", onMove);
  sys.layer = {
    panel: rootMenu, trigger: anchor || trigger, focusOut: false,
    close: (refocus) => closeMenu(refocus),
    contains: (t, p) => hitAny(t, p, [...(sys?.chain || []), anchor]),
  };
  push(sys.layer);
}
function closeFrom(level) {
  if (!sys) return;
  // 从下钻里退回上一层：退出的这一层直接消失，不淡出——淡出的那几帧会和重新出现的上一层叠在一起，两层字重影
  const back = level > 0 && sys.chain[level - 1]?.classList.contains("sn-drilled");
  for (const m of sys.chain.splice(level)) {
    if (back) m.style.transition = "none";
    m.classList.remove("sn-open", "sn-drilled"); setHL(m, null);
    if (back) { void m.offsetWidth; m.style.transition = ""; }
    const it = sys.owner.get(m); it?.classList.remove("sn-sub-open"); it?.setAttribute("aria-expanded", "false"); sys.owner.delete(m);
  }
  sys.chain.at(-1)?.classList.remove("sn-drilled"); // 从下钻里退回来：上一层重新显示
  sys.level = Math.min(sys.level, sys.chain.length - 1); drawTri(null);
}
export function closeMenu(refocus) {
  if (!sys) return;
  const s = sys; clearTimeout(s.openT); clearTimeout(s.closeT); clearInterval(s.check); s.offRepos?.();
  closeFrom(0); document.removeEventListener("pointermove", onMove); drop(s.layer);
  s.trigger?.classList.remove("sn-is-open", "sn-active"); s.trigger?.setAttribute("aria-expanded", "false");
  sys = null; s.onClose?.(); if (refocus) s.trigger?.focus({ preventScroll: true });
}
// explicit：点击或按键打开（悬停打开时是 false）
function openSub(it, level, explicit) {
  clearTimeout(sys.openT); clearTimeout(sys.closeT); sys.closeT = 0;
  if (sys.owner.get(sys.chain[level + 1]) === it) { if (explicit) { sys.level = level + 1; setHL(sys.chain[level + 1], rows(sys.chain[level + 1])[0]); } return; }
  closeFrom(level + 1);
  const A = sys.area, parent = sys.chain[level], sub = $("#" + it.dataset.sub), pr = parent.getBoundingClientRect(), ir = it.getBoundingClientRect();
  applyMenuSurface(sub, sys.surface || (parent.classList.contains("sn-blur") ? "blur" : parent.classList.contains("sn-solid") ? "solid" : undefined));
  sub.classList.remove("sn-drill"); sub.style.minWidth = ""; fitHeight(sub, A);
  const w = sub.offsetWidth, h = sub.offsetHeight, firstRow = rows(sub)[0];
  const R = pr.right - 8, L = pr.left + 8 - w, fitsR = R + w <= A.r, fitsL = L >= A.l;
  // 两边都放不下：点击或按键时原地下钻；悬停时在这一行多停一会儿（共 T_DRILL）再下钻——停住就是想进去，不能像没反应；
  // 只是划过去的（移到别的行会清掉这个计时）不会突然换掉整个菜单
  if (!fitsR && !fitsL) {
    if (explicit) drill(it, level, sub);
    else sys.openT = setTimeout(() => { if (sys && sys.chain[level] && it.classList.contains("sn-hl") && !sys.chain[level + 1]) drill(it, level, sub); }, T_DRILL - T_OPEN);
    return;
  }
  // 往哪边开：上一层是往左开的，就接着往左（不左右来回跳）；否则右边优先
  const flipL = parent.classList.contains("sn-left") ? fitsL : !fitsR;
  const top = Math.max(A.t, Math.min(A.b - h, ir.top - (firstRow ? firstRow.offsetTop : 4)));
  sub.style.left = (flipL ? L : R) + "px"; sub.style.top = top + "px"; sub.classList.toggle("sn-left", flipL);
  sub.classList.add("sn-open"); it.classList.add("sn-sub-open"); it.setAttribute("aria-expanded", "true");
  sys.chain.push(sub); sys.owner.set(sub, it);
  if (explicit) { sys.level = level + 1; setHL(sub, firstRow); }
}
// 窄到左右都放不下：在上一层菜单的位置"下钻"——同一个位置换成下一层，上一层往左淡出；顶上一行"‹ 上一层的名字"，点它或按左键回去
function drill(it, level, sub) {
  const parent = sys.chain[level], pr = parent.getBoundingClientRect(), A = sys.area;
  let back = sub.querySelector(".sn-item.sn-back");
  if (!back) { back = document.createElement("div"); back.className = "sn-item sn-back"; back.setAttribute("role", "menuitem"); back.dataset.i = "chevron-left:before"; back.innerHTML = "<span></span>"; sub.querySelector(".sn-head, .sn-item, .sn-sep").before(back); injectIcons(back.parentElement); }
  back.querySelector("span").textContent = words(it);
  sub.classList.add("sn-drill"); sub.classList.remove("sn-left"); sub.style.minWidth = Math.min(pr.width, A.r - A.l) + "px"; fitHeight(sub, A);
  const w = sub.offsetWidth, h = sub.offsetHeight; // 先量一次：让"在右边、透明"成为滑进来的起点
  sub.style.left = Math.max(A.l, Math.min(A.r - w, pr.left)) + "px"; sub.style.top = Math.max(A.t, Math.min(A.b - h, pr.top)) + "px";
  parent.classList.add("sn-drilled"); sub.classList.add("sn-open"); it.classList.add("sn-sub-open"); it.setAttribute("aria-expanded", "true");
  sys.chain.push(sub); sys.owner.set(sub, it); sys.level = level + 1;
  setHL(sub, rows(sub).find((r) => !r.classList.contains("sn-back") && !r.classList.contains("sn-is-off")));
}
// 安全三角区：顶点取最近两次指针位置里较早的那次，连到子菜单近侧的上下两个角
function triangleFor(level) {
  const sub = sys.chain[level + 1]; if (!sub || sys.pts.length < 2) return null;
  const a = sys.pts[sys.pts.length - 2], r = sub.getBoundingClientRect(), ex = sub.classList.contains("sn-left") ? r.right : r.left;
  return [a, { x: ex, y: r.top }, { x: ex, y: r.bottom }];
}
const inTri = (p, [a, b, c]) => {
  const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
function drawTri(t) { if (!triDebug?.on()) return; triDebug.poly.setAttribute("points", t ? t.map((p) => `${p.x},${p.y}`).join(" ") : ""); }
function onMove(e) {
  if (!sys) return;
  const p = { x: e.clientX, y: e.clientY }, prev = sys.pts.at(-1);
  if (prev && prev.x === p.x && prev.y === p.y) return;
  sys.pts.push(p); if (sys.pts.length > 3) sys.pts.shift();
  sys.last = performance.now(); sys.dragging = e.buttons !== 0;
  evaluate(p);
}
function recheck() { if (sys?.holding && performance.now() - sys.last > T_SWITCH) { sys.holding = false; evaluate(sys.pts.at(-1), true); } }
function evaluate(p, force) {
  const el = document.elementFromPoint(p.x, p.y), m = el?.closest(".sn-menu.sn-float.sn-open"), level = m ? sys.chain.indexOf(m) : -1;
  if (level < 0) { sys.holding = false; drawTri(null); return; }
  const it = el.closest(".sn-item"), sub = sys.chain[level + 1];
  // 指针朝着已打开的子菜单走：途经的行不高亮、不展开
  if (!force && sub && it !== sys.owner.get(sub)) {
    const t = triangleFor(level); drawTri(t);
    if (t && inTri(p, t)) { sys.holding = true; return; }
  } else drawTri(sub ? triangleFor(level) : null);
  sys.holding = false; sys.level = level;
  if (level > 0) { const parent = sys.chain[level - 1], owner = sys.owner.get(m); setHL(parent, owner); clearTimeout(sys.closeT); sys.closeT = 0; clearTimeout(sys.openT); }
  const row = it && !it.classList.contains("sn-is-off") ? it : null;
  setHL(m, row);
  if (sub && sys.owner.get(sub) === row) { clearTimeout(sys.closeT); sys.closeT = 0; return; }
  if (sub && !sys.closeT) sys.closeT = setTimeout(() => { if (sys) { sys.closeT = 0; closeFrom(level + 1); } }, T_CLOSE);
  clearTimeout(sys.openT);
  if (row?.dataset.sub) sys.openT = setTimeout(() => sys && openSub(row, level), sys.dragging ? T_OPEN_DRAG : T_OPEN);
}
const words = (it) => [...it.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
function activate(it) {
  if (!it || it.classList.contains("sn-is-off")) return;
  const level = sys.chain.findIndex((m) => m.contains(it));
  if (it.classList.contains("sn-back")) { const owner = sys.owner.get(sys.chain[level]); closeFrom(level); sys.level = level - 1; setHL(sys.chain[level - 1], owner); return; } // 下钻的返回行：回上一层
  if (it.dataset.sub) { openSub(it, level, true); return; }
  const label = words(it), rootMenu = sys.chain[0], path = sys.chain.slice(1, level + 1).map((m) => words(sys.owner.get(m))), onSel = sys.onSelect;
  // 选中的行闪一下再收起，和系统菜单一样
  const blink = reduced() ? 0 : 140; it.classList.remove("sn-hl"); setTimeout(() => it.classList.add("sn-hl"), blink / 2);
  setTimeout(() => {
    closeMenu(true);
    if (it.classList.contains("sn-sel")) return;
    // 选中：回调 + 在根菜单上发 menuselect（冒泡），detail 里有条目、文字、子菜单路径、根菜单
    const detail = { item: it, label, path, menu: rootMenu };
    onSel?.(detail); rootMenu.dispatchEvent(new CustomEvent("menuselect", { bubbles: true, detail }));
  }, blink);
}


// 窗口缩放时菜单直接关掉（不跟着漂）。嵌在官网文档里时（html.embed），演示画布为了让浮层露出来会临时伸长、缩回：
// 只是变高、变矮不是缩放，不能关——不然从按钮弹出、超出画布的菜单一打开就被关掉
let winW = 0; // 装上全局行为时记下当时的窗口宽度（Node 里没有 innerWidth）



// ———— 公开接口 4：弹窗 ————
// openDialog(<dialog class="dlg">, 触发按钮)：从按钮那里长出来；closeDialog(弹窗, refocus)：原路缩回，焦点回到按钮。
// 弹窗里 [data-x]、[data-cancel] 关闭，Esc 也是；点背景只"顶一下"，不关。弹窗上挂 guard()（比如"有填写内容先问一句"），关闭前先调它
// ———— 4. 弹窗：从按钮那里长出来，原路缩回；点背景只顶一下；有填写内容时底栏原地问一句 ————
const dlgFrom = new Map();
// showModal 会让整页变成不可操作，浏览器要把整页样式重算一遍（长页面要几十毫秒）。
// 所以先把弹窗以透明的状态放上去、等这次重算的那一帧过去，再起动画：动画的每一帧都是空闲帧，开头不被吞掉。
// 动画只用 transform 和 opacity（合成线程），原点只往按钮那边偏三分之一、从 0.96 放大：看得出从哪来，又不会"飞"过来。
export function openDialog(d, trig) {
  resetTipLayer();
  d._drag = { x: 0, y: 0 }; d.style.translate = ""; d.classList.remove("sn-dragging");
  d.style.opacity = "0"; d.showModal(); dlgFrom.set(d, trig);
  ($("input:not([type=checkbox])", d) || $(".sn-ft .sn-primary", d))?.focus({ preventScroll: true });
  twoFrames(() => {
    // 从触发按钮那边"长"出来：缩放原点朝按钮偏三分之一；没有触发按钮（程序打开）就从正中
    const b = d.getBoundingClientRect(), r = trig?.getBoundingClientRect?.() ?? { left: b.left + b.width / 2, top: b.top + b.height / 2, width: 0, height: 0 };
    d.style.transformOrigin = `${b.width / 2 + (r.left + r.width / 2 - b.left - b.width / 2) / 3}px ${b.height / 2 + (r.top + r.height / 2 - b.top - b.height / 2) / 3}px`;
    d.style.opacity = ""; d.classList.add("sn-shown");
    if (!reduced()) d.animate([{ transform: "scale(.96)" }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
    d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced() ? 150 : 140, easing: OUT });
  });
}
// 收起：先播完（只动 transform 和 opacity，独立 translate 保持在拖动后的位置，原地微缩淡出），再 close() 并复位位移
export async function closeDialog(d, refocus = true) {
  if (d.closing) return; d.closing = true; d.classList.remove("sn-shown", "sn-dragging"); hideTip();
  const a = [d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 150 : 180, easing: EASE_IN, fill: "forwards" })];
  if (!reduced()) a.push(d.animate([{ transform: "none" }, { transform: "scale(.97)" }], { duration: 180, easing: EASE_IN, fill: "forwards" }));
  await Promise.all(a.map((x) => x.finished)); d.close(); a.forEach((x) => x.cancel());
  d._drag = { x: 0, y: 0 }; d.style.translate = ""; d.closing = false;
  d.dispatchEvent(new Event("reset-demo")); if (refocus) dlgFrom.get(d)?.focus({ preventScroll: true });
}
const nudge = (d) => !reduced() && d.animate([{ transform: "none", transformOrigin: "50% 50%" }, { transform: "scale(1.015)", transformOrigin: "50% 50%" }, { transform: "none", transformOrigin: "50% 50%" }], { duration: 260, easing: OUT });
const DLG_NO_DRAG = "button, a, input, textarea, select, [role='button'], [data-x], [data-cancel], [data-no-drag]";
export function wireDialog(d) {
  if (d._wired) return; d._wired = true;
  d._drag = { x: 0, y: 0 };
  let dg = null;
  const clampDrag = (x, y, base) => {
    const pad = 8, minVisX = Math.min(96, base.w), minVisY = 56;
    const minX = pad - base.left - Math.max(0, base.w - minVisX);
    const maxX = innerWidth - pad - base.left - minVisX;
    const minY = pad - base.top;
    const maxY = innerHeight - minVisY - base.top;
    return {
      x: Math.round(Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), x))),
      y: Math.round(Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), y))),
    };
  };
  d.addEventListener("pointerdown", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) nudge(d);
      return;
    }
    // 按住标题栏（.sn-hd）即可拖动弹窗；设 data-draggable="false" 可显式关闭
    if (e.button !== 0 || d.dataset.draggable === "false" || !d.open || d.closing) return;
    const hd = e.target.closest?.(".sn-hd");
    if (!hd || !d.contains(hd) || e.target.closest?.(DLG_NO_DRAG)) return;
    const cur = d._drag || { x: 0, y: 0 }, r = d.getBoundingClientRect();
    dg = { id: e.pointerId, hd, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, moved: false, base: { left: r.left - cur.x, top: r.top - cur.y, w: r.width, h: r.height } };
  });
  d.addEventListener("pointermove", (e) => {
    if (!dg || e.pointerId !== dg.id) return;
    const dx = e.clientX - dg.sx, dy = e.clientY - dg.sy;
    if (!dg.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      dg.moved = true;
      d.classList.add("sn-dragging");
      try { d.setPointerCapture?.(e.pointerId); } catch {}
    }
    const next = clampDrag(dg.ox + dx, dg.oy + dy, dg.base);
    d._drag = next;
    d.style.translate = `${next.x}px ${next.y}px`;
  });
  const endDrag = (e) => {
    if (!dg || e.pointerId !== dg.id) return;
    const was = dg; dg = null;
    if (was.moved) {
      d.classList.remove("sn-dragging");
      try { d.releasePointerCapture?.(e.pointerId); } catch {}
    }
  };
  d.addEventListener("pointerup", endDrag);
  d.addEventListener("pointercancel", endDrag);
  // 双击标题栏平滑复位回视口正中
  d.addEventListener("dblclick", (e) => {
    if (d.dataset.draggable === "false" || !d.open || d.closing) return;
    const hd = e.target.closest?.(".sn-hd");
    if (!hd || !d.contains(hd) || e.target.closest?.(DLG_NO_DRAG)) return;
    const cur = d._drag;
    if (!cur || (cur.x === 0 && cur.y === 0)) return;
    const from = `${cur.x}px ${cur.y}px`;
    d._drag = { x: 0, y: 0 };
    d.style.translate = "";
    if (!reduced()) d.animate([{ translate: from }, { translate: "0px 0px" }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
  });
  d.addEventListener("cancel", (e) => { e.preventDefault(); d.dispatchEvent(new Event("ask-close")); });
  d.addEventListener("ask-close", () => (d.guard ? d.guard() : closeDialog(d)));
  for (const x of $$("[data-x],[data-cancel]", d)) x.addEventListener("click", () => d.dispatchEvent(new Event("ask-close")));
  $("form", d)?.addEventListener("submit", (e) => e.preventDefault());
}
// ———— 公开接口 5：抽屉 ————
// openDrawer(<aside class="drawer">, { trigger, scrim, focus, onClose })：从右边滑进来，背后压一层暗（没给 scrim 就用页面上的 .drawer-scrim，没有就建一个）；
// 返回 { close(refocus) }；closeDrawer() 关上正开着的那个。Esc、点外面、抽屉里的 [data-x] 都会关；焦点圈在抽屉里
let drLayer = null;
const scrimEl = () => document.querySelector(".sn-drawer-scrim") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "sn-drawer-scrim" }));
export function openDrawer(drawer, { trigger, scrim, focus, onClose } = {}) {
  if (drLayer) drLayer.close(false);
  hideTip(); const sc = scrim || scrimEl();
  drawer.classList.add("sn-open"); sc.classList.add("sn-open");
  const layer = drLayer = {
    drawer, panel: drawer, trigger, modal: true, blur: false, focusOut: false,
    close(refocus) {
      if (drLayer !== layer) return;
      drawer.classList.remove("sn-open"); sc.classList.remove("sn-open"); drop(layer); drLayer = null; onClose?.();
      if (refocus) trigger?.focus({ preventScroll: true });
    },
    contains: (t, p) => hitAny(t, p, [drawer]),
    ignore: (t) => !!t?.closest?.(".sn-tip,.sn-toasts"),
  };
  push(layer); setTimeout(() => (focus || drawer.querySelector(FOCUSABLE))?.focus({ preventScroll: true }), 60);
  return layer;
}
export const closeDrawer = (refocus = true) => drLayer?.close(refocus);
function wireDrawer(drawer) {
  if (drawer._wired) return; drawer._wired = true;
  for (const x of drawer.querySelectorAll("[data-x]")) x.addEventListener("click", () => { if (drLayer?.drawer === drawer) drLayer.close(true); });
  drawer.addEventListener("keydown", (e) => trap(drawer, e));
  // 触屏：手指往右拖可以关——抽屉跟着手走，松手时拖过三成宽或甩得快就关，不然弹回原位（只动 translate）。
  // 在输入框、滑块、分段控件、能横着滑的区域里按下的不接管（只能竖着滚的滚动区域照样接）；先往竖直方向动的交给页面滚动
  let sw = null;
  drawer.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !drawer.classList.contains("sn-open")) return;
    if (e.target.closest("input, textarea, select, [contenteditable], .sn-slider, .sn-seg, .sn-tab-list")) return;
    const sv = e.target.closest(".sn-sa-vp"); if (sv && sv.scrollWidth > sv.clientWidth + 1) return; // 能横着滑的滚动区域交给它自己；只能竖着滚的（抽屉里的长列表）照样能拖着关
    sw = { x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, on: false, id: e.pointerId };
  });
  drawer.addEventListener("pointermove", (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
      if (dx < 8) return;
      sw.on = true; drawer.setPointerCapture?.(e.pointerId); drawer.style.transition = "none";
    }
    sw.dx = Math.max(0, dx); drawer.style.translate = `${sw.dx}px 0`;
  });
  const swEnd = (e) => {
    if (!sw || e.pointerId !== sw.id) return; const s = sw; sw = null; if (!s.on) return;
    const v = s.dx / Math.max(1, e.timeStamp - s.t), shut = e.type === "pointerup" && (s.dx > drawer.offsetWidth * 0.3 || v > 0.6);
    drawer.style.transition = ""; drawer.style.translate = "";
    if (shut && drLayer?.drawer === drawer) drLayer.close(false);
  };
  drawer.addEventListener("pointerup", swEnd); drawer.addEventListener("pointercancel", swEnd);
}
// ———— 写在标记上：一次接上 ————
// bindOverlays(root = document)：
//   [data-pop="面板 id"]      点了开 / 关弹出面板
//   [data-fmenu="菜单 id"]    菜单按钮（贴着按钮弹，↓ 键也能打开）
//   [data-ctx="菜单 id"]      右键（或 Shift+F10、菜单键）在指针处弹菜单
//   [data-dlg="弹窗 id"]      打开弹窗；<dialog class="dlg"> 里的 [data-x] / [data-cancel] 关闭
//   [data-drawer="抽屉 id"]   打开抽屉；抽屉里的 [data-x] 关闭
// 已经接过的不会重复接；内容是脚本后加的，加完再调一次就行
export function bindOverlays(root = document) {
  const byId = (id) => document.getElementById(id);
  for (const m of root.querySelectorAll(".sn-menu.sn-float")) {
    if (m._wired) continue; m._wired = true; m.tabIndex = -1;
    for (const it of m.querySelectorAll(".sn-item")) { it.setAttribute("role", "menuitem"); if (it.dataset.sub) it.setAttribute("aria-haspopup", "menu"); if (it.classList.contains("sn-is-off")) it.setAttribute("aria-disabled", "true"); }
  }
  for (const t of root.querySelectorAll("[data-pop]")) {
    if (t._wired) continue; t._wired = true; const pop = byId(t.dataset.pop); if (!pop) continue;
    t.setAttribute("aria-haspopup", "dialog"); t.setAttribute("aria-expanded", "false");
    t.addEventListener("click", () => { const l = popoverOf(pop); l ? l.close(false) : openPopover(pop, t, { align: pop.dataset.align }); }); // data-align="end"：和按钮右边对齐
  }
  for (const b of root.querySelectorAll("[data-fmenu]")) {
    if (b._wired) continue; b._wired = true; const mEl = byId(b.dataset.fmenu); if (!mEl) continue;
    b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", (e) => { if (menuOpenFor(b)) { closeMenu(false); return; } openMenu(mEl, { trigger: b, anchor: b, keyboard: e.detail === 0 }); });
    b.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" && !sys) { e.preventDefault(); openMenu(mEl, { trigger: b, anchor: b, keyboard: true }); } });
  }
  for (const zone of root.querySelectorAll("[data-ctx]")) {
    if (zone._wired) continue; zone._wired = true; const mEl = byId(zone.dataset.ctx); if (!mEl) continue;
    // 触屏：长按 500ms（手指没挪开 8px）打开。iOS Safari 长按不发 contextmenu；安卓会发，已经由长按打开过就不再开一次
    let lp = null;
    zone.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return; clearTimeout(lp?.t);
      const x = e.clientX, y = e.clientY;
      lp = { x, y, fired: false, t: setTimeout(() => { lp.fired = true; openMenu(mEl, { trigger: zone, x, y }); zone.classList.add("sn-active"); }, 500) };
    });
    const lpCancel = (e) => { if (!lp || lp.fired) return; if (e.type === "pointermove" && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) < 8) return; clearTimeout(lp.t); lp = null; };
    for (const t of ["pointermove", "pointerup", "pointercancel"]) zone.addEventListener(t, lpCancel);
    zone.addEventListener("contextmenu", (e) => { e.preventDefault(); if (lp?.fired) { lp = null; return; } openMenu(mEl, { trigger: zone, x: e.clientX, y: e.clientY }); zone.classList.add("sn-active"); });
    zone.addEventListener("keydown", (e) => {
      if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") { e.preventDefault(); const r = zone.getBoundingClientRect(); openMenu(mEl, { trigger: zone, x: r.left + 24, y: r.top + 24, keyboard: true }); zone.classList.add("sn-active"); }
    });
  }
  for (const d of root.querySelectorAll("dialog.sn-dlg")) wireDialog(d);
  for (const t of root.querySelectorAll("[data-dlg]")) { if (t._wired) continue; t._wired = true; t.addEventListener("click", () => { const d = byId(t.dataset.dlg); if (d) { wireDialog(d); openDialog(d, t); } }); }
  for (const d of root.querySelectorAll(".sn-drawer")) wireDrawer(d);
  for (const t of root.querySelectorAll("[data-drawer]")) { if (t._wired) continue; t._wired = true; t.addEventListener("click", () => { const d = byId(t.dataset.drawer); if (d) { wireDrawer(d); openDrawer(d, { trigger: t }); } }); }
}
// 展示页接线（demo/）要用的内部名字
export { EASE_IN, IN_OUT, OUT, esc };

// 页面级：浮层栈（Esc 关最上面那层、点外面关）、右键菜单（点条目、键盘）、失焦 / 窗口变宽变窄 / 页面滚动时收起右键菜单。setup() 里装一次
export function installOverlays() {
winW = innerWidth;
document.addEventListener("click", (e) => { if (!sys) return; const it = e.target.closest(".sn-menu.sn-float .sn-item"); if (it && sys.chain.some((m) => m.contains(it))) activate(it); });
document.addEventListener("keydown", (e) => {
  if (!sys) return;
  const m = sys.chain[sys.level] || sys.chain[0], rs = rows(m).filter((r) => !r.classList.contains("sn-is-off")), cur = rs.findIndex((r) => r.classList.contains("sn-hl"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = cur < 0 ? (e.key === "ArrowDown" ? 0 : rs.length - 1) : (cur + (e.key === "ArrowDown" ? 1 : -1) + rs.length) % rs.length; setHL(m, rs[n]); if (sys.chain[sys.level + 1] && sys.owner.get(sys.chain[sys.level + 1]) !== rs[n]) closeFrom(sys.level + 1); }
  else if (e.key === "ArrowRight" && rs[cur]?.dataset.sub) { e.preventDefault(); openSub(rs[cur], sys.level, true); }
  else if (e.key === "ArrowLeft" && sys.level > 0) { e.preventDefault(); const lv = sys.level; closeFrom(lv); sys.level = lv - 1; }
  else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(rs[cur]); }
  else if (e.key === "Tab") { e.preventDefault(); closeMenu(true); }
});
addEventListener("resize", () => { if (innerWidth === winW) return; winW = innerWidth; closeMenu(false); });
addEventListener("scroll", (e) => { if (sys && !e.target.closest?.(".sn-menu.sn-float")) closeMenu(false); }, { passive: true, capture: true });
}
