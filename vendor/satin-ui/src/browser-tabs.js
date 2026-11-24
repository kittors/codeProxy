// Chrome 浏览器式平滑弧形页标签（工作台顶栏）：
// · 壳层底槽（--sn-shell）上，激活页签顶圆角 10px、底部左右 10px 平滑反向外弧与下方主工作板（--sn-workspace）完全同色无缝融合
// · 非激活页签之间极淡 1px×14px 竖分隔线，相邻激活 / 悬停时淡出；悬停出现 8px 柔和胶囊底
// · 支持图标、状态圆点、固定不可关（pinned）、关闭（× 与鼠标中键）、右侧 + 新建、滚轮横滚与键盘左右切换
import { icon } from "./icons.js";
import { reduced } from "./core.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/browser-tabs.js";

const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cx = (...a) => a.filter(Boolean).join(" ");
const TONE = { ok: "sn-ok", warn: "sn-warn", bad: "sn-bad" };

const normTabs = (tabs = []) => tabs.filter(Boolean).map((t, i) => ({
  id: String(t.id ?? i),
  title: String(t.title ?? t.label ?? ""),
  icon: t.icon ?? null,
  dot: t.dot ?? null,
  pinned: !!t.pinned,
  closable: t.pinned ? false : t.closable !== false,
}));

const ARC_L = '<svg class="sn-btab-arc sn-arc-l" viewBox="0 0 10 10" aria-hidden="true"><path d="M10 0 A10 10 0 0 1 0 10 L10.5 10 L10.5 0 Z" fill="currentColor"/></svg>';
const ARC_R = '<svg class="sn-btab-arc sn-arc-r" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0 A10 10 0 0 0 10 10 L-0.5 10 L-0.5 0 Z" fill="currentColor"/></svg>';

function tabItemHTML(t, on) {
  const ic = t.icon ? `<span class="sn-btab-ic">${icon(t.icon, 14)}</span>` : "";
  const dot = t.dot ? `<span class="${cx("sn-btab-dot", TONE[t.dot])}" aria-hidden="true"></span>` : "";
  const close = t.closable ? `<span class="sn-btab-x" role="button" tabindex="-1" data-btab-close aria-label="${esc(tt("btabs.close", { p0: t.title }))}">${icon("x", 12)}</span>` : "";
  return `<button type="button" class="${cx("sn-btab", on && "sn-on", t.pinned && "sn-pinned")}" role="tab" data-btab-id="${esc(t.id)}" aria-selected="${on ? "true" : "false"}" tabindex="${on ? "0" : "-1"}">${ARC_L}${ARC_R}<span class="sn-btab-pill" aria-hidden="true"></span>${ic}${dot}<span class="sn-btab-t">${esc(t.title)}</span>${close}<span class="sn-btab-sep" aria-hidden="true"></span></button>`;
}

export function browserTabsHTML(o = {}) {
  const list = normTabs(o.tabs);
  const active = o.active != null && list.some((t) => t.id === String(o.active)) ? String(o.active) : (list[0]?.id ?? null);
  const addBtn = o.addable !== false ? `<button type="button" class="sn-btabs-add" data-btab-add aria-label="${esc(o.addLabel ?? tt("btabs.add"))}" data-tip="${esc(o.addLabel ?? tt("btabs.add"))}">${icon("plus", 14)}</button>` : "";
  const extra = o.extraHTML ? `<div class="sn-btabs-end">${o.extraHTML}</div>` : "";
  return `<div class="sn-btabs" role="tablist" aria-label="${esc(o.label ?? tt("btabs.list"))}"><div class="sn-btabs-track">${list.map((t) => tabItemHTML(t, t.id === active)).join("")}${addBtn}</div>${extra}</div>`;
}

