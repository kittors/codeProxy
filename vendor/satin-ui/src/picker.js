// UI 库设计稿：日期、时间、地址选择器。
// 1. 日期：单选和范围。换月时网格往所去的方向滑；点标题切到月份视图（年份用左右箭头换）。
//    键盘：方向键按天 / 周移动，PageUp / PageDown 换月，Home / End 到周一 / 周日，回车选中，Esc 收起并把焦点还给触发框。
// 2. 时间：时、分两列，原生滚动 + 吸附到中间那条选中带；点数字滚到中间；方向键一格、翻页键五格；"此刻"一键回到现在。
// 3. 定时发布：日历和时间放在一个面板里；早于现在的不能确定，原因写在面板底部。
// 4. 地址：省 → 市 → 区三级标签，选完一级自动滑到下一级；可以跨级搜索（命中的字加下划线）；常用城市一键到区县。
// 面板开合和菜单一样：第一帧就不透明，只放大 140ms；收起 100ms 淡出。只动 transform 和 opacity。
import { onCleanup } from "./lifecycle.js";
import { scrollArea } from "./scroll.js";
import { $, reduced, injectIcons } from "./core.js";
import { hitAny, pushDismiss, dropDismiss } from "./dismiss.js";
import { computeFloating, isAnchorOutOfView } from "./floating.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/picker.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
import { svg } from "./svg.js";
import { calendar, clock, mapPin, x as xIcon } from "./icons/index.js";
// bindPickers(root = document, { today, now })：把 root 里写了 data-pk 的选择器都接上——
//   data-pk="date"（日期）| "range"（日期范围，两个月并排、左边快捷预设）| "time"（时、分两列）| "datetime"（定时发布：日历 + 时间）| "region"（省 / 市 / 区）。
//   选好时在宿主上发 pick 事件（冒泡，detail: { text }）；today / now 默认是真实的今天、现在。接过的不重复接
export function bindPickers(root = document, { today, now } = {}) {
  // root 自己就是选择器（createPicker 传进来的）也算上；document 没有 matches，照旧只找里面的
  const $$ = (q, r = root) => [...(r === root && r.matches?.(q) ? [r] : []), ...r.querySelectorAll(q)].filter((h) => !q.startsWith("[data-pk") || (!h._pk && (h._pk = true)));
  const WK = tt("picker.0"), TODAY = today || new Date(new Date().setHours(0, 0, 0, 0)), NOW = now || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const same = (a, b) => !!a && !!b && ymd(a) === ymd(b);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmtDay = (d) => tt("picker.1", { p0: d.getFullYear() !== TODAY.getFullYear() ? tt("picker.142", { p0: d.getFullYear() }) : "", p1: d.getMonth() + 1, p2: d.getDate() });
  const fmtFull = (d) => tt("picker.2", { p0: fmtDay(d), p1: WK[d.getDay()] });
  const EASE = "cubic-bezier(.22,1,.36,1)";

  // ———— 面板开合（统一走 floating.js + dismiss.js：精准命中触发框与面板、避让顶栏与视口边缘自动翻转、捕获阶段外部关闭、Esc / 失焦收起） ————
  const openState = new WeakMap();
  const place = (h, autoCloseOnOut = false) => {
    const p = $(".sn-pk-panel", h), trig = $(".sn-pk-trigger", h);
    if (!p || !trig) return;
    if (autoCloseOnOut && isAnchorOutOfView(trig)) { close(h, false); return; }
    const pos = computeFloating(p, trig, { gap: 6, margin: 12 });
    p.classList.toggle("sn-up", pos.up);
    p.classList.toggle("sn-end", pos.end);
    pos.dx ? p.style.setProperty("--sn-pk-dx", `${pos.dx}px`) : p.style.removeProperty("--sn-pk-dx");
    pos.dy ? p.style.setProperty("--sn-pk-dy", `${pos.dy}px`) : p.style.removeProperty("--sn-pk-dy");
    p.style.transformOrigin = `${pos.ox}px ${pos.oy}px`;
  };
  const close = (h, refocus) => {
    if (!h.classList.contains("sn-open")) return;
    h.classList.remove("sn-open");
    const st = openState.get(h);
    if (st) { openState.delete(h); dropDismiss(st.layer); st.offPos(); }
    if (refocus) $(".sn-pk-trigger", h)?.focus({ preventScroll: true });
  };
  const open = (h) => {
    const p = $(".sn-pk-panel", h), trig = $(".sn-pk-trigger", h);
    place(h, false);
    h.classList.add("sn-open"); h._onOpen?.();
    place(h, false);
    const onRe = () => place(h, false);
    const onSc = (e) => { if (p && (e.target === p || p.contains?.(e.target))) return; place(h, true); };
    addEventListener("resize", onRe);
    addEventListener("scroll", onSc, { passive: true, capture: true });
    addEventListener("satin-reposition", onRe);
    const layer = pushDismiss({
      panel: p || h,
      trigger: trig || h,
      close: (refocus) => close(h, refocus),
      contains: (t, path) => hitAny(t, path, [trig, p]),
    });
    openState.set(h, { layer, offPos: () => { removeEventListener("resize", onRe); removeEventListener("scroll", onSc, true); removeEventListener("satin-reposition", onRe); } });
  };
  function host(h) {
    const trig = $(".sn-pk-trigger", h), endSlot = $(".sn-end", trig);
    // 有值时点击右侧清除区（含图标本身与胶囊右端整个舒适热区）：一律只清空并保持关闭，绝不误弹面板
    const isClearHit = (e) => {
      if (!h.classList.contains("sn-has")) return false;
      if (e.target.closest?.(".sn-end")) return true;
      if (endSlot && typeof e.clientX === "number" && e.clientX > 0) {
        const er = endSlot.getBoundingClientRect();
        if (er.width > 0 && e.clientX >= er.left - 4) return true;
      }
      return false;
    };
    let clearedOnDown = false;
    trig.addEventListener("pointerdown", (e) => {
      clearedOnDown = false;
      if (e.button === 0 && isClearHit(e)) {
        clearedOnDown = true;
        e.preventDefault();
        e.stopPropagation();
        h._clear?.();
        close(h, false);
      }
    });
    trig.addEventListener("click", (e) => {
      if (clearedOnDown) { clearedOnDown = false; e.preventDefault(); e.stopPropagation(); return; }
      if (isClearHit(e)) { e.preventDefault(); e.stopPropagation(); h._clear?.(); close(h, false); return; }
      if (h.classList.contains("sn-open")) close(h); else open(h);
    });
    h.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && h.classList.contains("sn-open")) { e.preventDefault(); e.stopPropagation(); close(h, true); }
      if ((e.key === "ArrowDown" || e.key === "Enter") && e.target === trig && !h.classList.contains("sn-open")) { e.preventDefault(); open(h); }
    });
    onCleanup(() => close(h, false));
  }
  // 触发框里的值：换值时旧字淡出、新字从下面 2px 淡入；滚动时间列这类连续变化用 instant
  const setVal = (h, text, instant = false) => {
    if ((text || "") !== (h._pkv ?? "")) { h._pkv = text || ""; h.dispatchEvent(new CustomEvent("pick", { bubbles: true, detail: { text } })); } // 值变了：发 pick
    const v = $(".sn-pk-trigger .sn-val", h), has = !!text, next = text || v.dataset.ph; h.classList.toggle("sn-has", has);
    const put = () => { v.textContent = next; v.classList.toggle("sn-ph", !has); };
    if (instant || reduced() || v.textContent === next) { put(); return; }
    v.getAnimations().forEach((a) => a.cancel());
    v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80, easing: "ease-in" }).onfinish = () => { put(); v.animate([{ opacity: 0, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: EASE }); };
  };
  // 内容区换一屏：新的从所去方向滑进来，旧的往反方向滑走
  const swapIn = (oldEl, newEl, dir) => {
    if (reduced() || !dir) { oldEl.remove(); return; }
    const D = 22 * dir;
    oldEl.style.pointerEvents = "none";
    oldEl.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${-D}px)`, opacity: 0 }], { duration: 150, easing: "ease-in", fill: "forwards" }).onfinish = () => oldEl.remove();
    newEl.animate([{ transform: `translateX(${D}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: EASE });
  };

  // ———— 日历（一次显示一个月或两个月） ————
  // 范围选择：选了开始、还没选结束时，悬停处半透明预览这一段（跟着鼠标走，不加过渡）；点下结束日期时预览 120ms 补成实色。
  // 带子 32px 高（和选中的圆一样高），行与行之间留 4px 缝；行首行尾不收圆角，平平地接到下一行；只有起止两天是实心圆。
  function calendar(root, { range = false, min = null, months = 1, onPick, onPreview } = {}) {
    const multi = months > 1;
    root.classList.add("sn-cal"); root.classList.toggle("sn-multi", multi);
    const NAV = (d, lbl) => `<button class="sn-btn sn-ghost sn-sm sn-ibtn" type="button" data-nav="${d}" aria-label="${lbl}" data-i="chevron-${d < 0 ? "left" : "right"}"></button>`;
    const WKH = `<div class="sn-cal-wk">${[...tt("picker.135")].map((c) => `<span>${c}</span>`).join("")}</div>`;
    root.innerHTML = multi
      ? `<div class="sn-cal-body">${Array.from({ length: months }, (_, k) => `<div class="sn-cal-pane"><div class="sn-cal-ph">${k === 0 ? NAV(-1, tt("picker.136")) : "<i></i>"}<b class="sn-cal-t"></b>${k === months - 1 ? NAV(1, tt("picker.137")) : "<i></i>"}</div>${WKH}<div class="sn-cal-vp"><div class="sn-cal-grid" role="grid"></div></div></div>`).join("")}</div>`
      : `<div class="sn-cal-hd"><button class="sn-cal-title" type="button" aria-label="${tt("picker.3")}"><b class="sn-cal-t"></b><span data-i="chevron-down"></span></button><span class="sn-grow"></span>${NAV(-1, tt("picker.138"))}${NAV(1, tt("picker.139"))}</div>${WKH}<div class="sn-cal-vp"><div class="sn-cal-grid" role="grid"></div><div class="sn-cal-mv"></div></div>`;
    injectIcons(root);
    const titles = $$(".sn-cal-t", root), mv = $(".sn-cal-mv", root);
    let grids = $$(".sn-cal-grid", root), view = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), focusD = TODAY, sel = null, a = null, b = null, hover = null, mvYear = view.getFullYear();
    const monthOf = (k) => new Date(view.getFullYear(), view.getMonth() + k, 1);
    const mIdx = (d) => (d.getFullYear() - view.getFullYear()) * 12 + d.getMonth() - view.getMonth();
    const shown = (d) => { const m = mIdx(d); return m >= 0 && m < months; };
    const isDis = (d) => !!min && d < min;
    const inMonths = () => root.classList.contains("sn-months");
    const dayAt = (g, i) => addDays(g._start, i);
    function build(g, k) {
      const first = monthOf(k), start = addDays(first, -((first.getDay() + 6) % 7));
      g._start = start; g._month = first.getMonth();
      g.innerHTML = Array.from({ length: 42 }, (_, i) => `<button class="sn-d" type="button" tabindex="-1"><span>${addDays(start, i).getDate()}</span></button>`).join("");
    }
    function paint() {
      const end = b || hover, lo = a && end ? (end < a ? end : a) : null, hi = a && end ? (end < a ? a : end) : null, band = lo && hi && !same(lo, hi);
      root.classList.toggle("sn-pv", range && !!a && !b);
      grids.forEach((g, k) => {
        [...g.children].forEach((el, i) => {
          const d = dayAt(g, i), out = d.getMonth() !== g._month, live = !(multi && out);
          const on = live && (range ? same(d, a) || same(d, b) : same(d, sel));
          // 选了开始、还没点结束：鼠标或键盘焦点所在那天只描一圈边（hv），点下去才变实心——实心留给真正选定的日子
          const hv = live && range && !!a && !b && same(d, hover) && !same(d, a);
          let c = "sn-d"; if (out) c += " sn-out"; if (same(d, TODAY)) c += " sn-today"; if (isDis(d)) c += " sn-dis"; if (on) c += " sn-sel"; if (hv) c += " sn-hv";
          if (range && band && live) { if (d > lo && d < hi) c += " sn-in"; if (same(d, lo)) c += " sn-a"; if (same(d, hi)) c += " sn-b"; }
          if (el.className !== c) el.className = c;
          el.tabIndex = live && same(d, focusD) ? 0 : -1; el.setAttribute("aria-selected", String(on)); el.setAttribute("aria-label", fmtFull(d));
        });
        if (titles[k]) titles[k].textContent = inMonths() ? tt("picker.4", { p0: mvYear }) : tt("picker.5", { p0: monthOf(k).getFullYear(), p1: monthOf(k).getMonth() + 1 });
      });
    }
    // 换月：几个月一起换，新网格从所去方向滑进来，旧的往反方向滑走
    function setView(v, dir) {
      view = new Date(v.getFullYear(), v.getMonth(), 1);
      grids = grids.map((old, k) => { const g = document.createElement("div"); g.className = "sn-cal-grid"; g.setAttribute("role", "grid"); old.after(g); build(g, k); swapIn(old, g, dir); return g; });
      paint();
    }
    // 让某一天（或某一段）出现在视图里；已经看得见就不动
    function reveal(x, y = x) {
      if (shown(x) && shown(y)) return false;
      const mx = new Date(x.getFullYear(), x.getMonth(), 1), my = new Date(y.getFullYear(), y.getMonth(), 1);
      const span = (my.getFullYear() - mx.getFullYear()) * 12 + my.getMonth() - mx.getMonth();
      const nv = span < months ? mx : new Date(my.getFullYear(), my.getMonth() - (months - 1), 1);
      setView(nv, nv < view ? -1 : 1); return true;
    }
    const cellOf = (d) => { for (const g of grids) { const i = Math.round((d - g._start) / 864e5); if (i >= 0 && i < 42 && !(multi && g.children[i].classList.contains("sn-out"))) return g.children[i]; } return null; };
    const pop = (d) => { if (reduced()) return; const el = cellOf(d); if (!el) return; el.classList.remove("sn-d-pop"); void el.offsetWidth; el.classList.add("sn-d-pop"); };
    // 确认结束日期、重置时：带子用 120ms 补成实色 / 淡掉；平时（悬停预览）直接变，不拖尾巴
    let settleT = 0;
    const settle = () => { if (reduced()) return; root.classList.add("sn-settle"); clearTimeout(settleT); settleT = setTimeout(() => root.classList.remove("sn-settle"), 160); };
    const renderMonths = () => { mv.innerHTML = Array.from({ length: 12 }, (_, m) => `<button type="button" class="${mvYear === view.getFullYear() && m === view.getMonth() ? "sn-cur" : ""}${mvYear === TODAY.getFullYear() && m === TODAY.getMonth() ? " sn-now" : ""}" data-m="${m}">${m + 1}${tt("picker.6")}</button>`).join(""); };
    const toggleMonths = (on = !inMonths()) => { if (!mv) return; mvYear = view.getFullYear(); if (on) renderMonths(); root.classList.toggle("sn-months", on); paint(); if (on) $(".sn-cal-mv button.sn-cur", root)?.focus({ preventScroll: true }); };
    function pick(d) {
      focusD = d; reveal(d);
      if (!range) { sel = d; paint(); pop(d); onPick?.(d); return; }
      if (!a || b) { a = d; b = null; hover = null; } else if (d < a) { b = a; a = d; } else b = d;
      if (b) settle(); paint(); pop(d); onPick?.(a, b);
    }
    root.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) { const n = +nav.dataset.nav; if (inMonths()) { mvYear += n; renderMonths(); paint(); } else setView(monthOf(n), n); return; }
      if (e.target.closest(".sn-cal-title")) { toggleMonths(); return; }
      const m = e.target.closest(".sn-cal-mv button");
      if (m) { const to = new Date(mvYear, +m.dataset.m, 1), dir = Math.sign(to - view); root.classList.remove("sn-months"); if (dir) setView(to, dir); else paint(); return; }
      const cell = e.target.closest(".sn-cal-grid .sn-d"); if (!cell || cell.classList.contains("sn-dis") || (multi && cell.classList.contains("sn-out"))) return;
      pick(dayAt(cell.parentElement, [...cell.parentElement.children].indexOf(cell)));
    });
    // 范围：选了开始、还没选结束时，悬停预览这一段（底部同时写出天数）
    root.addEventListener("pointerover", (e) => {
      if (!range || !a || b) return; const cell = e.target.closest(".sn-cal-grid .sn-d"); if (!cell || (multi && cell.classList.contains("sn-out"))) return;
      const nd = dayAt(cell.parentElement, [...cell.parentElement.children].indexOf(cell));
      if (!same(nd, hover)) { hover = nd; paint(); onPreview?.(a, hover); }
    });
    root.addEventListener("pointerleave", () => { if (range && a && !b && hover) { hover = null; paint(); onPreview?.(a, null); } });
    root.addEventListener("keydown", (e) => {
      if (!e.target.closest(".sn-cal-grid")) return;
      const k = e.key, step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k], wd = (focusD.getDay() + 6) % 7;
      let nd = null;
      if (step) nd = addDays(focusD, step);
      else if (k === "PageUp" || k === "PageDown") nd = new Date(focusD.getFullYear(), focusD.getMonth() + (k === "PageUp" ? -1 : 1), Math.min(focusD.getDate(), 28));
      else if (k === "Home") nd = addDays(focusD, -wd);
      else if (k === "End") nd = addDays(focusD, 6 - wd);
      else if (k === "Enter" || k === " ") { e.preventDefault(); if (!isDis(focusD)) pick(focusD); return; }
      if (!nd) return; e.preventDefault(); focusD = nd; if (range && a && !b) { hover = nd; onPreview?.(a, nd); }
      if (!reveal(nd)) paint();
      cellOf(focusD)?.focus({ preventScroll: true });
    });
    grids.forEach((g, k) => build(g, k)); paint();
    return {
      set(d) { sel = d; focusD = d; if (!shown(d)) { view = new Date(d.getFullYear(), d.getMonth(), 1); grids.forEach((g, k) => build(g, k)); } paint(); },
      setRange(x, y) { a = x; b = y; hover = null; focusD = y; settle(); if (!reveal(x, y)) paint(); },
      clear() { settle(); sel = a = b = hover = null; paint(); },
      get: () => (range ? { a, b } : sel),
      focus() { root.classList.remove("sn-months"); paint(); cellOf(focusD)?.focus({ preventScroll: true }); },
    };
  }

  // ———— 时间列 ————
  function timeCols(root, { step = 5, onChange } = {}) {
    const ITEM = 32;
    const col = (k, n, st) => `<div class="sn-tcol" data-k="${k}" tabindex="0" role="listbox" aria-label="${k === "h" ? tt("picker.140") : tt("picker.141")}"><div class="sn-tpad"></div>${Array.from({ length: n / st }, (_, i) => `<button class="sn-t" type="button" tabindex="-1" role="option" data-v="${i * st}">${pad(i * st)}</button>`).join("")}<div class="sn-tpad"></div></div>`;
    root.classList.add("sn-tcols"); root.innerHTML = `<i class="sn-tband"></i>${col("h", 24, 1)}<span class="sn-tsep">:</span>${col("m", 60, step)}`;
    const cols = $$(".sn-tcol", root), val = { h: 20, m: 30 };
    for (const c of cols) scrollArea(c, { fade: "none", bar: "hover", overscroll: "contain" }); // 时、分两列：滚动区域的细滚动条（悬停才出），滚到头停住
    const idxOf = (c) => Math.max(0, Math.min(c.querySelectorAll(".sn-t").length - 1, Math.round(c.scrollTop / ITEM)));
    const mark = (c) => { const i = idxOf(c), items = c.querySelectorAll(".sn-t"); items.forEach((t, j) => { t.classList.toggle("sn-on", j === i); t.setAttribute("aria-selected", String(j === i)); }); return +items[i].dataset.v; };
    const to = (c, i, smooth) => c.scrollTo({ top: i * ITEM, behavior: smooth && !reduced() ? "smooth" : "auto" });
    for (const c of cols) {
      let raf = 0;
      c.addEventListener("scroll", () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const v = mark(c); if (val[c.dataset.k] !== v) { val[c.dataset.k] = v; onChange?.({ ...val }); } }); }, { passive: true });
      c.addEventListener("click", (e) => { const t = e.target.closest(".sn-t"); if (!t) return; to(c, [...c.querySelectorAll(".sn-t")].indexOf(t), true); c.focus({ preventScroll: true }); });
      c.addEventListener("keydown", (e) => { const n = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key]; if (!n) return; e.preventDefault(); to(c, idxOf(c) + n, true); });
    }
    return {
      set(h, m, smooth = false) { val.h = h; val.m = Math.round(m / step) * step % 60; to(cols[0], h, smooth); to(cols[1], val.m / step, smooth); if (!smooth) cols.forEach(mark); },
      get: () => ({ ...val }), focus: () => cols[0].focus({ preventScroll: true }),
    };
  }

  // ———— 1. 日期（单选） ————
  for (const h of $$('[data-pk="date"]')) {
    host(h); const panel = $(".sn-pk-panel", h);
    const cal = calendar($(".sn-cal-slot", panel), { onPick: (d) => { setVal(h, fmtFull(d)); setTimeout(() => close(h, true), 140); } });
    h._clear = () => { cal.clear(); setVal(h, ""); };
    h._onOpen = () => cal.focus();
    $("[data-today]", panel).addEventListener("click", () => { cal.set(TODAY); setVal(h, fmtFull(TODAY)); setTimeout(() => close(h, true), 140); });
    $("[data-clear]", panel).addEventListener("click", () => h._clear());
  }

  // ———— 2. 日期范围：左边快捷项，两个月并排；底部"重置"随时清空重选 ————
  for (const h of $$('[data-pk="range"]')) {
    host(h); const panel = $(".sn-pk-panel", h), note = $(".sn-pk-foot .sn-note", panel), ok = $("[data-ok]", panel), rst = $("[data-reset]", panel), pre = $(".sn-pk-presets", panel);
    const days = (a, b) => Math.round((b - a) / 864e5) + 1, fmtR = (a, b) => tt("picker.7", { p0: fmtDay(a), p1: fmtDay(b), p2: days(a, b) });
    const state = (a, b, pv = null) => {
      const lo = pv && pv < a ? pv : a, hi = pv && pv < a ? a : pv;
      note.textContent = b ? fmtR(a, b) : pv ? fmtR(lo, hi) : a ? tt("picker.8") : tt("picker.9");
      note.classList.toggle("sn-pv", !b && !!pv);
      ok.setAttribute("aria-disabled", String(!b)); rst.setAttribute("aria-disabled", String(!a));
    };
    const mark = (btn) => pre.querySelectorAll("button").forEach((o) => o.classList.toggle("sn-on", o === btn));
    const cal = calendar($(".sn-cal-slot", panel), { range: true, months: 2, onPick: (a, b) => { mark(null); state(a, b); }, onPreview: (a, hv) => state(a, null, hv) });
    const PRE = { today: () => [TODAY, TODAY], d7: () => [addDays(TODAY, -6), TODAY], d30: () => [addDays(TODAY, -29), TODAY], month: () => [new Date(2026, 10, 1), TODAY], last: () => [new Date(2026, 9, 1), new Date(2026, 9, 31)] };
    pre.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const [x, y] = PRE[b.dataset.p](); cal.setRange(x, y); mark(b); state(x, y); });
    rst.addEventListener("click", () => { cal.clear(); mark(null); state(null, null); cal.focus(); });
    ok.addEventListener("click", () => { const r = cal.get(); if (!r.b) return; setVal(h, fmtR(r.a, r.b)); close(h, true); });
    h._clear = () => { cal.clear(); setVal(h, ""); mark(null); state(null, null); };
    h._onOpen = () => cal.focus();
    state(null, null);
  }

  // ———— 3. 时间 ————
  for (const h of $$('[data-pk="time"]')) {
    host(h); const panel = $(".sn-pk-panel", h); let cur = { h: 20, m: 30 }, picked = false;
    const tc = timeCols($(".sn-tc-slot", panel), { step: 5, onChange: (v) => { cur = v; if (picked) setVal(h, `${pad(v.h)}:${pad(v.m)}`, true); } });
    h._onOpen = () => { tc.set(cur.h, cur.m); requestAnimationFrame(() => { picked = true; tc.focus(); }); };
    h._clear = () => { picked = false; setVal(h, ""); };
    $("[data-now]", panel).addEventListener("click", () => tc.set(NOW.getHours(), NOW.getMinutes(), true));
    $("[data-ok]", panel).addEventListener("click", () => { picked = true; setVal(h, `${pad(cur.h)}:${pad(cur.m)}`); close(h, true); });
  }

  // ———— 4. 定时发布：日历 + 时间 ————
  for (const h of $$('[data-pk="datetime"]')) {
    host(h); const panel = $(".sn-pk-panel", h), note = $(".sn-pk-foot .sn-note", panel), ok = $("[data-ok]", panel);
    let day = addDays(TODAY, 1), tm = { h: 20, m: 30 };
    const check = () => {
      const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), tm.h, tm.m), bad = t < NOW;
      note.textContent = bad ? tt("picker.10", { p0: NOW.getMonth() + 1, p1: NOW.getDate(), p2: pad(NOW.getHours()), p3: pad(NOW.getMinutes()) }) : tt("picker.11", { p0: fmtFull(day), p1: pad(tm.h), p2: pad(tm.m) });
      note.classList.toggle("sn-bad", bad); ok.setAttribute("aria-disabled", String(bad)); ok.dataset.tip = bad ? tt("picker.12") : ""; return !bad;
    };
    const cal = calendar($(".sn-cal-slot", panel), { min: TODAY, onPick: (d) => { day = d; check(); } });
    const tc = timeCols($(".sn-tc-slot", panel), { step: 5, onChange: (v) => { tm = v; check(); } });
    cal.set(day);
    h._onOpen = () => { tc.set(tm.h, tm.m); check(); requestAnimationFrame(() => cal.focus()); };
    h._clear = () => setVal(h, "");
    ok.addEventListener("click", () => { if (!check()) return; setVal(h, `${fmtFull(day)} ${pad(tm.h)}:${pad(tm.m)}`); close(h, true); });
  }

  // ———— 5. 地址：省 → 市 → 区 ————
  const REG = {
    "北京市": { "北京市": [tt("picker.13"), tt("picker.14"), tt("picker.15"), tt("picker.16"), tt("picker.17"), tt("picker.18"), tt("picker.19"), tt("picker.20"), tt("picker.21"), tt("picker.22")] },
    "上海市": { "上海市": [tt("picker.23"), tt("picker.24"), tt("picker.25"), tt("picker.26"), tt("picker.27"), tt("picker.28"), tt("picker.29"), tt("picker.30"), tt("picker.31"), tt("picker.32")] },
    "广东省": { "广州市": [tt("picker.33"), tt("picker.34"), tt("picker.35"), tt("picker.36"), tt("picker.37"), tt("picker.38"), tt("picker.39"), tt("picker.40"), tt("picker.41")], "深圳市": [tt("picker.42"), tt("picker.43"), tt("picker.44"), tt("picker.45"), tt("picker.46"), tt("picker.47"), tt("picker.48"), tt("picker.49"), tt("picker.50")], "珠海市": [tt("picker.51"), tt("picker.52"), tt("picker.53")] },
    "浙江省": { "杭州市": [tt("picker.54"), tt("picker.55"), tt("picker.56"), tt("picker.57"), tt("picker.58"), tt("picker.59"), tt("picker.60"), tt("picker.61"), tt("picker.62"), tt("picker.63")], "宁波市": [tt("picker.64"), tt("picker.65"), tt("picker.66"), tt("picker.67"), tt("picker.68"), tt("picker.69")], "温州市": [tt("picker.70"), tt("picker.71"), tt("picker.72"), tt("picker.73")] },
    "江苏省": { "南京市": [tt("picker.74"), tt("picker.75"), tt("picker.76"), tt("picker.77"), tt("picker.78"), tt("picker.79"), tt("picker.80"), tt("picker.81")], "苏州市": [tt("picker.82"), tt("picker.83"), tt("picker.84"), tt("picker.85"), tt("picker.86")] },
    "四川省": { "成都市": [tt("picker.87"), tt("picker.88"), tt("picker.89"), tt("picker.90"), tt("picker.91"), tt("picker.92"), tt("picker.93"), tt("picker.94"), tt("picker.95"), tt("picker.96")], "绵阳市": [tt("picker.97"), tt("picker.98"), tt("picker.99")] },
    "湖北省": { "武汉市": [tt("picker.100"), tt("picker.101"), tt("picker.102"), tt("picker.103"), tt("picker.104"), tt("picker.105"), tt("picker.106")] },
    "陕西省": { "西安市": [tt("picker.107"), tt("picker.108"), tt("picker.109"), tt("picker.110"), tt("picker.111"), tt("picker.112"), tt("picker.113")] },
    "福建省": { "福州市": [tt("picker.77"), tt("picker.114"), tt("picker.115"), tt("picker.116"), tt("picker.117")], "厦门市": [tt("picker.118"), tt("picker.119"), tt("picker.120"), tt("picker.121"), tt("picker.122"), tt("picker.123")] },
    "重庆市": { "重庆市": [tt("picker.124"), tt("picker.65"), tt("picker.125"), tt("picker.126"), tt("picker.127"), tt("picker.128")] },
  };
  const disp = (p) => p.filter((x, i) => i === 0 || x !== p[i - 1]).join(" / "); // 直辖市不重复写"北京市 / 北京市"
  for (const h of $$('[data-pk="region"]')) {
    host(h); const panel = $(".sn-pk-panel", h), q = $(".sn-rg-search input", panel), tabsEl = $(".sn-rg-tabs", panel), ink = $(".sn-ink", tabsEl), vp = $(".sn-rg-vp", panel), res = $(".sn-rg-res", panel);
    let path = [], level = 0, list = null, hl = -1;
    const boxOf = (el) => (el.parentElement?.classList.contains("sn-sa") ? el.parentElement : el); // 包了滚动区域的列表：显隐、滑动都作用在外面那一层
    const resHidden = res.hidden; scrollArea(res, { fade: "y", size: 20, overscroll: "contain" }); boxOf(res).hidden = res.hidden; res.hidden = false;
    onCleanup(() => { res.hidden = resHidden; }); // 撤销时（组件销毁、enhance 的撤销函数）把搜索结果列表的 hidden 还回去：滚动区域拆掉以后，再接一次和第一次一模一样
    const optsAt = (lv) => (lv === 0 ? Object.keys(REG) : lv === 1 ? Object.keys(REG[path[0]]) : REG[path[0]][path[1]]);
    const moveInk = () => { const b = $(`button[data-lv="${level}"]`, tabsEl); if (b) ink.style.transform = `translateX(${b.offsetLeft + 8}px) scaleX(${Math.max(8, b.offsetWidth - 16)})`; };
    function tabs() {
      tabsEl.querySelectorAll("button").forEach((b) => b.remove());
      for (let i = 0; i <= level; i++) { const b = document.createElement("button"); b.type = "button"; b.dataset.lv = i; b.textContent = path[i] || tt("picker.129"); b.classList.toggle("sn-ph", !path[i]); tabsEl.insertBefore(b, ink); }
      moveInk();
    }
    function fill(lv, dir = 0) {
      const nl = document.createElement("div"); nl.className = "sn-rg-list"; nl.setAttribute("role", "listbox");
      nl.innerHTML = optsAt(lv).map((n) => `<button type="button" role="option"${path[lv] === n ? ' class="sn-on" aria-selected="true"' : ""}>${esc(n)}</button>`).join("");
      vp.insertBefore(nl, boxOf(res)); hl = -1;
      scrollArea(nl, { fade: "y", size: 20, overscroll: "contain" }); // 每一级的列表都是一个滚动区域；换级时整块（连滚动条）滑走
      if (list) swapIn(boxOf(list), boxOf(nl), dir); list = nl;
      const on = $(".sn-on", nl); if (on) nl.scrollTop = Math.max(0, on.offsetTop - nl.clientHeight / 2 + on.offsetHeight / 2); // 只滚列表自己，不能用 scrollIntoView（会把整个页面也拽过去）
    }
    const goLevel = (lv, dir) => { level = lv; tabs(); fill(lv, dir); };
    const finish = () => { setVal(h, disp(path)); setTimeout(() => close(h, true), 120); };
    function choose(name) { path = path.slice(0, level); path[level] = name; if (level < 2) goLevel(level + 1, 1); else { tabs(); list.querySelectorAll("button").forEach((b) => b.classList.toggle("sn-on", b.textContent === name)); finish(); } }
    vp.addEventListener("click", (e) => {
      const b = e.target.closest(".sn-rg-list button"); if (b) { choose(b.textContent); return; }
      const r = e.target.closest(".sn-rg-res button"); if (r) { path = r.dataset.path.split("/"); q.value = ""; showRes(false); goLevel(2, 0); finish(); }
    });
    tabsEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const lv = +b.dataset.lv; if (lv !== level) goLevel(lv, lv < level ? -1 : 1); });
    $(".sn-rg-hot", panel).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; path = b.dataset.path.split("/"); q.value = ""; showRes(false); goLevel(2, 1); });
    // 搜索：省、市、区都能搜，命中的字加下划线；回车选第一条，上下键挑
    const mark = (s, w) => esc(s).split(esc(w)).join(`<mark>${esc(w)}</mark>`);
    const keep = (el) => { const box = el.parentElement, t = el.offsetTop, b = t + el.offsetHeight; if (t < box.scrollTop) box.scrollTop = t; else if (b > box.scrollTop + box.clientHeight) box.scrollTop = b - box.clientHeight; };
    const showRes = (on) => { boxOf(res).hidden = !on; if (list) boxOf(list).hidden = on; };
    q.addEventListener("input", () => {
      const s = q.value.trim(); showRes(!!s); if (!s) return;
      const out = [];
      for (const [p, cs] of Object.entries(REG)) for (const [c, ds] of Object.entries(cs)) for (const d of ds) if (d.includes(s) || c.includes(s) || p.includes(s)) out.push([p, c, d]);
      hl = out.length ? 0 : -1;
      res.innerHTML = out.length ? out.slice(0, 40).map(([p, c, d], i) => `<button type="button" class="${i === 0 ? "sn-hl" : ""}" data-path="${p}/${c}/${d}"><b>${mark(d, s)}</b><span>${p === c ? mark(p, s) : `${mark(p, s)} / ${mark(c, s)}`}</span></button>`).join("") : `<div class="sn-none">${tt("picker.130")}"${esc(s)}"${tt("picker.131")}"${tt("picker.132")}"${tt("picker.133")}"${tt("picker.134")}"</div>`;
    });
    panel.addEventListener("keydown", (e) => {
      const inSearch = !res.hidden, items = inSearch ? [...res.querySelectorAll("button")] : [...(list?.querySelectorAll("button") || [])];
      if (!items.length) return;
      const cols = inSearch ? 1 : 3, n = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: inSearch ? 0 : 1, ArrowLeft: inSearch ? 0 : -1 }[e.key];
      if (n != null && n !== 0 && (inSearch || e.target !== q)) { e.preventDefault(); hl = Math.max(0, Math.min(items.length - 1, (hl < 0 ? 0 : hl + n))); items.forEach((b, i) => b.classList.toggle("sn-hl", i === hl)); keep(items[hl]); }
      else if (e.key === "ArrowDown" && e.target === q) { e.preventDefault(); hl = 0; items.forEach((b, i) => b.classList.toggle("sn-hl", i === 0)); }
      else if (e.key === "Enter" && hl >= 0) { e.preventDefault(); items[hl].click(); }
    });
    h._onOpen = () => { q.value = ""; showRes(false); goLevel(path.length === 3 ? 2 : Math.min(path.length, 2), 0); requestAnimationFrame(() => { moveInk(); q.focus({ preventScroll: true }); }); };
    h._clear = () => { path = []; setVal(h, ""); };
  }
  void injectIcons;
}