export function mountBrowserTabs(root, o0 = {}, emit) {
  let o = { addable: true, ...o0 };
  const fire = emit || ((t, d) => o["on" + t[0].toUpperCase() + t.slice(1)]?.(d));
  let list = normTabs(o.tabs);
  let active = o.active != null && list.some((t) => t.id === String(o.active)) ? String(o.active) : (list[0]?.id ?? null);
  const timers = new Set();
  const clearTimers = () => { for (const t of timers) clearTimeout(t); timers.clear(); };

  const track = () => root.querySelector(".sn-btabs-track");
  const paint = () => {
    clearTimers();
    const tr = track();
    if (!tr) return;
    const addBtn = o.addable !== false ? `<button type="button" class="sn-btabs-add" data-btab-add aria-label="${esc(o.addLabel ?? tt("btabs.add"))}" data-tip="${esc(o.addLabel ?? tt("btabs.add"))}">${icon("plus", 14)}</button>` : "";
    tr.innerHTML = list.map((t) => tabItemHTML(t, t.id === active)).join("") + addBtn;
  };
  if (!root.querySelector(".sn-btabs-track")) {
    root.innerHTML = browserTabsHTML({ ...o, tabs: list, active });
    const inner = root.firstElementChild;
    if (inner?.classList.contains("sn-btabs") && root.classList.contains("sn-btabs")) root.replaceChildren(...inner.childNodes);
  }

  const reveal = (id) => {
    const btn = root.querySelector(`.sn-btab[data-btab-id="${CSS.escape(String(id))}"]`);
    btn?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };
  const syncActiveDOM = () => {
    for (const b of root.querySelectorAll(".sn-btab:not([data-btab-leaving])")) {
      const on = b.dataset.btabId === active;
      b.classList.toggle("sn-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("tabindex", on ? "0" : "-1");
    }
  };
  const setActive = (id, user = false) => {
    const s = String(id);
    if (s === active || !list.some((t) => t.id === s)) return;
    active = s;
    syncActiveDOM();
    reveal(active);
    if (user) fire("change", { id: active, tab: list.find((t) => t.id === active) });
  };
  const closeId = (id, user = true) => {
    const s = String(id), idx = list.findIndex((t) => t.id === s);
    if (idx < 0 || !list[idx].closable) return;
    const closed = list[idx];
    const btn = root.querySelector(`.sn-btab[data-btab-id="${CSS.escape(s)}"]:not([data-btab-leaving])`);
    list.splice(idx, 1);
    let next = active;
    if (active === s) next = list[idx]?.id ?? list[idx - 1]?.id ?? null;
    active = next;
    if (user && btn && !reduced()) {
      // 仅对退场节点自身做平滑收窄淡出后移除，绝不整条重绘，避免连点关闭或紧接着新建页签时的动画打断与竞态
      btn.dataset.btabLeaving = "1";
      btn.classList.remove("sn-on");
      btn.setAttribute("aria-selected", "false");
      btn.setAttribute("tabindex", "-1");
      syncActiveDOM();
      btn.classList.add("sn-btab-leave");
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (btn.isConnected) btn.remove();
      }, 190);
      timers.add(timer);
    } else {
      paint();
    }
    if (user) {
      fire("close", { id: s, tab: closed, active });
      if (active != null) fire("change", { id: active, tab: list.find((t) => t.id === active) });
    }
  };

  const onClick = (e) => {
    const add = e.target.closest("[data-btab-add]");
    if (add && root.contains(add)) { fire("add", { tabs: list.slice() }); return; }
    const x = e.target.closest("[data-btab-close]");
    if (x && root.contains(x)) { e.stopPropagation(); const b = x.closest(".sn-btab"); if (b && !b.dataset.btabLeaving) closeId(b.dataset.btabId, true); return; }
    const b = e.target.closest(".sn-btab");
    if (b && root.contains(b) && !b.dataset.btabLeaving) setActive(b.dataset.btabId, true);
  };
  const onAux = (e) => {
    if (e.button !== 1) return;
    const b = e.target.closest(".sn-btab");
    if (b && root.contains(b) && !b.dataset.btabLeaving) { e.preventDefault(); closeId(b.dataset.btabId, true); }
  };
  const onWheel = (e) => {
    const tr = track();
    if (!tr || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (tr.scrollWidth > tr.clientWidth + 1) { tr.scrollLeft += e.deltaY; e.preventDefault(); }
  };
  const onKey = (e) => {
    const b = e.target.closest(".sn-btab"); if (!b || !root.contains(b)) return;
    const i = list.findIndex((t) => t.id === b.dataset.btabId); if (i < 0) return;
    let ni = -1;
    if (e.key === "ArrowRight") ni = (i + 1) % list.length;
    else if (e.key === "ArrowLeft") ni = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") ni = 0;
    else if (e.key === "End") ni = list.length - 1;
    if (ni >= 0) {
      e.preventDefault();
      setActive(list[ni].id, true);
      root.querySelector(`.sn-btab[data-btab-id="${CSS.escape(list[ni].id)}"]`)?.focus();
    }
  };

  root.addEventListener("click", onClick);
  root.addEventListener("auxclick", onAux);
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("keydown", onKey);

  return {
    get active() { return active; },
    get tabs() { return list.slice(); },
    activate(id) { setActive(id, false); },
    add(tab, activateNew = true) {
      const item = normTabs([tab])[0]; if (!item) return;
      const exists = list.find((t) => t.id === item.id);
      if (exists) { if (activateNew) setActive(exists.id, false); return; }
      list.push(item);
      if (activateNew || active == null) active = item.id;
      paint();
      const added = root.querySelector(`.sn-btab[data-btab-id="${CSS.escape(item.id)}"]`);
      if (added && !reduced()) {
        added.classList.add("sn-btab-enter");
        void added.offsetWidth;
        added.classList.remove("sn-btab-enter");
      }
      reveal(active);
    },
    close(id) { closeId(id, false); },
    update(next = {}, prev = o) {
      o = { ...o, ...next };
      if (next.tabs && next.tabs !== prev.tabs) list = normTabs(next.tabs);
      if (next.active != null && String(next.active) !== String(prev.active)) active = String(next.active);
      if (active == null || !list.some((t) => t.id === active)) active = list[0]?.id ?? null;
      paint();
    },
    destroy() {
      clearTimers();
      root.removeEventListener("click", onClick);
      root.removeEventListener("auxclick", onAux);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("keydown", onKey);
    },
  };
}