// ———— 标记：pickerHTML({ kind, placeholder, label }) ————
// 生成一个选择器的标记，和设计稿（index.html"选择器"一节）里写的一模一样——只是图标已经是 <svg>（设计稿写 data-i，enhance() 换成同样的 <svg>），
// 所以空容器里渲染、服务端渲染出来的第一帧就是接上交互以后的样子。createPicker.html 就是它（React、Vue、Svelte 的 DatePicker 都靠它渲染）。
//   kind：date（默认）| range | time | datetime | region
//   placeholder：还没选时触发框里的字；不写按种类给（"选择日期""选择开始和结束日期"……）
//   label：面板（role="dialog"）的读屏名称；不写时日期、时间、定时发布和 placeholder 一样，范围是"选择日期范围"，地址是"选择地址"
const PK = { date: ["calendar", calendar, 0, "picker.143"], range: ["calendar", calendar, 260, "picker.144"], time: ["clock", clock, 140, "picker.146"], datetime: ["calendar", calendar, 250, "picker.147"], region: ["map-pin", mapPin, 250, "picker.148"] };
// 常用城市：一键到市（地名是数据，不翻译）
const HOT = [["北京市/北京市", "北京"], ["上海市/上海市", "上海"], ["广东省/广州市", "广州"], ["广东省/深圳市", "深圳"], ["浙江省/杭州市", "杭州"], ["四川省/成都市", "成都"]];
const escH = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function pickerHTML({ kind = "date", placeholder, label } = {}) {
  const [icName, icPaths, minW, phKey] = PK[kind] || PK.date; if (!PK[kind]) kind = "date";
  const ph = escH(placeholder || tt(phKey)), name = escH(label || (kind === "range" ? tt("picker.145") : kind === "region" ? tt("picker.149") : ph));
  const btn = (look, attr, key) => `<button class="sn-btn sn-${look} sn-sm" type="button" ${attr}>${tt(key)}</button>`, grow = `<span class="sn-grow"></span>`, note = `<span class="sn-note"></span>`;
  const trigger = `<button class="sn-pk-trigger" type="button" aria-haspopup="dialog"><span class="sn-val sn-ph" data-ph="${ph}">${ph}</span><span class="sn-end sn-swap"><span class="sn-a">${svg(icPaths, 16, icName)}</span><span class="sn-b" role="button" aria-label="${tt("picker.150")}">${svg(xIcon, 16, "x")}</span></span></button>`;
  const body = {
    date: `<div class="sn-cal-slot"></div><div class="sn-pk-foot">${btn("ghost", "data-today", "picker.151")}${grow}${btn("ghost", "data-clear", "picker.150")}</div>`,
    range: `<div class="sn-pk-range"><div class="sn-pk-presets">${[["today", "picker.151"], ["d7", "picker.152"], ["d30", "picker.153"], ["month", "picker.154"], ["last", "picker.155"]].map(([p, k]) => `<button type="button" data-p="${p}">${tt(k)}</button>`).join("")}</div><div class="sn-cal-slot"></div></div>`
      + `<div class="sn-pk-foot">${btn("ghost", "data-reset", "picker.156")}${note}${grow}${btn("primary", "data-ok", "picker.157")}</div>`,
    time: `<div class="sn-tc-slot"></div><div class="sn-pk-foot">${btn("ghost", "data-now", "picker.158")}${grow}${btn("primary", "data-ok", "picker.157")}</div>`,
    datetime: `<div class="sn-pk-dt"><div class="sn-cal-slot"></div><div class="sn-tside"><span class="sn-cap">${tt("picker.159")}</span><div class="sn-tc-slot"></div></div></div><div class="sn-pk-foot">${note}${grow}${btn("primary", "data-ok", "picker.157")}</div>`,
    region: `<div class="sn-rg-search"><input class="sn-input sn-sm" type="text" enterkeyhint="search" placeholder="${tt("picker.160")}" aria-label="${tt("picker.161")}"></div>`
      + `<div class="sn-rg-hot">${tt("picker.162")}${HOT.map(([p, t]) => `<button type="button" data-path="${p}">${t}</button>`).join("")}</div>`
      + `<div class="sn-rg-tabs" role="tablist"><span class="sn-ink"></span></div><div class="sn-rg-vp"><div class="sn-rg-res sn-sa-vp sn-fy" role="listbox" hidden></div></div>`,
  }[kind];
  return `<div class="sn-pk" data-pk="${kind}"${minW ? ` style="min-width:${minW}px"` : ""}>${trigger}<div class="sn-pk-panel${kind === "region" ? " sn-rg" : ""}" role="dialog" aria-label="${name}">${body}</div></div>`;
}
