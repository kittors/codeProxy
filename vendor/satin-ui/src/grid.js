// 数据表格 · DOM 版（十万行也只画看得见的行）。表头、筛选、选项弹层、列模型也给 Canvas 版（canvas-grid.js）用。
// - 只渲染看得见的行：行池环形复用（位置 p 固定用第 p % 池大小 行），滚动时只有新进来的行换内容；
// - 表头和每一行用同一套 CSS 网格轨道（--gcols）：列换位置只改一张 order 样式表，列宽只改一个变量，所有行一起变；
// - 左右固定列用 sticky，横向滚开时固定列边上出一道阴影；
// - 数据按块懒加载（table-source.js），还没到的行显示静止的占位条，到了 120ms 淡入；
// - 列：点表头排序；拖表头换位置（放下时看得见的格子用 FLIP 滑到新位置）；拖右边缘改宽，双击右边缘按内容自适应；列头筛选；
// - 行：拖左边的把手换位置（其他行让位，拖到边上自动滚），Alt + 上下键也能挪；勾选（Shift 连选，表头全选）；
// - 格子：单击选中，方向键、Tab、Home/End、PageUp/PageDown 移动；双击、回车、F2 或直接打字开始编辑；回车、Tab 提交，Esc 取消；不合法就红框加一句原因，不提交。
import { $, injectIcons, initSeg, reduced, retip } from "./core.js";
import { computeFloating } from "./floating.js";
import { normCols, optionOf, optionValue, optionLabels, textOf, parseEdit, editText, parseRange, rangeText, ownerSeed } from "./table-data.js";
import { presetAvatar } from "./avatar-presets.js";
import { gridBars } from "./grid-bars.js";
import { elastic } from "./scroll.js";
import { createSource, hasFilter } from "./table-source.js";
// 表格框的高度（表头 + 行，不含工具条）：数字是 px；不给是 480px
export const heightCSS = (h) => (h == null || h === "" ? "" : typeof h === "number" ? h + "px" : String(h));
export const setGridHeight = (root, h) => { const v = heightCSS(h); if (v) root.style.setProperty("--sn-g-h", v); else root.style.removeProperty("--sn-g-h"); };
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mk = (t, c, hid) => { const e = document.createElement(t); if (c) e.className = c; if (hid) e.setAttribute("aria-hidden", "true"); return e; };
import { backendOf } from "./table-backends.js";
import { toast } from "./feedback.js";
import { BOX, EASE, EASE_CSS, contentW, liftIn, popCheck, tween } from "./form.js";
import { icon } from "./icons.js";
import { scoped } from "./i18n.js";
import { defineComponent } from "./lifecycle.js";
import I18N_DEFAULTS from "./locales/zh-CN/grid.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
export const RH = 40, HEAD = 40;
// ———— 列模型：左固定 + 中间（可换位置）+ 右固定 ————
// cols：整理过的列定义（table-data.js 的 normCols）；primary 是主列（树形缩进、展开箭头、详情箭头、编辑名称都在这一列）
// 格子、表头上除了 data-c 以外的标记：样式里主列、勾选列、操作列按 data-c="name / sel / act" 写，键名不是这几个的另外带 data-primary / data-t
export const colAttrs = (m, c) => (c.key === m.primary && c.key !== "name" ? " data-primary" : "") + (c.type === "sel" && c.key !== "sel" ? ' data-t="sel"' : "") + (c.type === "act" && c.key !== "act" ? ' data-t="act"' : "") + (c.type === "time" && c.key !== "upd" ? ' data-t="time"' : ""); // 设计稿那几列（name、sel、act、upd）的标记和改造前一样，样式两种都认
export function columnModel(cols = []) {
  const m = { cols: cols.map((c) => ({ ...c })) };
  m.primary = (m.cols.find((c) => c.primary) || m.cols.find((c) => c.type !== "sel" && c.type !== "act"))?.key ?? "";
  m.byKey = Object.fromEntries(m.cols.map((c) => [c.key, c]));
  m.left = m.cols.filter((c) => c.pin === "left").map((c) => c.key);
  m.mid = m.cols.filter((c) => !c.pin).map((c) => c.key);
  m.right = m.cols.filter((c) => c.pin === "right").map((c) => c.key);
  m.display = () => [...m.left, ...m.mid, ...m.right].map((k) => m.byKey[k]);
  m.width = () => m.display().reduce((s, c) => s + c.w, 0);
  m.leftW = () => m.left.reduce((s, k) => s + m.byKey[k].w, 0);
  m.rightW = () => m.right.reduce((s, k) => s + m.byKey[k].w, 0);
  m.xOf = (key) => { let x = 0; for (const c of m.display()) { if (c.key === key) return x; x += c.w; } return x; };
  return m;
}
// ———— 弹层：贴着一个矩形出现，下面放不下就放上面；点外面、Esc 关 ————
const pops = new Set(); // 开着的弹层：表格销毁时一起关
export const closeGridPops = () => { for (const p of [...pops]) p.close(); };
function popover(rect, html, cls = "") {
  const el = document.createElement("div"); el.className = `sn-menu sn-float sn-g-pop ${cls}`; el.innerHTML = html; document.body.append(el);
  const pos = computeFloating(el, rect, { gap: 4, margin: 8 });
  el.style.left = pos.left + "px"; el.style.top = pos.top + "px";
  el.style.transformOrigin = `${pos.ox}px ${pos.oy}px`;
  el.classList.toggle("sn-up", pos.up);
  requestAnimationFrame(() => { if (pops.has(api)) el.classList.add("sn-open"); });
  let onClose = null;
  const close = () => {
    if (!pops.delete(api)) return;
    removeEventListener("pointerdown", out, true); removeEventListener("keydown", key, true);
    el.classList.remove("sn-open");
    if (reduced()) el.remove(); else setTimeout(() => el.remove(), 180);
    onClose?.();
  };
  const out = (e) => { if (!el.contains(e.target)) close(); };
  const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  setTimeout(() => { if (pops.has(api)) { addEventListener("pointerdown", out, true); addEventListener("keydown", key, true); } });
  const api = { el, close, set onClose(f) { onClose = f; } }; pops.add(api);
  return api;
}
// 选项（编辑状态、负责人、类型）：上下键选，回车确定
export function openEnum(rect, col, cur, onPick, onCancel) {
  const opts = optionLabels(col); let hl = cur;
  const p = popover(rect, opts.map((o, k) => `<div class="sn-item${k === cur ? " sn-sel" : ""}" data-k="${k}">${o}<span class="sn-chk">${icon("check", 16)}</span></div>`).join(""), "sn-g-enum");
  const items = [...p.el.querySelectorAll(".sn-item")], paint = () => items.forEach((x, k) => x.classList.toggle("sn-hl", k === hl));
  let picked = false; paint();
  p.el.addEventListener("pointermove", (e) => { const it = e.target.closest(".sn-item"); if (it) { hl = +it.dataset.k; paint(); } });
  p.el.addEventListener("click", (e) => { const it = e.target.closest(".sn-item"); if (it) { picked = true; p.close(); onPick(+it.dataset.k); } });
  const key = (e) => { if (!p.el.isConnected) return removeEventListener("keydown", key, true);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); hl = (hl + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length; paint(); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); picked = true; p.close(); onPick(hl, e.key === "Tab" ? (e.shiftKey ? -1 : 1) : 0); } };
  addEventListener("keydown", key, true);
  p.onClose = () => { removeEventListener("keydown", key, true); if (!picked) onCancel?.(); };
  return p;
}
// 列头筛选：选项列是多选，时长是范围；改了就筛（选项 200ms 后，范围点"应用"）
export function openFilter(btn, col, src) {
  const q = src.query, r = btn.getBoundingClientRect();
  if (col.filter === "enum") {
    const opts = optionLabels(col), on = new Set(q.filters?.[col.key] || []);
    const p = popover(r, `<div class="sn-g-fhead">${esc(col.title)}</div><div class="sn-pop-checks">${opts.map((o, k) => `<label class="sn-check"><input type="checkbox" data-k="${k}"${on.has(k) ? " checked" : ""}>${BOX}${esc(o)}</label>`).join("")}</div><div class="sn-sep"></div><div class="sn-item sn-g-fclear">${tt("grid.0")}</div>`, "g-filter"); // 选项用组件库的复选框列表（和"弹出面板"里的筛选一样）
    const put = (v) => ({ ...src.query, filters: { ...src.query.filters, [col.key]: v } });
    let t = 0; const apply = () => { clearTimeout(t); t = setTimeout(() => src.setQuery(put([...on].sort((a, b) => a - b))), 200); };
    p.el.addEventListener("change", (e) => { const i = e.target; if (i.dataset.k == null) return; const k = +i.dataset.k; i.checked ? on.add(k) : on.delete(k); apply(); });
    p.el.addEventListener("click", (e) => { if (e.target.closest(".sn-g-fclear")) { on.clear(); p.el.querySelectorAll("input[data-k]").forEach((i) => (i.checked = false)); src.setQuery(put([])); p.close(); } });
    return p;
  }
  const fr = q.filters?.[col.key] || {};
  const p = popover(r, `<div class="sn-g-fhead">${esc(col.title)}${col.type === "dur" ? tt("grid.1") : ""}</div><div class="sn-g-frange"><input class="sn-input sn-sm" data-min placeholder="${tt("grid.2")}" value="${fr.min ?? ""}"><span>–</span><input class="sn-input sn-sm" data-max placeholder="${tt("grid.3")}" value="${fr.max ?? ""}"></div><div class="sn-g-facts"><button class="sn-btn sn-ghost sn-sm" data-clear>${tt("grid.4")}</button><button class="sn-btn sn-primary sn-sm" data-apply>${tt("grid.5")}</button></div>`, "g-filter");
  const val = (s) => parseRange(col, s);
  const go = (clear) => { src.setQuery({ ...src.query, filters: { ...src.query.filters, [col.key]: clear ? null : { min: val(p.el.querySelector("[data-min]").value), max: val(p.el.querySelector("[data-max]").value) } } }); p.close(); };
  p.el.querySelector("[data-apply]").addEventListener("click", () => go(false)); p.el.querySelector("[data-clear]").addEventListener("click", () => go(true));
  p.el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(false); });
  setTimeout(() => p.el.querySelector("[data-min]")?.focus({ preventScroll: true }));
  return p;
}
// ———— 表头：排序、筛选、拖列换位置、拖边改宽；DOM 版和 Canvas 版共用 ————
// opt: { root, vp, src, injectIcons, apply(): 重新套用列, motion(): 列的位移 / 透明度变了，当场画一帧并接着画到停, autosize(key): 按内容算宽度, onSelAll(), selState() }
export function mountHead(head, model, opt) {
  head.innerHTML = model.cols.map((c) => `<div class="sn-g-hc${c.align === "right" ? " sn-r" : ""}${c.fixed ? "" : " sn-mv"}" data-c="${c.key}"${colAttrs(model, c)} role="columnheader">${c.type === "sel" ? `<span class="sn-check" data-all role="checkbox" aria-checked="false" aria-label="${tt("grid.46")}">${BOX}</span>` : c.type === "act" ? "" : `<span class="sn-g-ht">${esc(c.title)}</span>${c.sort ? '<span class="sn-g-sort" data-i="arrow-up"></span>' : ""}${c.filter ? `<button class="sn-g-fb" data-i="list-filter" aria-label="${tt("grid.47")}${esc(c.title)}"></button>` : ""}${c.resize === false ? "" : '<i class="sn-g-rz"></i>'}`}</div>`).join("");
  opt.injectIcons(head);
  const paint = () => {
    const s = opt.src.query.sort;
    for (const hc of head.children) {
      const k = hc.dataset.c, c = model.byKey[k]; hc.classList.toggle("sn-sorted", s?.key === k); hc.classList.toggle("sn-desc", s?.key === k && s.dir < 0);
      hc.setAttribute("aria-sort", s?.key === k ? (s.dir > 0 ? "ascending" : "descending") : "none");
      const f = opt.src.query.filters?.[k]; hc.classList.toggle("sn-filtered", c.filter === "enum" ? !!f?.length : c.filter === "range" ? f?.min != null || f?.max != null : false);
    }
    const st = opt.selState(); const all = head.querySelector("[data-all]"); if (!all) return; all.classList.toggle("sn-on", st === "all"); all.classList.toggle("sn-mixed", st === "some"); all.setAttribute("aria-checked", st === "all" ? "true" : st === "some" ? "mixed" : "false");
  };
  head.addEventListener("click", (e) => {
    if (e.target.closest("[data-all]")) { opt.onSelAll(); if (opt.selState() !== "none") popCheck(head.querySelector("[data-all] .sn-box")); return; }
    const fb = e.target.closest(".sn-g-fb"); if (fb) { e.stopPropagation(); openFilter(fb, model.byKey[fb.parentElement.dataset.c], opt.src); }
  });
  head.addEventListener("dblclick", (e) => { const rz = e.target.closest(".sn-g-rz"); if (rz) { const key = rz.parentElement.dataset.c; glideW(model.byKey[key], opt.autosize(key)); } });
  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".sn-g-fb, [data-all]")) return;
    const hc = e.target.closest(".sn-g-hc"); if (!hc) return; landCol?.(); const key = hc.dataset.c, col = model.byKey[key];
    if (e.target.closest(".sn-g-rz")) { startResize(e.target.closest(".sn-g-rz"), key, e); return; }
    // 按住表头：横着移动 4px 才算拖列，不然抬起就是点表头排序
    const x0 = e.clientX; let drag = null, done = false; try { hc.setPointerCapture(e.pointerId); } catch {}
    const mv = (ev) => { if (done) return; if (!drag) { if (col.fixed || Math.abs(ev.clientX - x0) < 4) return; drag = startColDrag(hc, key, ev); } drag.move(ev.clientX, ev.clientY); };
    const onKey = (ev) => { if (ev.key === "Escape" && drag) { ev.preventDefault(); ev.stopPropagation(); fin("cancel"); } }, onBlur = () => fin("cancel");
    const evs = [["pointermove", mv], ["pointerup", () => fin("up")], ["pointercancel", () => fin("cancel")], ["lostpointercapture", () => fin("cancel")]];
    for (const [t, f] of evs) hc.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
    function fin(how) {
      if (done) return; done = true; for (const [t, f] of evs) hc.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur);
      if (drag) { drag.drop(how !== "up"); return; }
      if (how === "up" && col.sort) { const s = opt.src.query.sort; opt.src.setSort(s?.key !== key ? { key, dir: 1 } : s.dir > 0 ? { key, dir: -1 } : null); } // 点表头：升 → 降 → 不排
    }
  });
  const reduced = () => opt.reduced?.() ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 宽度不跟着指针变的时候（Esc 恢复、双击按内容定宽）：从现在的宽度滑过去，每帧照常重排；又按下改宽就停在当前宽度
  let stopW = null;
  const glideW = (col, to) => { stopW?.(); stopW = null; if (reduced() || Math.abs(to - col.w) < 1) { col.w = to; opt.apply(); return; } stopW = tween({ w: col.w }, { w: to }, ({ w }, end) => { col.w = Math.round(w); opt.apply(); if (end) stopW = null; }); };
  // ———— 列的位移和被拖那一列的透明度：DOM 版、Canvas 版共用一份状态，各自画 ————
  // 换顺序：每一列从看到的位置滑到新位置（上一段没走完就从当前位置接着走）；被拖的那一列淡到 35%，松手淡回来。
  // 值都按时间算，由各表在画的时候取（DOM 版写进一张样式表；Canvas 版表头写样式表、表身画的时候用）。
  // 不给每一格单独开 WAAPI 动画：格子多时一下子建一堆合成层，起手那一帧会卡；动画刚开始那一帧要是样式表被改写，还会被打断一帧
  const COL_DUR = 220, offs = new Map(); let dim = null; /* offs：列 → 从 x0 滑回 0；dim：被拖那一列的透明度从 a0 到 a1 */
  const offNow = (k, now = performance.now()) => { const o = offs.get(k); if (!o) return 0; const t = (now - o.t0) / COL_DUR; return t >= 1 ? 0 : o.x0 * (1 - EASE.outStrong(Math.max(0, t))); };
  const dimNow = (k, now = performance.now()) => (dim && dim.key === k ? dim.a0 + (dim.a1 - dim.a0) * EASE.out(Math.min(1, Math.max(0, (now - dim.t0) / dim.dur))) : 1);
  const moving = (now = performance.now()) => { for (const [k, o] of offs) if (now - o.t0 >= COL_DUR) offs.delete(k); if (dim && now - dim.t0 >= dim.dur && dim.a1 >= 1) dim = null; return offs.size > 0 || (!!dim && now - dim.t0 < dim.dur); }; /* 还在动吗（动就接着画下一帧）；走完的顺手清掉 */
  const motionCss = (id, body, now = performance.now()) => { /* 表头（DOM 版连表身）这一帧的位移和透明度，写成样式；拖列时的空位也跟着这一列挪 */
    const sel = (k) => `${id} .sn-g-head [data-c="${k}"]` + (body ? `,${id} .sn-g-body [data-c="${k}"]` : ""); let css = ""; paintSlot(now);
    for (const k of offs.keys()) { const x = offNow(k, now); if (Math.abs(x) > .01) css += `${sel(k)}{translate:${x.toFixed(2)}px 0}`; }
    if (dim) { const a = dimNow(dim.key, now); if (a < .999) css += `${sel(dim.key)}{opacity:${a.toFixed(3)}}`; }
    return css;
  };
  function moveCols(next) {
    if (next.join() === model.mid.join()) return; const now = performance.now(), x0 = new Map(model.mid.map((k) => [k, model.xOf(k) + offNow(k, now)]));
    model.mid = next; opt.apply();
    if (reduced()) offs.clear(); else for (const k of next) { const d = x0.get(k) - model.xOf(k); if (Math.abs(d) < .5) offs.delete(k); else offs.set(k, { x0: d, t0: now }); }
    opt.motion();
  }
  const dimCol = (k, a1, dur) => { const now = performance.now(); dim = { key: k, a0: dim?.key === k ? dimNow(k, now) : a1 < 1 ? 1 : .35, a1, t0: now, dur: reduced() ? 1 : dur }; opt.motion(); };
  // 拖右边缘改宽：每帧最多套用一次；一条竖的参考线贯穿表格、旁边标出宽度；往右拖出可视区会自动往右滚、列接着变宽（边线一直留在看得见的地方）；
  // Esc 恢复原来的宽度；窗口失焦、指针被系统收走就停在当前宽度；双击右边缘按内容自动定宽
  function startResize(rz, key, e) {
    e.preventDefault(); e.stopPropagation(); stopW?.(); stopW = null;
    const col = model.byKey[key], w0 = col.w, x0 = e.clientX, vp = opt.vp, fr = vp.parentElement, side = model.left.includes(key) ? "L" : model.right.includes(key) ? "R" : "M";
    const line = document.createElement("i"); line.className = "sn-g-rzline"; fr.append(line); opt.root.classList.add("sn-resizing");
    let px = x0, raf = 0, scrolled = 0, done = false;
    // 这一列右边在视口里的位置：左固定列不随横滚，右固定列贴着右边，中间列减去横滚
    const right = () => { const x = model.xOf(key) + col.w; return side === "L" ? x : side === "R" ? vp.clientWidth - (model.width() - x) : x - vp.scrollLeft; };
    const step = () => {
      raf = 0; const edgeX = vp.getBoundingClientRect().left + (side === "L" ? vp.clientWidth : vp.clientWidth - model.rightW()) - 2; // 边线最远到可见区的边上，超出的距离只用来决定横滚多快
      const w = Math.max(col.minW ?? 64, Math.min(480, Math.round(w0 + Math.min(px, edgeX) - x0 + scrolled))); if (w !== col.w) { col.w = w; opt.apply(); }
      const x = right(); line.style.left = x - 1 + "px"; line.style.height = vp.clientHeight + "px"; line.dataset.w = tt("grid.6", { p0: col.w }); line.classList.toggle("sn-flip", x > vp.clientWidth - 96);
      const over = px - (vp.getBoundingClientRect().left + vp.clientWidth - model.rightW() - 16);
      if (side === "M" && over > 0 && col.w < 480) { const s = vp.scrollLeft; vp.scrollLeft = s + Math.min(24, over / 2.5); scrolled += vp.scrollLeft - s; raf = requestAnimationFrame(step); }
    };
    step();
    try { rz.setPointerCapture(e.pointerId); } catch {}
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(); glideW(col, w0); } }; /* 参考线收起，宽度滑回原来的 */
    const evs = [["pointermove", (ev) => { px = ev.clientX; if (!raf) raf = requestAnimationFrame(step); }], ["pointerup", () => fin()], ["pointercancel", () => fin()], ["lostpointercapture", () => fin()]];
    for (const [t, f] of evs) rz.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", fin);
    function fin() { if (done) return; done = true; cancelAnimationFrame(raf); for (const [t, f] of evs) rz.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", fin); line.remove(); opt.root.classList.remove("sn-resizing"); if (col.w !== w0) opt.onResize?.(key, col.w); }
  }
  // 拖列（和简单表格、拖行一个手感）：这一整列（表头 + 表身看得见的那一段）浮起来跟着指针走，页面滚了也贴着表头那一行；
  // 它原来的地方变成空位（浅底 + 细边，和拖行的空位一样），别的列实时让开、从空位上滑过去；拖到边上横着自动滚。
  // 拖到表格外 40px 以外 = 拿出去了：各列回原位、浮起的列变淡，松手取消；Esc、窗口失焦也取消。
  // 松手：浮起的列滑进空位，落定了这一列现出来、浮起的那份淡掉。表身那一段由各表给（opt.colGhost：DOM 版克隆格子，Canvas 版从画布上拷）
  let slotKey = null, slotEl = null;
  const paintSlot = (now = performance.now()) => {
    if (!slotEl) return; const vp = opt.vp, c = model.byKey[slotKey], x = model.xOf(slotKey) + offNow(slotKey, now) - vp.scrollLeft;
    const h = Math.min(vp.clientHeight, head.offsetHeight + (opt.src.rowsH?.() ?? 1e9) - vp.scrollTop);
    slotEl.style.translate = `${x.toFixed(2)}px 0`; slotEl.style.width = c.w + "px"; slotEl.style.height = Math.max(0, h) + "px";
  };
  function startColDrag(hc, key, ev) {
    const vp = opt.vp, fr = vp.parentElement, r = hc.getBoundingClientRect();
    const ghost = document.createElement("div"), hcl = hc.cloneNode(true); ghost.className = "sn-g-ghost sn-g-colghost"; hcl.querySelector(".sn-g-rz")?.remove(); hcl.classList.add("sn-g-gh-head"); hcl.style.removeProperty("translate"); hcl.style.removeProperty("opacity"); hcl.style.order = "-1"; hcl.style.position = "relative"; /* 表格的样式表按 data-c 给每一列排了 order、固定列 sticky：克隆出来的表头格子也会命中，这里压住 */
    ghost.append(hcl); const part = opt.colGhost?.(key); if (part) { part.classList.add("sn-g-gh-body"); ghost.append(part); }
    const top0 = head.getBoundingClientRect().top;
    Object.assign(ghost.style, { left: r.left + "px", top: top0 + "px", width: r.width + "px", translate: "0px 0px" }); opt.root.append(ghost); liftIn(ghost); // 起点定好以后只动 translate（跟手、落位都是），不改 left / top
    slotEl = document.createElement("i"); slotEl.className = "sn-g-gap sn-g-colgap"; fr.prepend(slotEl); slotKey = key; head.style.background = "transparent"; paintSlot(); /* 表头底色透明：被拖那一格淡掉时露出后面的空位（别的格子自己有底）。只改表头自己，不给整张表加类名，免得整表重算样式 */
    const dx0 = ev.clientX - r.left, home = [...model.mid], rest = home.filter((k) => k !== key); let px = ev.clientX, py = ev.clientY, raf = 0, out = false;
    dimCol(key, 0, 160); /* 这一列淡出、浮起的那份淡入（同样 160ms），中间不会先变空一下 */
    // 放在哪：其余各列按原来的先后排好，这一列插在第 t 个前面时它左边在哪；浮起的列左边离哪个最近就放哪。只看位置，来回拖不会抖
    const target = () => { const gl = px - dx0 - vp.getBoundingClientRect().left + vp.scrollLeft; let x = model.leftW(), best = 0, bd = Infinity; for (let t = 0; t <= rest.length; t++) { const d = Math.abs(gl - x); if (d < bd) { bd = d; best = t; } if (t < rest.length) x += model.byKey[rest[t]].w; } return best; };
    const tick = () => {
      const b = fr.getBoundingClientRect(); out = px < b.left - 40 || px > b.right + 40 || py < b.top - 40 || py > b.bottom + 40;
      ghost.style.translate = `${px - dx0 - r.left}px ${head.getBoundingClientRect().top - top0}px`; ghost.classList.toggle("sn-away", out);
      if (!out) { const vr = vp.getBoundingClientRect(), lo = vr.left + model.leftW() + 32, hi = vr.left + vp.clientWidth - model.rightW() - 32, sp = px < lo ? -(lo - px) / 3 : px > hi ? (px - hi) / 3 : 0; if (sp) vp.scrollLeft += Math.max(-24, Math.min(24, sp)); }
      const t = target(); moveCols(out ? home : [...rest.slice(0, t), key, ...rest.slice(t)]); paintSlot(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      move(x, y) { px = x; py = y; },
      drop(cancel) {
        cancelAnimationFrame(raf); if (cancel || out) moveCols(home); else if (model.mid.join() !== home.join()) opt.onReorder?.(model.mid.slice());
        const land = () => { landCol = null; slotEl?.remove(); slotEl = null; slotKey = null; head.style.removeProperty("background"); dimCol(key, 1, 1); opt.motion(); if (reduced()) { ghost.remove(); return; } ghost.animate([{ opacity: getComputedStyle(ghost).opacity }, { opacity: 0 }], { duration: 120, easing: EASE_CSS.out, fill: "forwards" }).onfinish = () => ghost.remove(); };
        if (reduced()) { land(); return; }
        // 浮起的列滑进空位（空位可能还在滑：按它最后的位置），落定了再现出这一列
        const tx = vp.getBoundingClientRect().left + model.xOf(key) - vp.scrollLeft, ty = head.getBoundingClientRect().top - top0;
        const anim = ghost.animate([{ translate: ghost.style.translate || "0px 0px", opacity: getComputedStyle(ghost).opacity }, { translate: `${tx - r.left}px ${ty}px`, opacity: 1 }], { duration: COL_DUR, easing: EASE_CSS.outStrong, fill: "forwards" });
        landCol = () => { anim.cancel(); land(); }; anim.onfinish = land;
      },
    };
  }
  let landCol = null; /* 松手后浮起的列还在落位：再拖、再排序时先落好 */
  return { paint, offNow, dimNow, moving, motionCss, slotKey: () => slotKey, land: () => landCol?.() };
}
// ———— 工具条：搜索、加载方式、筛选标签、行数；DOM 版和 Canvas 版共用 ————
export function mountToolbar(root, src, model, { $, initSeg, seg, treeSeg, selCount, onMode, onTree, onExpandAll, rootsText = (n) => tt("grid.73", { p0: n.toLocaleString("zh-CN") }) }) {
  const info = $("[data-g-info]", root), chips = $("[data-g-filters]", root), q = $("[data-g-q]", root), xb = $("[data-g-expand]", root);
  function paint() {
    const qq = src.query, parts = [];
    if (qq.q?.trim()) parts.push(["q", tt("grid.7", { p0: esc(model.byKey[model.primary]?.title ?? ""), p1: esc(qq.q.trim()) })]);
    for (const [k, v] of Object.entries(qq.filters || {})) {
      const c = model.byKey[k]; if (!c || v == null) continue;
      if (Array.isArray(v)) { if (v.length) parts.push([k, tt("grid.78", { p0: esc(c.title), p1: esc(v.map((i) => optionLabels(c)[i]).join(tt("grid.79"))) })]); }
      else if (v.min != null || v.max != null) parts.push([k, tt("grid.8", { p0: esc(c.title), p1: esc(rangeText(c, v.min ?? 0)), p2: v.max != null ? esc(rangeText(c, v.max)) : tt("grid.48") })]);
    }
    if (chips) chips.innerHTML = parts.map(([k, t]) => `<span class="sn-chip sn-sm sn-on sn-g-chip" data-k="${esc(k)}">${t}<span class="sn-g-x" aria-label="${tt("grid.9")}">×</span></span>`).join("") + (parts.length ? tt("grid.10") : "");
    const sel = selCount(), tr = src.tree;
    if (info) info.innerHTML = src.busy ? tt("grid.11") : tt("grid.12", { p0: src.total.toLocaleString("zh-CN"), p1: tr && rootsText(src.roots) ? tt("grid.49", { p0: esc(rootsText(src.roots)) }) : "", p2: sel ? tt("grid.51", { p0: `<b>${sel.toLocaleString("zh-CN")}</b>`, p1: tr ? tt("grid.52") : tt("grid.53") }) : "" });
    if (xb) { xb.hidden = !tr; if (tr && !src.busy) xb.lastChild.textContent = src.allOpen() ? tt("grid.13") : tt("grid.14"); } // 树形模式：所有级一起展开 / 收起
  }
  chips?.addEventListener("click", (e) => {
    const nq = { ...src.query };
    if (e.target.closest("[data-clear-all]")) { src.setQuery({}); if (q) q.value = ""; return; }
    const c = e.target.closest(".sn-g-chip"); if (!c) return; const k = c.dataset.k;
    if (k === "q") { nq.q = ""; if (q) q.value = ""; } else nq.filters = { ...nq.filters, [k]: null };
    src.setQuery(nq);
  });
  let qt = 0; q?.addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => src.setQuery({ ...src.query, q: e.target.value }), 250); });
  const ms = $(`[data-seg="${seg}"]`, root), ts = treeSeg && $(`[data-seg="${treeSeg}"]`, root); // 工具条可以不带"加载方式""平铺 / 树形"（只有设计稿的演示带）
  if (ms) initSeg(ms, (v) => { src.setMode(v); onMode?.(); });
  if (ts) { if (!src.canTree) ts.hidden = true; else initSeg(ts, (v) => { clearTimeout(qt); if (q) q.value = ""; onTree(v === "tree"); }); } // 平铺 / 树形：两套视图，换了就清掉搜索和筛选
  xb?.addEventListener("click", () => onExpandAll());
  return { paint };
}
// 固定列阴影条的位置和高度：左边贴着左固定列的右边，右边贴着右固定列的左边（让开竖滚动条：常驻滚动条占的那一条也算）；
// 高度从表头顶到最后一行为止（行少时不伸进下面的空白，也不压横滚动条）。值没变就不写，避免每帧触发样式重算
export function shades(root, vp, model, rowsH) {
  const lw = model.leftW(), rw = model.rightW() + vp.parentElement.clientWidth - vp.clientWidth, h = Math.min(vp.clientHeight, HEAD + rowsH), k = lw + "|" + rw + "|" + h + "|" + vp.clientWidth;
  if (root._shk === k) return;
  root._shk = k; root.style.setProperty("--sn-g-lw", lw + "px"); root.style.setProperty("--sn-g-rw", rw + "px"); root.style.setProperty("--sn-g-shh", h + "px"); root.style.setProperty("--sn-vpw", vp.clientWidth + "px"); // --vpw：行详情贴着视口的宽度
}
// 横向箭头一步走到下一列：中间每一列的左边对齐到可滚区域左边时的 scrollLeft
export function colStops(model) { const out = []; let x = 0; for (const k of model.mid) { out.push(x); x += model.byKey[k].w; } return out; }
// 合并单元格分段：块内若有行展开了通栏行详情，把合并块在详情处自然分成多个连续子段，避免下段变成空白死洞或被底线割裂
export function mergeSegs(src, x, cellH) {
  const out = []; let s0 = x.p0, dhBefore = 0;
  for (let q = x.p0; q <= x.p1; q++) {
    const dh = q < x.p1 ? Math.max(0, src.rowH(q) - cellH(q)) : 0;
    if (dh > .5 || q === x.p1) { out.push({ p0: s0, p1: q, dhBefore, dhAfter: dh }); s0 = q + 1; dhBefore = dh; }
  }
  return out;
}
// 树形引导线（O(lv)）：返回 { anc: boolean[]（0..lv-2 祖先后面是否仍有兄弟）, last: boolean（本行是否直接父层末项）}
export function treeGuides(src, p) {
  const lv = src.lvAt(p);
  if (lv <= 0) return { anc: [], last: false };
  const isEnd = (q, l) => { const e = src.blockEnd(q); return e >= src.shown || src.lvAt(e) < l; };
  const anc = new Array(lv - 1).fill(false);
  let cur = src.idAt(p);
  for (let d = lv - 1; d >= 1; d--) {
    cur = src.parentOf(cur);
    if (cur < 0) break;
    const ap = src.findPos(cur);
    anc[d - 1] = ap >= 0 && !isEnd(ap, d);
  }
  return { anc, last: isEnd(p, lv) };
}
// 合并单元格：按行号记行（排序、筛选、拖行后行会换位置，数据源追踪它们现在排第几），按列名记列。
// 当前视图里这几行连续、这几列连续且在同一侧（左固定 / 中间 / 右固定）时才生效；排序、筛选、拖开了就暂时不显示，回来还在。
// 树形模式：合并不跨上级——块里的行必须是同一个上级下面的兄弟；中间那一行展开了（下级插进来）就不连续，暂时不显示，收起来又出来。平铺、树形各记各的
export function createMerges(src, model, isSplit) {
  const lists = { flat: [], tree: [] }; let ver = 0, ck = "", cache = [], on = true; /* on：表格是"网格"（行线 + 列线）时才显示合并；只有行线时合并格会像一个洞 */
  const cur = () => lists[src.tree ? "tree" : "flat"];
  const zoneOf = (k) => (model.left.includes(k) ? "L" : model.right.includes(k) ? "R" : "M");
  const sameParent = (ids) => !src.tree || ids.every((id) => src.parentOf(id) === src.parentOf(ids[0]));
  function compute() {
    const disp = model.display().map((c) => c.key), out = [];
    for (const m of cur()) {
      const p0 = src.posOf(m.ids[0]); let ok = p0 >= 0 && p0 + m.ids.length <= src.shown && sameParent(m.ids);
      for (let k = 1; ok && k < m.ids.length; k++) ok = src.posOf(m.ids[k]) === p0 + k;
      // 块内非末行展开了通栏行详情时（和树形展开下级插行一样）行不再视觉连续：暂时挂起合并，恢复各行独立单元格，收起后自动复原
      if (ok && isSplit) for (let k = 0; ok && k < m.ids.length - 1; k++) if (isSplit(p0 + k)) ok = false;
      const ci = m.keys.map((k) => disp.indexOf(k)).sort((a, b) => a - b);
      ok = ok && ci[0] >= 0 && ci.at(-1) - ci[0] === ci.length - 1 && m.keys.every((k) => zoneOf(k) === zoneOf(m.keys[0]));
      out.push({ m, ok, p0, p1: p0 + m.ids.length - 1, c0: ci[0], c1: ci.at(-1), keys: ci[0] >= 0 ? disp.slice(ci[0], ci.at(-1) + 1) : m.keys, key0: ci[0] >= 0 ? disp[ci[0]] : m.keys[0] });
    }
    return out;
  }
  const all = () => { const k = ver + "|" + on + "|" + src.tree + "|" + src.pver + "|" + src.shown + "|" + model.display().map((c) => c.key).join(); if (k !== ck) { ck = k; cache = compute().map((x) => (on ? x : { ...x, ok: false })); } return cache; };
  return {
    zoneOf,
    invalidate() { ver++; },
    active: () => all().filter((x) => x.ok),
    suspended: () => all().filter((x) => !x.ok).length,
    at(p, key) { for (const x of all()) if (x.ok && p >= x.p0 && p <= x.p1 && x.keys.includes(key)) return x; return null; },
    // 合并 p0..p1 行、keys 这几列（显示顺序里连续的列名）；有一行还没到就合并不了
    add(p0, p1, keys) { const ids = []; for (let p = p0; p <= p1; p++) { const id = src.rowAt(p); if (id < 0) return null; ids.push(id); } if (!sameParent(ids)) return null; ids.forEach((id, k) => src.track(id, p0 + k)); const m = { ids, keys: [...keys] }; cur().push(m); ver++; return m; },
    remove(m) { for (const k in lists) lists[k] = lists[k].filter((x) => x !== m); ver++; },
    restore(m) { if (!cur().includes(m)) cur().push(m); ver++; },
    // 树形模式：这几行（位置 p0..p1）是不是同一个上级下面的兄弟（不跨上级才能合并）
    siblings(p0, p1) { if (!src.tree) return true; const a = src.parentOf(src.idAt(p0)); for (let p = p0 + 1; p <= p1; p++) if (src.parentOf(src.idAt(p)) !== a) return false; return true; },
    get size() { return cur().length; },
    get enabled() { return on; }, set enabled(v) { on = !!v; },
  };
}
// ———— 树形模式：勾选上下级联动（两版表格共用） ————
// 勾一个节点 = 它下面所有级一起勾；上级的状态由下级算——下面全勾了是勾、勾了一部分是半选（和简单表格一样）。
// 行号先序，一个节点连同下级就是行号 [id, id + fsz)；pd[id] 记它下面勾了几个，上级是不是全勾了、是不是半选都是 O(1)
export function createTreeSel(src) {
  let on = null, pd = null, ver = 0, cv = -1, cnt = 0, sk = "", st = "none";
  function pick(x, v) {
    const { par, fsz } = src.tinfo(); if (!on) { on = new Uint8Array(src.n); pd = new Int32Array(src.n); } v = v ? 1 : 0; let d = 0;
    for (let y = x, e = x + fsz[x]; y < e; y++) { if (on[y] !== v) { on[y] = v; d += v ? 1 : -1; } pd[y] = v ? fsz[y] - 1 : 0; }
    for (let a = par[x]; a >= 0; a = par[a]) { pd[a] += d; const w = pd[a] === fsz[a] - 1 ? 1 : 0; if (on[a] !== w) { on[a] = w; d += w ? 1 : -1; } }
    ver++;
  }
  const has = (id) => !!on && on[id] === 1;
  return {
    has, mixed: (id) => !!on && on[id] === 0 && pd[id] > 0, pick, get ver() { return ver; },
    ids() { const out = []; if (on) for (let i = 0; i < on.length; i++) if (on[i]) out.push(i); return out; }, // 勾上的所有节点（先序）
    clear() { if (on) { on.fill(0); pd.fill(0); } ver++; },
    reset() { on = pd = null; ver++; }, // 换了一批数据（行数可能变了）：下次勾选按新的行数重新建
    // 数"最上面那一级被勾的"：整个项目勾了算 1 项
    count() { if (cv === ver) return cnt; cv = ver; cnt = 0; if (!on) return 0; const { par } = src.tinfo(), O = on; for (let i = 0; i < O.length; i++) if (O[i] && (par[i] < 0 || !O[par[i]])) cnt++; return cnt; },
    // 表头的全选：当前视图里第一级都勾了是"全选"，勾了任何一个是"部分"
    state() { const k = ver + "|" + src.sver; if (k === sk) return st; sk = k; const r = src.rootIds(); st = r.length && r.every(has) ? "all" : this.count() ? "some" : "none"; return st; },
    setAll(v) { for (const id of src.rootIds()) pick(id, v); },
  };
}
// ———— 树形模式：展开收起时行的位置变化（两版表格共用一份） ————
// 和简单表格同一套手感：先量现在看到的样子（包括还在过渡中的偏移和透明度），再改结构，再从看到的样子过渡到新样子；中途再改也接着走，不会跳。
//  · 位置变了的行滑过去（300ms ease.inOut）；新出现的行淡入、往下落 6px（220ms），同一个上级的一行行错开（最多 150ms）；
//  · 收起：下级先原地淡出（120ms），淡完了才从结构里去掉、下面的行让回来；淡出时又展开，接着淡回来；
//  · 一下走得太远（超过一屏）的不滑：原来看得见、要被推远的原地淡出，原来看不见、要进来的直接淡入——不会有一帧飞过整个视口；
//  · 第一个留下来的行在屏幕上不动（全部展开 / 收起时滚动位置跟着补），其余的围着它变；
//  · 动画用自己的钟，每帧最多走 25ms：哪一帧卡了（一下展开几百行），画面照样一小步一小步走，不会一下跳一大截。
// 值按时间算、按行号记，由各表在画的时候取：y(id) 这一帧的位移，op(id) 透明度；跑出渲染范围、还看得见的行由 extras() 给出位置接着画。
// o：{ reduced(), view() → { st, vh }（滚动位置、行区域的高）, scrollTo(st), sync()（马上按新的总高度撑开滚动区域）, after()（结构变了：当前格子等跟着挪） }
export function createRowMotion(src, o) {
  const items = new Map(), cur = new Map(), exits = new Set(), SLIDE = 300, ENTER = 220, FADE = 120, N = null; // N：起点等下一次画的时候再定
  let clock = 0, last = 0, on = false, pendAt = -1, fadeT0 = 0, pendNext = false;
  const willHide = (id) => { for (let a = src.parentOf(id); a >= 0; a = src.parentOf(a)) if (!src.isOpen(a)) return true; return false; }; // 上面有一级已经收起：commit 以后就看不见了
  const val = (it, t) => { const q = Math.max(0, Math.min(1, (t - (it.t0 ?? t) - it.d) / it.dur)), e = it.e(q); return { y: it.hold ? it.y0 : it.y0 * (1 - e), op: it.op1 < it.op0 ? it.op0 + (it.op1 - it.op0) * q : it.op0 + (it.op1 - it.op0) * (it.eo ? it.eo(q) : e), done: q >= 1 }; }; // eo：透明度单独的曲线（淡入用 EASE.out，起步缓一些：一帧长到 25ms 也只亮两成多） // 淡出匀速走满 120ms（每帧最多少 0.2，长帧也不会一下暗一大截）
  const evalAt = (t) => { cur.clear(); for (const [id, it] of items) { const v = val(it, t); if (v.done && !exits.has(id) && !(it.op1 === 0 && !it.hold)) { items.delete(id); continue; } cur.set(id, v); } };
  // 钟：每帧走一次，最多 25ms。事件里（点了、拖了）不走钟。新加的过渡不在加的时候定起点（t0 为 N），等下一次画的时候才定——
  // 点下去那一帧往往因为改结构而很长，起点要是在事件里定，画出来的第一帧就已经走了一截（淡入的行一出来就半透明）；正在走的过渡照常走
  const step = (now) => { if (on) clock += Math.max(0, Math.min(25, now - last)); last = now; for (const it of items.values()) if (it.t0 === N) it.t0 = clock; if (pendNext) { pendNext = false; pendAt = clock + FADE; fadeT0 = clock; } };
  const start = () => { on = true; evalAt(clock); };
  const queue = []; const flushQ = () => { while (queue.length && pendAt < 0 && !pendNext) queue.shift()(); }; // 等收起淡完再做的事（Alt + 上下挪行）
  const range = (st, vh) => [Math.max(0, src.rowAtY(st) - 2), Math.min(src.shown, src.rowAtY(st + vh) + 3)];
  // 现在看到的样子：渲染范围里每一行 + 正在动、跑出范围的行，按行号记内容坐标的 y（含位移）和透明度
  function snap() {
    const { st, vh } = o.view(), rows = new Map(), [a, z] = range(st, vh);
    for (let p = a; p < z; p++) { const id = src.idAt(p); rows.set(id, { y: src.rowY(p) + api.y(id), op: api.op(id), h: src.rowH(p) }); }
    for (const [id, it] of items) if (!rows.has(id) && it.p >= 0) { const p = src.findPos(id); if (p >= 0) rows.set(id, { y: src.rowY(p) + api.y(id), op: api.op(id), h: src.rowH(p) }); }
    src.mark(); return { st, vh, rows };
  }
  // 第一个留下来的行（屏幕上最上面那一行；被收起了就找最近的留下来的上级）：记下它在屏幕上的位置，结构改完让它待在原处
  function anchorOf(s) {
    let top = null, best = null; for (const [id, r] of s.rows) { const y = r.y - s.st; if (y + r.h <= .5) continue; if (!top || y < top.y) top = { id, y }; if (!willHide(id) && (!best || y < best.y)) best = { id, y }; }
    if (best && best.y < s.vh) return best; if (!top) return null; let id = top.id; while (id >= 0 && willHide(id)) id = src.parentOf(id); return id >= 0 ? { id, y: top.y } : null;
  }
  function settle(s, an) { o.sync(); if (!an) return; const p = src.findPos(an.id); if (p < 0) return; const want = Math.max(0, src.rowY(p) - an.y); if (Math.abs(want - o.view().st) > .5) o.scrollTo(want); }
  // 结构改完：每一行从看到的样子过渡到新位置
  function play(s) {
    const { st, vh } = o.view(), [a, z] = range(st, vh), seen = new Set(), grp = new Map(), t = clock;
    for (let p = a; p < z; p++) {
      const id = src.idAt(p), ny = src.rowY(p) - st, was = s.rows.get(id), hide = exits.has(id); seen.add(id); let dy = null;
      if (was) dy = was.y - s.st - ny; else { const pp = src.prevPos(id); if (pp >= 0) dy = src.prevRowY(pp) - s.st - ny; }
      if (dy != null && Math.abs(dy) <= vh) { const op0 = was ? was.op : 1; if (Math.abs(dy) < .5 && op0 >= .999 && !hide) { items.delete(id); continue; } items.set(id, { y0: dy, op0, op1: hide ? 0 : 1, t0: N, d: 0, dur: hide ? FADE : SLIDE, e: EASE.inOut, p }); }
      else { const g = src.parentOf(id), k = grp.get(g) ?? 0; grp.set(g, k + 1); items.set(id, { y0: -6, op0: was ? was.op : 0, op1: hide ? 0 : 1, t0: N, d: Math.min(k * 30, 150), dur: ENTER, e: EASE.outStrong, eo: EASE.out, p }); } // 新出现的（或从很远来的）：淡入，同一个上级的一行行错开
    }
    for (const [id, was] of s.rows) { // 原来看得见、现在跑出渲染范围的：近的滑出去，远的原地淡出
      if (seen.has(id)) continue; const p = src.findPos(id); if (p < 0) { items.delete(id); exits.delete(id); continue; }
      const oy = was.y - s.st; if (oy + was.h <= 0 || oy >= s.vh || was.op <= .01) { items.delete(id); continue; }
      const dy = oy - (src.rowY(p) - st), hide = exits.has(id); items.set(id, Math.abs(dy) <= vh ? { y0: dy, op0: was.op, op1: hide ? 0 : 1, t0: N, d: 0, dur: hide ? FADE : SLIDE, e: EASE.inOut, p } : { y0: dy, hold: true, op0: was.op, op1: 0, t0: N, d: 0, dur: FADE, e: EASE.inOut, p });
    }
    for (const [id, it] of items) if (!seen.has(id) && !s.rows.has(id)) { it.p = src.findPos(id); if (it.p < 0) items.delete(id); }
    if (exits.size) pendNext = true; /* 还在淡出的下级重新排了起点：淡完的时间从下一次画的时候算 */
    start(); o.after?.();
  }
  // 收起的下级：看得见的那几行原地淡出（还在滑的接着滑完）；淡出时又展开了的，接着淡回来
  function syncExits() {
    const { st, vh } = o.view(), [a, z] = range(st, vh);
    for (const id of [...exits]) if (!willHide(id)) { exits.delete(id); const v = cur.get(id) ?? { y: 0, op: 0 }, p = src.findPos(id); items.set(id, { y0: v.y, op0: v.op, op1: 1, t0: N, d: 0, dur: ENTER, e: EASE.outStrong, eo: EASE.out, p }); }
    for (let p = a; p < z; p++) { const id = src.idAt(p); if (exits.has(id) || !willHide(id)) continue; exits.add(id); const v = cur.get(id) ?? { y: 0, op: 1 }; items.set(id, { y0: v.y, op0: v.op, op1: 0, t0: N, d: 0, dur: FADE, e: EASE.inOut, p }); }
    for (const [id, it] of items) if (it.p >= 0 && !exits.has(id) && it.op1 === 0 && !it.hold) { const v = cur.get(id) ?? { y: 0, op: 0 }; items.set(id, { ...it, y0: v.y, op0: v.op, op1: 1, t0: N, d: 0, dur: ENTER, e: EASE.outStrong, eo: EASE.out }); }
    if (exits.size) { pendNext = true; pendAt = -1; } else { pendNext = false; pendAt = -1; flushQ(); }
  }
  function commitNow() { pendAt = -1; const s = snap(), an = anchorOf(s); exits.clear(); if (src.commit()) { settle(s, an); play(s); } else o.after?.(); flushQ(); }
  function relayout(change) { const s = snap(), an = anchorOf(s); if (change() === false) return; settle(s, an); play(s); }
  const api = {
    get busy() { return on; }, get clock() { return clock; }, exiting: (id) => exits.has(id) || (pendAt >= 0 && willHide(id)),
    fading: () => pendAt >= 0 || pendNext, // 收起的下级还在淡出（淡完才真正收起）：拖行等它淡完再拿起，Alt + 上下等它淡完再挪
    later(fn) { if (pendAt >= 0 || pendNext) queue.push(fn); else fn(); },
    y: (id) => cur.get(id)?.y ?? 0,
    op(id) { const v = cur.get(id); if (v) return v.op; if (pendAt >= 0 && willHide(id)) return Math.max(0, 1 - (clock - fadeT0) / FADE); return 1; }, // 收起时才滚进来的下级：和别的下级一起淡（淡出还没开始时 pendAt < 0，照常显示）
    // 每帧画之前调一次：走自己的钟；淡出完了就真正收起
    tick(now) {
      if (!on) return false; step(now);
      if (pendAt >= 0 && clock >= pendAt) { commitNow(); step(now); } /* 淡完了真正收起：新排的过渡这一帧就定起点 */
      evalAt(clock); if (!items.size && pendAt < 0 && !pendNext && !src.pending) on = false;
      return on;
    },
    // 在 [a, z) 之外、这一帧还看得见的行（滑出去的、原地淡出的）：返回位置，各表接着画
    extras(a, z) { const { st, vh } = o.view(), out = []; for (const [id, it] of items) { if (!(it.p >= 0) || (it.p >= a && it.p < z)) continue; const v = cur.get(id); if (!v || v.op <= .005) continue; const y = src.rowY(it.p) + v.y - st; if (y < vh && y + src.rowH(it.p) > 0) out.push(it.p); } return out; },
    // 展开 / 收起一组节点（ids 为 null = 全部）
    toggle(ids, open) {
      if (o.reduced()) { src.setOpen(ids, open); src.commit(); this.reset(); o.sync(); o.after?.(); return; }
      last = performance.now();
      if (open) { relayout(() => src.setOpen(ids, true)); syncExits(); start(); return; }
      src.setOpen(ids, false, true); syncExits(); start(); if (!exits.size) commitNow(); // 下级都不在屏幕上：不用等，直接收起
    },
    relayout(change) { if (o.reduced()) { change(); this.reset(); o.sync(); o.after?.(); return; } last = performance.now(); relayout(change); },
    // 拖行开始：还在等淡出的收起马上做完；返回现在每一行的位移（位置 → px），之后位置交给拖行，透明度接着走完
    release() {
      last = performance.now(); if (pendAt >= 0 || pendNext || src.pending) { pendNext = false; commitNow(); } evalAt(clock); const m = new Map();
      for (const [id, it] of items) { const v = cur.get(id); if (v && Math.abs(v.y) > .3 && it.p >= 0) m.set(it.p, v.y); if (it.op0 === it.op1 && it.op1 >= 1) items.delete(id); else { it.y0 = 0; it.hold = false; it.p = -1; } }
      evalAt(clock); return m;
    },
    reset() { items.clear(); cur.clear(); exits.clear(); pendAt = -1; pendNext = false; on = false; queue.length = 0; },
  };
  return api;
}
// 平铺 / 树形换外观时的列宽：名称列在树形里宽一些（缩进 + 箭头 + 下级数量），各记各的（拖过就记住）；操作列在树形里多一个"详情"按钮
export function treeCols(model, tree) { const n = model.byKey[model.primary], k = tree ? "tree" : "flat"; if (!n) return; model._nw ??= { flat: n.w, tree: 280 }; model._nw[tree ? "flat" : "tree"] = n.w; n.w = model._nw[k]; const act = model.cols.find((c) => c.type === "act"); if (act) act.w = tree ? 112 : 80; }
// ———— 拖行的让位和跟手范围（两张表格、平铺和树形共用一份） ————
// 别的行（树形是别的兄弟块）按"被拖的块拿走以后"收拢排着，空位插在 G（只有这一个值缓动）：整个在 G 上面的不动，整个在 G 下面的让开 H；
// G 正好落在某一行中间时，这一行按比例让——缺口一直就是 H 那么高（最多被正在越过的那一行分成上下两截），行和行之间不会露出别的空白条。
// 不再给每一行各自缓动到各自的目标：越过一行起步一行，快拖时被越过的几行各走各的，中间会拉开缝。y、h：这一行（块）现在的顶部和高度；before：在被拖的块前面
export const slotShift = (y, h, before, H, G) => { const c = before ? y : y - H, s = Math.max(0, Math.min(1, (c + h - G) / h)); return before ? H * s : -H * (1 - s); };
// 被拖的块的顶部：夹在这一组的首尾 [lo, hi] 之内（不再放宽半行），也夹在看得见的那一段里——不盖到表头上、不钻到表头下面、不跑出底边；块比看得见的还高时只夹首尾
// 空位每帧走一步：按时间常数缓动，但每帧最多走它所在那一行高的 0.4（越过一行至少 2.5 帧）——快拖时被越过的行一行接一行地让开，不会有一行一帧跳过去
// 空位这一帧画成哪几段：有一块（范围 [a, a + h]，按去掉被拖那块以后的排法）正从空位上越过时，空位被它分成上下两截，
// 两截各画一个（它这一帧的顶 t = a + H·(a + h − G)/h，上一截 [a, t]、下一截 [t + h, a + h + H]），一截在缩、一截在长，首尾都接得上；
// 没有越过的块时只有一截 [G, G + H]。只画一截会在越过时露出没有底色的空白条（三个表格共用）
// 两截分给两个元素画时，按上一帧谁在哪分（挪得最少的那种分法）：越过开始、结束时哪一截接着当"整个空位"，就还是原来那个元素，元素自己不会一帧跳一行
export function gapOrder() {
  let prev = null; const d = (p, q) => (p[1] > .5 && q[1] > .5 ? Math.abs(p[0] - q[0]) : 0) + Math.abs(p[1] - q[1]);
  return (pcs) => { if (prev && d(pcs[0], prev[1]) + d(pcs[1], prev[0]) < d(pcs[0], prev[0]) + d(pcs[1], prev[1])) pcs = [pcs[1], pcs[0]]; return (prev = pcs); };
}
export function gapPieces(G, H, [a, h]) {
  if (!(h > 0 && G > a + .3 && G < a + h - .3)) return [[G, H], [G + H, 0]];
  const t = a + H * (a + h - G) / h;
  return [[a, t - a], [t + h, a + H - t]];
}
export const gapStep = (G, tg, k, dt, h) => { if (Math.abs(tg - G) < .3) return tg; const cap = Math.max(4, h * .4) * dt / 16.7; return G + Math.max(-cap, Math.min(cap, (tg - G) * k)); };
export const dragClamp = (v, lo, hi, st, vh, h) => { v = Math.max(lo, Math.min(hi, v)); if (h >= vh) return v; const a = Math.max(lo, Math.min(hi, st)), b = Math.max(a, Math.min(hi, st + vh - h)); return Math.max(a, Math.min(b, v)); };
// ———— 树形模式拖行：只在同一组兄弟里换，拖的时候连同展开着的下级一起走（两版表格共用） ————
// 兄弟每个连同看得见的下级是一块；被拖的那块跟着指针，别的块按空位让开（slotShift）。落点：哪个空位的顶部离被拖的块的顶部最近——
// 不用"块的中心过了别人收拢后的中心"：那等于往下取整，停住时空位总在被拖的块下面，最多差一整块，块高的时候差上百 px，松手也落错。
// 合并块里的行不能单独拖；落点不会插进合并块中间（合并只在兄弟之间，见 createMerges）
export function treeDrag(src, merges, p0) {
  const { list, a, z } = src.siblings(p0), idx = list.findIndex((b) => b.p === p0), me = list[idx], others = list.filter((_, j) => j !== idx);
  const hOf = (b) => src.rowY(b.e) - src.rowY(b.p), H = () => hOf(me), top0 = () => src.rowY(list[0].p), total = () => src.rowY(list.at(-1).e) - top0();
  // 每个空位的顶部（第 t 个兄弟前面，按收拢后的位置）：按行高缓存，行高变了就重算
  let sk = "", S = null;
  const slots = () => { const k = src.pver + "|" + src.rowsH(); if (k !== sk) { sk = k; S = new Float64Array(others.length + 1); let y = top0(); S[0] = y; for (let j = 0; j < others.length; j++) { y += hOf(others[j]); S[j + 1] = y; } } return S; };
  const slotTop = (t) => slots()[t];
  const nearest = (top) => { const s = slots(), n = others.length; let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= top) lo = m; else hi = m - 1; } return lo < n && Math.abs(s[lo + 1] - top) < Math.abs(top - s[lo]) ? lo + 1 : lo; };
  const blockAt = (p) => { let lo = 0, hi = list.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].p <= p) lo = m; else hi = m - 1; } return lo; };
  const regs = merges.active().filter((x) => x.p1 > x.p0 && x.p0 >= a && x.p1 < z).map((x) => [others.findIndex((b) => b.p >= x.p0), others.findLastIndex((b) => b.p <= x.p1)]).filter(([i0, i1]) => i0 >= 0 && i1 > i0);
  return {
    me, idx, list, others, a, z, H, top0, total, slotTop,
    // 跟手范围：被拖的块顶部在 [这一组的顶, 这一组的底 - 块高]
    lo: () => top0(), hi: () => top0() + total() - H(),
    hAt(G) { return this.rangeAt(G)[1]; },
    rangeAt(G) { const s = slots(), n = others.length; if (!n) return [G, H()]; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= G) lo = m; else hi = m - 1; } return [s[lo], s[lo + 1] - s[lo]]; }, // 空位 G 落在哪一块里、那一块多高
    target: (top) => { let t = nearest(top); for (const [i0, i1] of regs) if (t > i0 && t <= i1) t = t - i0 <= i1 + 1 - t ? i0 : i1 + 1; return t; },
    // 位置 p 的行这一帧让多少：按空位 G 摆（被拖的块整块不在这里画；这一组外面的行不动）
    shift(p, G) { if (p < a || p >= z) return 0; const j = blockAt(p); if (j === idx) return 0; const b = list[j], y = src.rowY(b.p); return slotShift(y, src.rowY(b.e) - y, j < idx, H(), G); },
    inMe: (p) => p >= me.p && p < me.e,
    // 松手：在兄弟里换位置（排序时拖了：先把排好的顺序当成手动顺序）
    commit(t) { if (t === idx) return false; src.adoptSort(); return t < others.length ? src.moveNode(me.id, others[t].id) : src.moveNode(me.id, -1, others.at(-1).id); },
  };
}
// 合并单元格微交互时钟（DOM 版与 Canvas 版共用）：自动对比前后帧的生效合并块集合，
// 无论因点击合并/拆分、撤销、切换行线/网格、还是展开/收起行详情而出现或消失，一律给出平滑的 260ms 聚合 / 240ms 溶解进度；
// 反向中途打断（例如连点展开/收起或快速合并/拆分）按当前进度无缝反向接续，绝不硬跳。
export function createMergeFx() {
  let primed = false;
  const prev = new Map(), en = new Map(), lv = new Map(), ED = 260, LD = 240;
  const ease = (t) => 1 - (1 - t) ** 3, cl = (v) => Math.max(0, Math.min(1, v));
  const reset = () => { primed = false; prev.clear(); en.clear(); lv.clear(); };
  return {
    prime(live, f) { reset(); primed = true; for (const x of live) prev.set(x.m, f ? f(x) : x); },
    reset,
    diff(live, now, f) {
      const next = new Map(), entered = [], left = [], noFx = reduced();
      for (const x of live) next.set(x.m, f ? f(x) : x);
      if (!primed) { primed = true; for (const [m, s] of next) prev.set(m, s); return { entered, left }; }
      for (const x of live) if (!prev.has(x.m)) {
        if (noFx) { lv.delete(x.m); continue; }
        const old = lv.get(x.m), s = old ? 1 - cl((now - old.t0) / LD) : 0; lv.delete(x.m);
        en.set(x.m, { t0: now - s * ED, x }); entered.push(x);
      }
      for (const [m, snap] of prev) if (!next.has(m)) {
        if (noFx) { en.delete(m); continue; }
        const old = en.get(m), s = old ? 1 - cl((now - old.t0) / ED) : 0; en.delete(m);
        const it = { m, snap, t0: now - s * LD }; lv.set(m, it); left.push(it);
      }
      prev.clear(); for (const [m, s] of next) prev.set(m, s);
      return { entered, left };
    },
    enterP(m, now) { const o = en.get(m); if (!o) return 1; const t = cl((now - o.t0) / ED); return t >= 1 ? (en.delete(m), 1) : ease(t); },
    leaves(now) { const out = []; for (const [m, o] of lv) { const t = cl((now - o.t0) / LD); if (t >= 1) lv.delete(m); else out.push({ m, snap: o.snap, t, q: ease(t) }); } return out; },
    get busy() { return en.size > 0 || lv.size > 0; },
  };
}
// 工具条上的合并 / 拆分按钮和"有几处合并暂时不显示"的提示（两版表格共用）：
// 拆分按钮与挂起提示装在水平折叠槽（.sn-g-mslot / .sn-g-hslot）里，进出场 220ms/180ms 丝滑展开收拢，不硬跳、不闪现
export function mountMergeBar(root, injectIcons) {
  const info = root.querySelector("[data-g-info]"), bar = mk("span", "sn-g-mbar");
  bar.innerHTML = tt("grid.15"); injectIcons(bar);
  const merge = bar.querySelector("[data-g-merge]"), split = bar.querySelector("[data-g-split]"), hint = bar.querySelector(".sn-g-mhint");
  const mkSlot = (el, cls, focusable) => {
    const slot = mk("span", cls), inner = mk("span");
    el.before(slot); inner.append(el); slot.append(inner);
    let tm = 0, shown = false;
    return {
      set(on) {
        if (on === shown) return false; shown = on; clearTimeout(tm); tm = 0;
        if (on) { el.hidden = false; el.removeAttribute("aria-hidden"); if (focusable) el.removeAttribute("tabindex"); if (!reduced() && !slot.classList.contains("sn-on")) void slot.offsetWidth; slot.classList.add("sn-on"); }
        else { slot.classList.remove("sn-on"); el.setAttribute("aria-hidden", "true"); if (focusable) el.setAttribute("tabindex", "-1"); if (reduced()) el.hidden = true; else tm = setTimeout(() => { if (!slot.classList.contains("sn-on")) el.hidden = true; }, 200); }
        return true;
      },
      clear() { clearTimeout(tm); },
    };
  };
  const spSlot = mkSlot(split, "sn-g-mslot", true), htSlot = mkSlot(hint, "sn-g-hslot", false);
  let wasReady = false, hoverCb = null;
  for (const [ev, v] of [["pointerenter", true], ["pointerleave", false], ["focus", true], ["blur", false]]) split?.addEventListener(ev, () => hoverCb?.(v));
  if (info) { const meta = document.createElement("div"); meta.className = "sn-g-meta"; info.before(meta); meta.append(bar, info); }
  return {
    merge, split, hint, onSplitHover(cb) { hoverCb = cb; },
    sync({ canMerge, mergeTip, showSplit, hintText }) {
      const ready = !!canMerge; merge.disabled = !ready; merge.classList.toggle("sn-g-mready", ready);
      if (ready && !wasReady && !reduced()) { merge.classList.remove("sn-g-mpop"); void merge.offsetWidth; merge.classList.add("sn-g-mpop"); }
      wasReady = ready; merge.dataset.tip = mergeTip; retip(merge);
      if (!showSplit && spSlot.set(false)) hoverCb?.(false); else if (showSplit) spSlot.set(true);
      const ht = String(hintText || ""); if (ht) hint.textContent = ht; htSlot.set(!!ht);
    },
    dispose() { spSlot.clear(); htSlot.clear(); },
  };
}
// 空、加载、出错三种状态（两种表格共用）：表身上面一层，表头照常（列还在、能看出是哪张表）。第一次要显示时才建这一层；
// 文字走语言表，emptyText / noMatchText / loadingText / errorText 能改；error 是字符串时直接显示它（转义，不当标记）
export function mountGridState(root, vp, src, o, emit) {
  let el = null;
  const make = () => {
    el = document.createElement("div"); el.className = "sn-g-state"; el.setAttribute("role", "status");
    el.addEventListener("click", (e) => { if (e.target.closest("[data-g-retry]")) { emit("retry"); src.retry(); } else if (e.target.closest("[data-g-clear]")) { src.setQuery({}); const q = $("[data-g-q]", root); if (q) q.value = ""; } });
    vp.append(el);
  };
  return function paintState() {
    const err = o.error || (src.error ? src.error.message || o.errorText || tt("grid.68") : null), loading = !!o.loading && !err, empty = !err && !loading && !src.busy && src.total === 0;
    const kind = err ? "error" : loading ? "loading" : empty ? "empty" : "";
    root.classList.toggle("sn-g-st-on", !!kind);
    if (!kind) { if (el) el.hidden = true; return; }
    if (!el) make();
    const filt = kind === "empty" && hasFilter(src.query), sig = kind + (filt ? "/f" : "") + "\n" + (err || "") + "\n" + [o.emptyText, o.noMatchText, o.loadingText, o.errorText].join("\n");
    el.hidden = false; if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    el.innerHTML = kind === "loading" ? `<span class="sn-spinner"></span><span>${esc(o.loadingText ?? tt("grid.67"))}</span>`
      : kind === "error" ? `<b>${esc(typeof err === "string" ? err : o.errorText ?? tt("grid.68"))}</b><button class="sn-btn sn-secondary sn-sm" type="button" data-g-retry>${tt("grid.69")}</button>`
      : `<b>${esc(filt ? o.noMatchText ?? tt("grid.70") : o.emptyText ?? tt("grid.71"))}</b>${filt ? `<button class="sn-btn sn-ghost sn-sm" type="button" data-g-clear>${tt("grid.72")}</button>` : ""}`;
  };
}
// ———— DOM 版数据表格 ————
// mountDataGrid(.sn-grid, 选项)：DOM 版数据表格——虚拟滚动（只画看得见的行）、按需取块、固定列、拖列换位、改列宽 / 行高、
//   框选合并单元格、树形、编辑、拖行换位置。数据由使用的人给（库里不带演示数据，设计稿的十万行在 demo/grid-data.js、demo/grid-backend.js）
// 选项：columns（列定义，见 table-data.js）+ data（数组）或 dataSource（{ total, load } 或整套后端接口，见 table-backends.js）；rowKey；
// selection："multiple" | "single" | "none"（有 sel 列时默认 multiple）；selectedKeys / defaultSelectedKeys；defaultSort；rowDraggable；
// detail(el, row, 行号) 或 { init(el), fill(el, row, 行号) }：行详情（不给就没有详情箭头）；treeCount(下级数, 第几级)：树形名称后面的下级数量文字；
// loading / error / emptyText / errorText：三种状态；事件 onRowClick、onSortChange、onFilterChange、onSelectionChange、onColumnResize、onColumnReorder、onCellEdit、onScrollEnd、onRowAction
export function mountDataGrid(root, o = {}) {
  if (!root || root._grid) return root?._grid;
  const emit = (type, detail) => (o.emit ? o.emit(type, detail) : o["on" + type[0].toUpperCase() + type.slice(1)]?.(detail));
  const vp = $(".sn-g-vp", root), head = $(".sn-g-head", root), body = $(".sn-g-body", root), info = $("[data-g-info]", root), chips = $("[data-g-filters]", root), foot = $(".sn-g-foot", root);
  const cols0 = normCols(o.columns || []), selMode = o.selection ?? (cols0.some((c) => c.type === "sel") ? "multiple" : "none");
  // 要勾选、表里又没写 sel 列：自动在最左边加一列（勾选框；能拖行时还有把手）
  if (selMode !== "none" && !cols0.some((c) => c.type === "sel")) cols0.unshift(...normCols([{ key: "sel", type: "sel", width: o.rowDraggable ? 64 : 44, pinned: "left" }]));
  const model = columnModel(cols0), NAME = model.primary, SEL = model.cols.find((c) => c.type === "sel")?.key ?? "sel", special = (k) => model.byKey[k]?.type === "sel" || model.byKey[k]?.type === "act", styleEl = document.createElement("style"); document.head.append(styleEl);
  if (o.height != null) setGridHeight(root, o.height);
  root.classList.toggle("sn-g-nodrag", !o.rowDraggable && !o.dataSource?.move); root.classList.toggle("sn-g-single", selMode === "single"); root.classList.toggle("sn-g-nodetail", !o.detail);
  const OVER = 6; let pool = [], dver = 0, raf = 0, active = { p: 0, c: NAME, id: 0 }, selAll = false, selSet = new Set(), anchorP = -1, editing = null, rowDrag = null;
  const keyOf = (r) => { const it = src.row(r) ?? src.allRows?.()?.[r]; return it == null ? r : typeof o.rowKey === "function" ? o.rowKey(it) : it[o.rowKey ?? "id"] ?? r; };
  // 拖行的空位：一般一截；有一块正从空位上越过时两截（gapPieces），每截上下左右各缩 3px 画
  let gapEl2 = null, gOrder = (x) => x;
  // 缩没了的那截藏起来、停在原处（看不见的元素不来回挪）。快拖时一截刚被盖没、另一处又露出一截新的，是两回事：照常画
  const paintGaps = (els, pcs, sl) => els.forEach((el, i) => { if (!el) return; const [t, hh] = pcs[i]; if (hh <= .5) { el.style.visibility = "hidden"; return; } el.style.top = t + "px"; el.style.height = hh + "px"; el.style.visibility = ""; el.style.setProperty("--sn-sl", sl); });
  // 拖行松手后还在等落位时又去点别的（再拖一行、排序、筛选、展开、改行高、打字搜索）：先把这一次落好，不然两次会互相踩
  let pendingDrop = null; const flushDrop = () => pendingDrop?.();
  const src = createSource({ backend: backendOf({ data: o.data, dataSource: o.dataSource, columns: model.cols, rowKey: o.rowKey, primary: NAME }), primary: NAME, block: 100, rowH: RH, query: (o.sort ?? o.defaultSort) ? { sort: o.sort ?? o.defaultSort } : undefined, onChange: (what) => { if (what === "view") { rowDrag?.abort?.(); mo.reset(); mergeFx.reset(); clearMergeFxEls(); syncTree(); active.p = Math.min(active.p, Math.max(0, src.shown - 1)); active.id = src.idAt(active.p); if (!rowDrag && !keepScroll) vp.scrollTop = 0; keepScroll = false; rg = null; anchorP = -1; showSel(false); syncMergeBar(); applyKeys(); } if (what === "block") keysOnBlock(); dver++; paintBar(); headUI.paint(); schedule(); paintState(); queryChanged(); } });
  // 排序、筛选变了（点表头、列头筛选、搜索、清掉标签）：发事件（受控时父组件再把 sort 传回来）
  let lastSort = JSON.stringify(src.query.sort || null), lastFilter = JSON.stringify({ q: src.query.q || "", filters: src.query.filters || {} });
  function queryChanged() {
    const s1 = JSON.stringify(src.query.sort || null), f1 = JSON.stringify({ q: src.query.q || "", filters: src.query.filters || {} });
    if (s1 !== lastSort) { lastSort = s1; emit("sortChange", src.query.sort || null); }
    if (f1 !== lastFilter) { lastFilter = f1; emit("filterChange", { q: src.query.q || "", filters: src.query.filters || {} }); }
  }
  const paintState = mountGridState(root, vp, src, o, emit);
  // 滚动条：常驻时占独立的一条（竖条从表头下面开始，横条只在中间的列下面），两端箭头可点；自动时悬浮、滚动才出现
  const SK_MORE = 3;
  const tailH = () => (src.mode !== "append" ? 0 : src.hasMore ? SK_MORE * RH : src.total > 0 ? RH : 0);
  const bars = gridBars(vp.parentElement, vp, { head: HEAD, rowH: RH, rowsH: () => src.rowsH() + tailH(), colsW: () => model.width(), pinL: () => model.leftW(), pinR: () => model.rightW(), stops: () => colStops(model), reduced });
  const DETAIL = 112, EXPD = { flat: new Map(), tree: new Map() }, expAnim = new Map(), expTo = new Map(); // expAnim / expTo：正在展开收起的行这一次的记号、要去的状态（连点时只让最新的那次动）
  let expd = EXPD.flat; // 展开了详情的行：行号 → 收起时（格子部分）的高度；平铺、树形各记各的
  const merges = createMerges(src, model, (p) => { const r = src.rowAt(p); return r >= 0 && expd.has(r); });
  const mergeFx = createMergeFx(), mfxEls = new Set();
  let hovMerge = null, splitPrev = false, splitPrevEl = null;
  const clearMergeFxEls = () => { for (const el of mfxEls) el.remove(); mfxEls.clear(); splitPrevEl?.remove(); splitPrevEl = null; };
  // 列：轨道、顺序、固定列 sticky、固定列阴影；拖着的列变淡
  function apply() {
    const disp = model.display(), id = "#" + root.id; root.style.setProperty("--sn-gcols", disp.map((c) => c.w + "px").join(" ")); root.style.setProperty("--sn-gw", model.width() + "px");
    let css = "", left = 0, right = 0; disp.forEach((c, k) => { css += `${id} [data-c="${c.key}"]{order:${k}}`; });
    for (const k of model.left) { css += `${id} [data-c="${k}"]{position:sticky;left:${left}px;z-index:2}`; left += model.byKey[k].w; }
    for (const k of [...model.right].reverse()) { css += `${id} [data-c="${k}"]{position:sticky;right:${right}px;z-index:2}`; right += model.byKey[k].w; }
    if (model.left.length) css += `${id}.sn-has-exp.sn-sx .sn-g-body [data-c="${model.left.at(-1)}"]:not(.sn-mg){box-shadow:inset -1px -1px 0 var(--sn-g-rowline)}`;
    if (model.right.length) css += `${id}.sn-has-exp.sn-ex .sn-g-body [data-c="${model.right[0]}"]{box-shadow:-1px 0 0 var(--sn-g-rowline),inset 0 -1px 0 var(--sn-g-rowline)}`;
    shade(); // 固定列边上的分隔线和阴影：外框上两条贯通的阴影条，有展开详情时表体由固定列格子自绘避免劈穿详情面板
    if (styleEl.textContent !== "@layer satin{" + css + "}") styleEl.textContent = "@layer satin{" + css + "}"; /* 没变就不写：改写样式表有开销，还会打断刚开始的 CSS 动画 */ edges();
  }
  // 列的位移、被拖那一列的透明度：单独一张样式表，动的时候每帧写一次（mountHead 里算值）
  const motionEl = document.createElement("style"); document.head.append(motionEl); let motionRaf = 0;
  const paintMotion = () => { cancelAnimationFrame(motionRaf); motionRaf = 0; const now = performance.now(), busy = headUI.moving(now), css = headUI.motionCss("#" + root.id, true, now); if (motionEl.textContent !== "@layer satin{" + css + "}") motionEl.textContent = "@layer satin{" + css + "}"; if (busy) motionRaf = requestAnimationFrame(paintMotion); };
  const autosize = (key) => {
    // 名称格：名字前面是箭头（树形还有缩进）、后面可能有下级数量——量"名字的左边到格子左边" + 名字本来多宽 + 下级数量 + 右边留白（原来量的是第一个子元素 = 箭头，名称列会被缩到只剩表头那么宽）
    const need = (r) => { const c = r._cells[key]; if (key === NAME) return c._t.getBoundingClientRect().left - c.getBoundingClientRect().left + contentW(c._t) + (r._cnt.textContent ? 8 + contentW(r._cnt) : 0) + 12; const ch = c.firstElementChild; return (ch ? contentW(ch) : 0) + 28; };
    const hc = head.querySelector(`[data-c="${key}"]`), w = Math.max((hc.querySelector(".sn-g-ht") ? contentW(hc.querySelector(".sn-g-ht")) + 56 : 64), ...pool.filter((r) => r.style.display !== "none" && !r.classList.contains("sn-sk")).map(need));
    return Math.max(model.byKey[key]?.minW ?? 64, Math.min(480, Math.ceil(w))); /* 只算宽度，由表头滑过去 */
  };
  // 勾选：平铺是"全选 + 例外"（一百万行也是 O(1)）；树形是上下级联动（tsel，两版共用）
  const tsel = createTreeSel(src);
  const selState = () => (src.tree ? tsel.state() : selAll ? (selSet.size ? "some" : "all") : selSet.size ? (src.total > 0 && selSet.size >= src.total ? "all" : "some") : "none"); // 一行一行勾满了也算全选
  // 拖列：浮起的整列里表身那一段——看得见的这几行里这一列的格子，按现在的位置克隆（行的悬停、选中底色不带过去）
  const colGhost = (key) => {
    const vr = vp.getBoundingClientRect(), top = vr.top + HEAD, bottom = Math.min(vr.top + vp.clientHeight, vr.top + HEAD + src.rowsH() - vp.scrollTop), box = document.createElement("div");
    box.style.height = Math.max(0, bottom - top) + "px";
    for (const r of pool) {
      if (r.style.display === "none" || r.classList.contains("sn-sk")) continue; const c = r._cells?.[key]; if (!c) continue; const b = c.getBoundingClientRect(); if (b.bottom <= top || b.top >= bottom) continue;
      const cl = c.cloneNode(true); cl.removeAttribute("style"); Object.assign(cl.style, { position: "absolute", left: 0, right: 0, top: b.top - top + "px", height: b.height + "px" }); box.append(cl);
    }
    return box;
  };
  const headUI = mountHead(head, model, { root, vp, src, injectIcons, apply, motion: paintMotion, autosize, reduced, selState, colGhost, onResize: (key, width) => emit("columnResize", { key, width }), onReorder: (keys) => emit("columnReorder", { keys: [...model.left, ...keys, ...model.right] }), onSelAll: () => { if (selMode === "single") return; if (src.tree) tsel.setAll(selState() !== "all"); else if (selState() === "all") { selAll = false; selSet.clear(); } else { selAll = true; selSet.clear(); } dver++; schedule(); paintBar(); headUI.paint(); } });
  const isSel = (r) => (src.tree ? tsel.has(r) : selAll ? !selSet.has(r) : selSet.has(r));
  const selCount = () => (src.tree ? tsel.count() : selAll ? src.total - selSet.size : selSet.size);
  function toggleSel(r, on = !isSel(r)) { if (selMode === "single") { selAll = false; selSet.clear(); if (on) selSet.add(r); return; } if (src.tree) tsel.pick(r, on); else if (selAll) on ? selSet.delete(r) : selSet.add(r); else on ? selSet.add(r) : selSet.delete(r); }
  // 勾选变了就发 selectionChange：keys 是勾上的行的 rowKey（全选时 all 为 true，except 是全选以后又去掉的）
  let lastSel = "s"; // 一开始的勾选（平铺、什么都没勾）：挂上时不发 selectionChange
  const sigSel = () => (src.tree ? "t" + tsel.ver : (selAll ? "a" : "s") + [...selSet].join(","));
  // 勾选的 rowKey：树形里是所有勾上的节点（先序）；平铺全选时数组数据照样列全（视图里的全部行去掉 except），按块加载的数据不知道全部的行，是 null
  const selKeys = () => { if (src.tree) return tsel.ids().map(keyOf); if (!selAll) return [...selSet].map(keyOf); const ids = src.viewIds?.(); return ids ? Array.from(ids).filter((id) => !selSet.has(id)).map(keyOf) : null; };
  function selChanged() {
    const sig = sigSel(); if (sig === lastSel) return; lastSel = sig; wantKeys = null; // 用户自己改了勾选：之后按用户的来（受控时父组件会把新的 selectedKeys 传回来）
    emit("selectionChange", !src.tree && selAll ? { keys: selKeys(), all: true, except: [...selSet].map(keyOf) } : { keys: selKeys(), all: false, except: [] });
  }
  // 换数据（data / dataSource 换了）：滚动位置留着；没受控时勾选按 rowKey 带到新数据上（行号会变）
  let keepScroll = false;
  function swapData(n) {
    if (n.selectedKeys == null) { const k = selKeys(); if (k?.length) wantKeys = k; }
    selSet = new Set(); selAll = false; tsel.reset(); lastSel = sigSel(); keepScroll = true;
    src.reset(backendOf({ data: n.data, dataSource: n.dataSource, columns: model.cols, rowKey: n.rowKey, primary: NAME }));
  }
  // 受控的 selectedKeys（或一开始的 defaultSelectedKeys）：按 rowKey 找到行号再勾上（数组数据全都认得；按块加载的只认已经到了的行）
  let wantKeys = o.selectedKeys ?? o.defaultSelectedKeys ?? null;
  function applyKeys() {
    if (!wantKeys) return; const want = new Set(wantKeys), ids = new Set(), all = src.allRows?.();
    if (all) { all.forEach((it, id) => { const k = typeof o.rowKey === "function" ? o.rowKey(it) : it[o.rowKey ?? "id"] ?? id; if (want.has(k)) ids.add(id); }); }
    else for (let p = 0; p < src.shown; p++) { const r = src.rowAt(p); if (r >= 0 && want.has(keyOf(r))) ids.add(r); }
    if (src.tree) { tsel.clear(); for (const id of ids) tsel.pick(id, true); } else { selAll = false; selSet = ids; }
    lastSel = sigSel(); if (o.selectedKeys == null && (all || ids.size >= want.size)) wantKeys = null; dver++; schedule(); paintBar(); headUI.paint();
  }
  // 按块加载的数据：要勾的行还没到时，每到一块再对一次（找全了、或者用户自己改了勾选就不再对）
  function keysOnBlock() { if (wantKeys && !src.allRows?.()) applyKeys();
  }


  // 行
  const CELL = {
    sel: `<span class="sn-grip sn-g-grip" data-i="grip-vertical" aria-label="${tt("grid.16")}"></span><span class="sn-check" role="checkbox" aria-checked="false" aria-label="${tt("grid.17")}">${BOX}</span>`, // 把手、复选框都是组件库共用（不能拖行时把手藏起来）的
    text: '<span class="sn-g-t"></span>', int: '<span class="sn-g-t"></span>', dur: '<span class="sn-g-t"></span>', money: '<span class="sn-g-t"></span>', time: '<span class="sn-g-t"></span>',
    status: '<span class="sn-g-st"><i class="sn-g-dot"></i><span class="sn-g-t"></span></span>', owner: '<span class="sn-g-ow"><i class="sn-g-av"></i><span class="sn-g-t"></span></span>', tag: '<span class="sn-g-tag sn-g-t"></span>',
    prog: '<span class="sn-g-pg"><i class="sn-g-pbar"><b></b></i><span class="sn-g-t"></span></span>',
    act: tt("grid.18"), // 组件库的图标按钮（悬停出底、按下缩一下）；"详情"只在树形模式出现（平铺时详情在名称前的箭头上）
  };
  // ———— 选中框、框选框（像 Excel）————
  // 一个框压在格线上：2px，盖住边上那条 1px 的格线、再往选区里多 1px（四条边一样）；直角；合并块整块框住。
  // 框选时选区里铺一层淡底，起点那一格不铺（一眼看出从哪开始的）。
  // 普通列的框放在表身里，和内容一起滚（同一帧，不拖影），被左右固定列挡住的部分用 clip-path 裁掉；
  // 固定列的框放在贴边的 sticky 层里：横滚时不动、竖滚时跟着走，和固定列自己一样。
  const rgL = document.createElement("div"), rgR = document.createElement("div"), rgBoxes = { L: [], R: [], M: [] };
  rgL.className = "sn-g-rgl"; rgR.className = "sn-g-rgr";
  rgL.dataset.zone = "L"; rgR.dataset.zone = "R";
  body.prepend(rgL, rgR);
  const cellH = (p) => { const r = src.rowAt(p), hh = src.rowH(p); return r >= 0 && expd.has(r) ? Math.min(hh, expd.get(r)) : hh; };
  function paintSelBox() {
    for (const arr of Object.values(rgBoxes)) for (const b of arr) b.hidden = true;
    const R2 = rgRect(); let p0, p1, keys, mode = "";
    if (R2) { ({ p0, p1, keys } = R2); mode = "rg"; }
    else if (document.activeElement === vp && (selShown || (kbdNav && activeSelected))) {
      const am = merges.at(active.p, active.c); p0 = am ? am.p0 : active.p; p1 = am ? am.p1 : active.p; keys = am ? am.keys : [active.c];
      mode = selShown && activeEditable() ? "sel" : "kbd";
    }
    if (!keys?.length || editing || rowDrag || p0 > p1 || p0 >= src.shown) return;
    const gw = model.width(), lw = model.leftW(), rwc = model.rightW(), st = vp.scrollTop, sl = vp.scrollLeft, vw = vp.clientWidth;
    if (rgL._w !== lw) { rgL._w = lw; rgL.style.width = lw + "px"; } if (rgR._w !== rwc) { rgR._w = rwc; rgR.style.width = rwc + "px"; }
    const X0 = model.xOf(keys[0]), X1 = model.xOf(keys.at(-1)) + model.byKey[keys.at(-1)].w, Y0 = src.rowY(p0), Y1 = src.rowY(p1) + cellH(p1);
    const L = mode === "kbd" ? X0 : X0 > 0 ? X0 - 1 : 0, T = mode === "kbd" ? Y0 : Y0 > 0 ? Y0 - 1 : 0, W = X1 - L, H = (mode === "kbd" ? Math.max(0, Y1 - 1) : Y1) - T;
    const zone = merges.zoneOf(keys[0]), host = zone === "L" ? rgL : zone === "R" ? rgR : body, poolB = rgBoxes[zone];
    const x = zone === "R" ? L - (gw - rwc) : L;
    const ct = Math.max(0, st - T), cl = zone === "M" ? Math.max(0, sl + lw - 1 - L) : zone === "R" ? Math.max(0, -1 - x) : 0;
    const cr = zone === "M" ? Math.max(0, L + W - (sl + vw - rwc + 1)) : zone === "L" ? Math.max(0, x + W - (lw + 1)) : 0;
    if (cl + cr >= W || ct >= H) return;
    let box = poolB[0];
    if (!box) { box = document.createElement("i"); box.className = "sn-g-rgbox"; host.append(box); poolB.push(box); }
    box.classList.toggle("sn-is-rg", mode === "rg");
    box.classList.toggle("sn-is-kbd", mode === "kbd");
    box.hidden = false; box.style.cssText = `left:${x}px;top:${T}px;width:${W}px;height:${H}px;clip-path:inset(${ct}px ${cr}px 0 ${cl}px)`;
  }
  vp.addEventListener("focus", () => schedule()); vp.addEventListener("blur", () => { kbdNav = false; schedule(); });
  function makeRow() {
    const el = document.createElement("div"); el.className = "sn-g-row"; el.setAttribute("role", "row");
    el.innerHTML = model.cols.map((c) => `<div class="sn-g-cell${c.align === "right" ? " sn-r" : ""}" data-c="${c.key}"${colAttrs(model, c)} role="gridcell">${c.render ? CELL.text : CELL[c.type] ?? CELL.text}</div>`).join("")
      + '<i class="sn-g-rh" aria-hidden="true"></i><div class="sn-g-detail" aria-hidden="true"></div>';
    const nc = el.querySelector(`[data-c="${CSS.escape(NAME)}"]`);
    nc?.insertAdjacentHTML("afterbegin", tt("grid.19")); // 组件库的展开箭头；树形：每一级的竖向引导线、没有下级时的小圆点
    nc?.insertAdjacentHTML("beforeend", '<span class="sn-g-cnt"></span>'); // 树形：名称后面的下级数量（"4 集"）
    o.detail?.init?.(el.querySelector(".sn-g-detail")); // 详情的骨架（只建一次，行复用）
    injectIcons(el); el._cells = {}; for (const cell of el.querySelectorAll(".sn-g-cell")) { el._cells[cell.dataset.c] = cell; cell._t = cell.querySelector(".sn-g-t"); }
    el._detail = el.querySelector(".sn-g-detail"); el._exp = el.querySelector(".sn-g-exp"); el._cnt = el.querySelector(".sn-g-cnt"); el._dtb = el.querySelector(".sn-g-dtb"); body.append(el); return el;
  }
  function fillCell(cell, col, r) {
    const k = col.key, v = col.type === "sel" || col.type === "act" ? 0 : src.val(r, k);
    // 自己画的格子：render 返回 HTML 字符串或节点（返回 undefined 表示已经自己改好了 cell）
    if (col.render) { const row = src.row(r), box = cell._t, out = col.render(v, row, { cell: box, key: k, index: r }); if (typeof out === "string") { if (box._html !== out) { box._html = out; box.innerHTML = out; } } else if (out && out.nodeType) { if (box.firstChild !== out || box.childNodes.length !== 1) { box._html = null; box.replaceChildren(out); } } return; }
    switch (col.type) {
      case "sel": { const ck = cell.lastChild, on = isSel(r), mx = !on && src.tree && tsel.mixed(r); ck.classList.toggle("sn-on", on); ck.classList.toggle("sn-mixed", mx); ck.setAttribute("aria-checked", mx ? "mixed" : String(on)); break; } // 树形：下级勾了一部分是半选
      case "status": { const op = optionOf(col, v); cell.querySelector(".sn-g-dot").className = "sn-g-dot sn-s" + (op ? op.tone : v); cell._t.textContent = textOf(col, v, src.row(r)); break; }
      case "owner": { const t = textOf(col, v, src.row(r)), av = cell.querySelector(".sn-g-av"), seed = ownerSeed(col, v, t); if (av._seed !== seed) { av._seed = seed; av.innerHTML = presetAvatar(seed, 20).svg; } cell._t.textContent = t; break; }
      case "prog": { const n = +v || 0; cell.querySelector(".sn-g-pbar").style.setProperty("--sn-p", n / 100); cell._t.textContent = col.format ? textOf(col, v, src.row(r)) : n + "%"; cell.classList.toggle("sn-done", n === 100); break; }
      default: if (cell._t) cell._t.textContent = textOf(col, v, src.row(r));
    }
  }
  // 复用行：这一帧和下一帧都不播过渡，之后恢复（过渡只在"同一行的状态变了"时播）
  const fxOff = new Set(); let fxRaf = 0;
  const nofx = (el) => { el.classList.add("sn-nofx"); fxOff.add(el); if (!fxRaf) fxRaf = requestAnimationFrame(() => (fxRaf = requestAnimationFrame(() => { fxRaf = 0; for (const x of fxOff) x.classList.remove("sn-nofx"); fxOff.clear(); }))); };
  function fill(el, p) {
    const r = src.rowAt(p), was = el.classList.contains("sn-sk"), hh = src.rowH(p), ex = r >= 0 && expd.has(r), ch = ex ? Math.min(hh, expd.get(r)) : hh;
    if (el._r !== r) nofx(el); // 复用的行换了内容：勾选框、底色直接到位，不播过渡（滚动时不会看到一行行"勾掉""褪色"）
    el._p = p; el._v = dver; el._r = r; el.style.top = src.rowY(p) + "px"; el.style.height = hh === RH ? "" : hh + "px"; el.style.setProperty("--sn-ch", ch + "px"); el.style.setProperty("--sn-dh", hh - ch + "px"); el.style.display = ""; el.setAttribute("aria-rowindex", p + 2);
    el.dataset.skv = String(((p % 3) + 3) % 3);
    el.classList.toggle("sn-sk", r < 0); el.classList.toggle("sn-exp", ex);
    if (src.tree) { // 树形：缩进、精准引导线（末项收口 50% 不撞后续箭头）；有下级的是展开箭头（按"该是什么状态"转，收起时不等下级淡出），没有的是小圆点；详情挪到操作列的按钮上
      const id = src.idAt(p), lv = src.lvAt(p), kids = src.hasKids(id), op = kids && src.isOpen(id); el.style.setProperty("--sn-lv", lv); el.classList.toggle("sn-tk", kids); el.classList.toggle("sn-to", op);
      el.setAttribute("aria-level", lv + 1); el._cells[NAME]?.setAttribute("aria-expanded", String(op)); el._exp?.setAttribute("aria-expanded", String(op)); el._exp?.setAttribute("aria-label", op ? tt("grid.20") : tt("grid.21"));
      el._cnt.textContent = kids && o.treeCount ? o.treeCount(src.kidsN(id), lv) || "" : ""; if (r >= 0) el._dtb?.setAttribute("aria-expanded", String(expTo.get(r) ?? ex));
      const tg = el._cells[NAME]?.querySelector(".sn-g-tg");
      if (tg) {
        if (lv <= 0) tg.style.removeProperty("--sn-tbg");
        else {
          const gd = treeGuides(src, p), segs = [];
          for (let d = 0; d < lv; d++) {
            const gx = 3.5 + d * 24;
            if (d === lv - 1) segs.push(`linear-gradient(var(--sn-tree-line),var(--sn-tree-line)) ${gx}px 0/1px ${gd.last ? "50%" : "100%"} no-repeat`);
            else if (gd.anc[d]) segs.push(`linear-gradient(var(--sn-tree-line),var(--sn-tree-line)) ${gx}px 0/1px 100% no-repeat`);
          }
          const bg = segs.length ? segs.join(",") : "none";
          if (tg.style.getPropertyValue("--sn-tbg") !== bg) tg.style.setProperty("--sn-tbg", bg);
        }
      }
    } else {
      if (el.classList.contains("sn-tk") || el.classList.contains("sn-to") || el.style.getPropertyValue("--sn-lv")) { el.classList.remove("sn-tk", "sn-to"); el.style.removeProperty("--sn-lv"); el.removeAttribute("aria-level"); el._cnt.textContent = ""; el._exp?.setAttribute("aria-label", tt("grid.22")); }
      el._cells[NAME]?.setAttribute("aria-expanded", String(ex)); el._exp?.setAttribute("aria-expanded", String(r >= 0 && (expTo.get(r) ?? ex))); // 箭头按"要去的状态"转：收起时一点就转回来，不等高度动完
    }
    if (r >= 0) { for (const c of model.cols) fillCell(el._cells[c.key], c, r); el.classList.toggle("sn-sel", isSel(r)); if (was && !reduced()) arrived.set(r, performance.now()); if (ex) fillDetail(el, r); } // 占位变成数据：120ms 从 40% 淡到 100%（render 里按时间算，和树的过渡乘在一起）
    else el.classList.remove("sn-sel");
    // 合并单元格：先清掉这一行上次的合并样式，再按连续子段（遇中间展开详情自动分段，每段独立居中显示内容与底线，下段随展开进度平滑淡入）渲染
    for (const k of el._mg || []) { const c = el._cells[k]; c.classList.remove("sn-mg", "sn-mg-hide", "sn-mg-last", "sn-mg-wait", "sn-mg-hov", "sn-mg-sel"); c.style.gridColumn = ""; c._mgSeg = null; for (const v of ["--mg-h", "--mg-o", "--sn-mg-s", "--sn-mg-a"]) c.style.removeProperty(v); }
    el._mg = [];
    const live = merges.active(), am = merges.at(active.p, active.c), R2 = rgRect(), disp = R2 ? model.display().map((c) => c.key) : null;
    for (const x of live) {
      if (p < x.p0 || p > x.p1) continue;
      const segs = mergeSegs(src, x, cellH), s = segs.find((sg) => p >= sg.p0 && p <= sg.p1) ?? { p0: x.p0, p1: x.p1, dhBefore: 0, dhAfter: 0 };
      const a = el._cells[x.key0], y0 = src.rowY(s.p0), segH = src.rowY(s.p1) + cellH(s.p1) - y0, off = src.rowY(p) - y0, r0 = src.rowAt(x.p0);
      let midH = segH;
      if (segs.length > 1 && s === segs[0] && s.dhAfter > 0) {
        let sum = 0; for (let q = x.p0; q <= x.p1; q++) sum += cellH(q);
        midH = sum + (segH - sum) * Math.min(1, s.dhAfter / Math.min(DETAIL, 48));
      }
      const alpha = s.dhBefore > 0 ? Math.min(1, s.dhBefore / Math.min(DETAIL, 48)) : 1;
      a.classList.add("sn-mg"); a.classList.toggle("sn-mg-last", p === s.p1); a.classList.toggle("sn-mg-wait", r0 < 0); a.style.gridColumn = `span ${x.keys.length}`;
      a.classList.toggle("sn-mg-hov", hovMerge === x.m);
      a.classList.toggle("sn-mg-sel", Boolean(activeSelected && !R2 && am && am.m === x.m && !selShown));
      a._mgSeg = { m: x.m, y0, y1: y0 + segH, midH, h0: cellH(s.p0), h1: cellH(s.p1), ch, py: src.rowY(p) };
      a.style.setProperty("--mg-h", midH + "px"); a.style.setProperty("--mg-o", off + "px"); a.style.setProperty("--sn-mg-s", midH / 2 - off - ch / 2 + "px");
      if (alpha < .999) a.style.setProperty("--sn-mg-a", alpha.toFixed(3));
      if (r0 >= 0 && r0 !== r) fillCell(a, model.byKey[x.key0], r0); // 每一段都显示合并块首行内容，绝不留空白死洞
      el._mg.push(x.key0); for (const k of x.keys) if (k !== x.key0) { el._cells[k].classList.add("sn-mg-hide"); el._mg.push(k); }
    }
    for (const c of model.cols) {
      const cell = el._cells[c.key], m = cell.classList.contains("sn-mg") ? live.find((x) => x.key0 === c.key && p >= x.p0 && p <= x.p1) : null;
      cell.classList.toggle("sn-on", m ? m === am : p === active.p && c.key === active.c);
      let inR = false, t = false, b = false, l = false, rr = false;
      if (R2 && c.type !== "sel" && c.type !== "act" && !cell.classList.contains("sn-mg-hide")) { const ca = disp.indexOf(c.key), cb = ca + (m ? m.keys.length - 1 : 0); inR = p >= R2.p0 && p <= R2.p1 && ca >= R2.c0 && cb <= R2.c1; if (inR) { t = p === R2.p0; b = p === R2.p1; l = ca === R2.c0; rr = cb === R2.c1; } }
      cell.classList.toggle("sn-rg", inR); void t; void b; void l; void rr; // 整块均匀铺柔和淡底；外圈由 paintSelBox 的 1.5px 细框画
    }
  }
  // 行详情：使用的人给的 detail(el, row, 行号)（或 { init, fill }）往 .sn-g-detail 里填
  function fillDetail(el, r) { const f = typeof o.detail === "function" ? o.detail : o.detail?.fill; f?.(el._detail, src.row(r), r); }

  // 画看得见的行；要块；滚到底时（滚到底再加载模式）加载更多
  // 每一行这一帧的位移和透明度：拖行的让位 + 树的过渡（按行号取，整行）；数据刚到的淡入（120ms，40% → 100%）只淡格子里的内容（和 Canvas 版一样，底色、行线不跟着闪）
  const arrived = new Map(); let fading = false;
  function look(el, p, dy, now) {
    const r = el._r, id = src.tree ? src.idAt(p) : r, y = dy + (src.tree ? mo.y(id) : 0), op = src.tree ? mo.op(id) : 1, t = r >= 0 ? arrived.get(r) : undefined; let dk = 1;
    if (t != null) { const k = (now - t) / 120; if (k >= 1) arrived.delete(r); else { dk = .4 + .6 * Math.max(0, k); fading = true; } }
    el.style.transform = Math.abs(y) > .01 ? `translateY(${y.toFixed(2)}px)` : ""; el.style.opacity = op < .999 ? op.toFixed(3) : "";
    if (dk < 1) { el.classList.add("sn-dk"); el.style.setProperty("--sn-dk", dk.toFixed(3)); } else if (el.classList.contains("sn-dk")) { el.classList.remove("sn-dk"); el.style.removeProperty("--sn-dk"); }
  }
  const snapMerge = (x) => {
    const X0 = model.xOf(x.key0), X1 = model.xOf(x.keys.at(-1)) + model.byKey[x.keys.at(-1)].w, Y0 = src.rowY(x.p0), Y1 = src.rowY(x.p1) + cellH(x.p1), h0 = cellH(x.p0);
    const c0 = pool.find((r) => r._p === x.p0 && r.style.display !== "none")?._cells?.[x.key0];
    return { m: x.m, zone: merges.zoneOf(x.key0), x0: X0, w: X1 - X0, y0: Y0, h: Y1 - Y0, h0, html: c0 ? c0.innerHTML : "", right: model.byKey[x.key0]?.align === "right" };
  };
  const placeMfx = (el, zone, x0, y0, w, h) => {
    const gw = model.width(), rwc = model.rightW(), host = zone === "L" ? rgL : zone === "R" ? rgR : body, x = zone === "R" ? x0 - (gw - rwc) : x0;
    Object.assign(el.style, { left: x + "px", top: y0 + "px", width: w + "px", height: h + "px" });
    host.append(el);
  };
  const innerLines = (x, y0) => {
    const out = []; let cx = 0;
    for (let q = x.p0; q < x.p1; q++) out.push(`<i class="sn-h" style="top:${src.rowY(q) + cellH(q) - y0 - 1}px"></i>`);
    for (let i = 0; i < x.keys.length - 1; i++) { cx += model.byKey[x.keys[i]].w; out.push(`<i class="sn-v" style="left:${cx - 1}px"></i>`); }
    return out.join("");
  };
  function spawnMergeMelt(x) {
    if (reduced()) return;
    const s = snapMerge(x), html = s.w > 1 && s.h > 1 ? innerLines(x, s.y0) : ""; if (!html) return;
    const el = mk("div", "sn-g-mfx sn-g-mfx-melt", 1); el.innerHTML = html;
    placeMfx(el, s.zone, s.x0, s.y0, s.w - 1, s.h - 1); mfxEls.add(el);
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE_CSS.out, fill: "forwards" }), done = () => { el.remove(); mfxEls.delete(el); };
    a.onfinish = a.oncancel = done;
  }
  function spawnSplitGhost(lv) {
    if (reduced()) return;
    const s = lv.snap; if (!s || s.h <= 1 || s.w <= 1) return;
    const el = mk("div", "sn-g-mfx sn-g-mfx-ghost", 1);
    placeMfx(el, s.zone, s.x0, s.y0, s.w - 1, s.h - 1); mfxEls.add(el);
    if (s.html) {
      const b = mk("div", "sn-g-mfx-gbody" + (s.right ? " sn-r" : "")), dy0 = (s.h - s.h0) / 2; b.style.height = s.h0 + "px"; b.innerHTML = s.html; el.append(b);
      b.animate([{ transform: `translateY(${dy0}px)`, opacity: 1 }, { transform: `translateY(${(dy0 * .35).toFixed(1)}px)`, opacity: 0 }], { duration: 130, easing: EASE_CSS.out, fill: "forwards" });
    }
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: EASE_CSS.outStrong, fill: "forwards" }), done = () => { el.remove(); mfxEls.delete(el); };
    a.onfinish = a.oncancel = done;
  }
  function paintSplitPrev() {
    const am = splitPrev && activeSelected && !rgRect() ? merges.at(active.p, active.c) : null;
    if (!am) {
      if (splitPrevEl) { const old = splitPrevEl; splitPrevEl = null; old.classList.remove("sn-on"); setTimeout(() => old.remove(), 160); }
      return;
    }
    if (!splitPrevEl) splitPrevEl = mk("div", "sn-g-mfx sn-g-mfx-splitprev", 1);
    const s = snapMerge(am); splitPrevEl.innerHTML = innerLines(am, s.y0);
    placeMfx(splitPrevEl, s.zone, s.x0, s.y0, s.w, s.h);
    if (!splitPrevEl.classList.contains("sn-on")) { void splitPrevEl.offsetWidth; splitPrevEl.classList.add("sn-on"); }
  }
  const syncHovMerge = (m) => {
    if (hovMerge === m) return; hovMerge = m;
    for (const r of pool) if (r.style.display !== "none" && r._mg?.length) for (const k of r._mg) { const c = r._cells[k]; if (c._mgSeg) c.classList.toggle("sn-mg-hov", c._mgSeg.m === m); }
  };
  body.addEventListener("pointermove", (e) => syncHovMerge(e.target.closest?.(".sn-g-cell.sn-mg")?._mgSeg?.m || null));
  body.addEventListener("pointerleave", () => syncHovMerge(null));

  const xpool = [], morePool = []; let lastAppendN = 0; // 树的过渡里跑出渲染范围的行；滚到底再加载末尾的 3 行同构骨架行
  function render() {
    if (raf) cancelAnimationFrame(raf); raf = 0; const now = performance.now(); mo.tick(now); fading = false; if (arrived.size > 400) for (const [r, t] of arrived) if (now - t > 120) arrived.delete(r);
    const n = src.shown, st = vp.scrollTop, h = vp.clientHeight - HEAD, app = src.mode === "append";
    if (app) { if (n > lastAppendN && lastAppendN > 0 && !reduced()) for (let q = lastAppendN; q < Math.min(n, lastAppendN + 6); q++) { const rr = src.rowAt(q); if (rr >= 0) arrived.set(rr, now); } lastAppendN = n; } else lastAppendN = 0;
    body.style.height = src.rowsH() + tailH() + "px";
    const first = Math.max(0, src.rowAtY(st) - OVER), last = Math.min(n, src.rowAtY(st + h) + 1 + OVER), need = last - first, offs = rowDrag ? rowDrag.offs(first, last) : null;
    if (pool.length < need) { while (pool.length < need) pool.push(makeRow()); for (const r of pool) r._p = -1; }
    const { entered, left } = mergeFx.diff(merges.active(), now, snapMerge);
    for (const lv of left) spawnSplitGhost(lv);
    for (const x of entered) spawnMergeMelt(x);
    const size = pool.length, used = new Set();
    for (let p = first; p < last; p++) {
      const el = pool[p % size]; used.add(el);
      if (rowDrag?.hides(p)) { el.style.display = "none"; el._p = -1; continue; }
      if (editing && el.contains(editing.input)) continue;
      if (el._p !== p || el._v !== dver) fill(el, p);
      if (el._mg?.length) for (const k of el._mg) {
        const c = el._cells[k], sg = c._mgSeg; if (!sg) continue;
        let cy = sg.y0 + sg.midH / 2;
        const lo = Math.max(sg.y0 + sg.h0 / 2, st + sg.h0 / 2), hi = Math.min(sg.y1 - sg.h1 / 2, st + h - sg.h1 / 2);
        if (hi >= lo) cy = Math.max(lo, Math.min(hi, cy));
        const ep = mergeFx.enterP(sg.m, now);
        if (ep < 1) { cy = sg.y0 + sg.h0 / 2 + (cy - sg.y0 - sg.h0 / 2) * ep; fading = true; }
        c.style.setProperty("--sn-mg-s", (cy - sg.py - sg.ch / 2).toFixed(2) + "px");
      }
      look(el, p, offs?.[p - first] || 0, now);
    }
    for (const el of pool) if (!used.has(el)) { el.style.display = "none"; el._p = -1; }
    let xi = 0; if (mo.busy) for (const p of mo.extras(first, last)) { const el = xpool[xi] ?? (xpool[xi] = makeRow()); el.classList.add("sn-g-xrow"); xi++; if (el._p !== p || el._v !== dver) fill(el, p); look(el, p, 0, now); }
    for (let j = xi; j < xpool.length; j++) if (xpool[j]._p !== -1) { xpool[j].style.display = "none"; xpool[j]._p = -1; }
    src.ensure(first, last);
    if (app && last >= n - 4) src.more();
    // 滚到底再加载：有更多数据时展示 3 行同构渐隐骨架行（零文字加载），全部到底时居中克制收尾
    const yTail = src.rowY(n), showMore = app && src.hasMore && yTail < st + h + OVER * RH;
    if (showMore) for (let j = 0; j < SK_MORE; j++) {
      const el = morePool[j] ?? (morePool[j] = Object.assign(makeRow(), {}));
      if (!el.classList.contains("sn-g-more")) { el.classList.add("sn-sk", "sn-g-more"); el.setAttribute("aria-hidden", "true"); el.style.setProperty("--sn-sk-i", j); }
      el.style.display = ""; el.style.top = yTail + j * RH + "px"; el.dataset.skv = String((n + j) % 3); el.classList.toggle("sn-loading", src.appending);
    } else for (const el of morePool) el.style.display = "none";
    const showEnd = app && !src.hasMore && src.total > 0;
    foot.style.top = yTail + "px"; foot.hidden = !showEnd;
    if (showEnd) foot.innerHTML = `<span class="sn-g-foot-in">${esc(tt("grid.25", { p0: src.total.toLocaleString("zh-CN") }))}</span>`;
    rowDrag?.paint(); shade(); paintSelBox(); paintSplitPrev(); if (rowDrag?.anim || mo.busy || fading || mergeFx.busy) schedule();
    root._grid?.onFrame?.(now);
  }
  function shade() { bars.refresh(); shades(root, vp, model, src.rowsH() + tailH()); }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  const edges = () => { root.classList.toggle("sn-sx", vp.scrollLeft > 0); root.classList.toggle("sn-ex", vp.scrollLeft + vp.clientWidth < vp.scrollWidth - 1); };
  vp.addEventListener("scroll", () => { edges(); schedule(); }, { passive: true });
  // 表格不回弹：一次滚动在表格里开始，滚到头就停住、不带着页面滚；开始时已经到头，交给页面接着滚（见 kit-scroll.js 的 elastic）
  elastic(vp, () => ({ overscroll: "auto" }), () => { vp.style.overscrollBehaviorY = ""; });
  new ResizeObserver(() => { edges(); shade(); schedule(); }).observe(vp);

  const barUI = mountToolbar(root, src, model, { $, initSeg, seg: "gmode", treeSeg: "gtree", selCount, onMode: () => { vp.scrollTop = 0; }, onTree: setTreeMode, onExpandAll: expandAll, ...(o.treeCount && { rootsText: (n) => o.treeCount(n, -1) }) });
  const paintBar = () => { barUI.paint(); selChanged(); }; // 工具条（勾了几行）跟着勾选重画的地方，顺手发 selectionChange

  // ———— 格子：选中、框选、键盘、编辑 ————
  // 规范：单格修改框选只出现在可文字内容编辑（edit 且非 enum 选择器）单元格上，选择器列与只读列绝不出修改框选；
  // 键盘导航经过选择器 / 只读格时仅铺极淡中性定位底色（无边框）；网格模式下按住格子拖动 ≥4px 跨多格才出范围框选（用于合并）。
  const posOf = (el) => +el.closest(".sn-g-row")._p;
  const INTERACTIVE = "a,button,input,textarea,select,label,[role=button],[role=combobox],[role=switch],[role=checkbox],[contenteditable],.sn-select,.sn-switch,.sn-check,.sn-radio,.sn-btn,.sn-link";
  const isTextEditable = (col) => Boolean(col && col.edit && col.edit !== "enum" && col.type !== "sel" && col.type !== "act");
  const activeEditable = () => { const am = merges.at(active.p, active.c); return isTextEditable(model.byKey[am ? am.key0 : active.c]); };
  let selShown = false, activeSelected = false, kbdNav = false, rg = null; // rg：多格范围框选 { ap, ac, fp, fc }
  const showSel = (on, kbd = false) => {
    const nextSel = !!on, nextKbd = nextSel && !!kbd, nextShow = nextSel && activeEditable();
    if (activeSelected !== nextSel || kbdNav !== nextKbd || selShown !== nextShow) {
      activeSelected = nextSel; kbdNav = nextKbd; selShown = nextShow;
      root.classList.toggle("sn-sel-on", nextShow);
      dver++; syncMergeBar(); schedule();
    }
  }; // 框由 render 里的 paintSelBox 摆，变了就排一帧
  const dataKeys = () => model.display().filter((c) => c.type !== "sel" && c.type !== "act").map((c) => c.key);
  const anchorOf = (p, c) => { const x = merges.at(p, c); return x ? [x.p0, x.key0] : [p, c]; }; // 落在合并块里就换成块的左上角
  function setActive(p, c, reveal = true) {
    [p, c] = anchorOf(Math.max(0, Math.min(src.shown - 1, p)), c); active = { p, c, id: src.idAt(p) };
    if (activeSelected) { selShown = activeEditable(); root.classList.toggle("sn-sel-on", selShown); }
    dver++; schedule(); if (reveal) revealActive(); syncMergeBar();
  }
  function revealActive() {
    const x = merges.at(active.p, active.c), top = src.rowY(active.p), rh = x ? src.rowY(x.p1 + 1) - top : src.rowH(active.p), h = vp.clientHeight - HEAD;
    if (top < vp.scrollTop) vp.scrollTop = top; else if (top + rh > vp.scrollTop + h) vp.scrollTop = Math.min(top, top + rh - h);
    const col = model.byKey[active.c]; if (col.pin) return; const x0 = model.xOf(active.c), w = x ? x.keys.reduce((t, k) => t + model.byKey[k].w, 0) : col.w, lo = vp.scrollLeft + model.leftW(), hi = vp.scrollLeft + vp.clientWidth - model.rightW();
    if (x0 < lo) vp.scrollLeft = x0 - model.leftW(); else if (x0 + w > hi) vp.scrollLeft = Math.min(x0 - model.leftW(), x0 + w - vp.clientWidth + model.rightW());
  }
  // 多格范围框选的矩形：仅网格模式下有效，行号区间、列序号区间；碰到的合并块整块算进来；单格或单个已有合并块本身不算范围框选
  function rgRect() {
    if (!rg || !merges.enabled) return null; const disp = model.display().map((c) => c.key);
    const aci = disp.indexOf(rg.ac), fci = disp.indexOf(rg.fc); if (aci < 0 || fci < 0) return null;
    const z = merges.zoneOf(rg.ac), okIdx = disp.map((k, i) => (merges.zoneOf(k) === z && model.byKey[k].type !== "sel" && model.byKey[k].type !== "act" ? i : -1)).filter((i) => i >= 0);
    if (!okIdx.length) return null;
    const clampI = (i) => Math.max(okIdx[0], Math.min(okIdx.at(-1), i)); // 框选只在起点所在那一区里走（固定列、普通列分开，和合并的规则一致）
    let p0 = Math.min(rg.ap, rg.fp), p1 = Math.max(rg.ap, rg.fp), c0 = clampI(Math.min(aci, fci)), c1 = clampI(Math.max(aci, fci));
    for (let more = true, n = 0; more && n < 8; n++) { more = false; for (const x of merges.active()) { if (x.p1 < p0 || x.p0 > p1 || x.c1 < c0 || x.c0 > c1) continue; if (x.p0 < p0) { p0 = x.p0; more = true; } if (x.p1 > p1) { p1 = x.p1; more = true; } if (x.c0 < c0) { c0 = x.c0; more = true; } if (x.c1 > c1) { c1 = x.c1; more = true; } } }
    const keys = disp.slice(c0, c1 + 1);
    if (p0 === p1 && c0 === c1) return null;
    const am = merges.at(p0, keys[0]);
    if (am && am.p0 === p0 && am.p1 === p1 && am.c0 === c0 && am.c1 === c1) return null;
    return { p0, p1, c0, c1, keys };
  }
  body.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; const rowEl = e.target.closest(".sn-g-row"); if (!rowEl || rowEl.classList.contains("sn-g-xrow") || rowEl.classList.contains("sn-g-lift")) return; const p = rowEl._p;
    if (src.tree && e.target.closest(".sn-g-exp")) { e.preventDefault(); rg = null; showSel(false); toggleTree(p); return; } // 树形：展开下级（值还没到的行也能展开，结构是知道的）
    if (rowEl.classList.contains("sn-sk")) return;
    if (e.target.closest(".sn-g-rh")) { rg = null; showSel(false); startRowResize(rowEl, e); return; }
    if (e.target.closest(".sn-g-exp")) { e.preventDefault(); rg = null; showSel(false); toggleExpand(p); return; }
    const cell = e.target.closest(".sn-g-cell"); if (!cell) { rg = null; showSel(false); return; }
    if (e.target.closest(".sn-g-grip")) { rg = null; showSel(false); (src.tree ? startTreeDrag : startRowDrag)(rowEl, e); return; }
    if (e.target.closest(".sn-check")) { e.preventDefault(); rg = null; showSel(false); const r = rowEl._r; if (e.shiftKey && anchorP >= 0) { const on = !isSel(r); for (let q = Math.min(anchorP, p); q <= Math.max(anchorP, p); q++) { const rr = src.tree ? src.idAt(q) : src.rowAt(q); if (rr >= 0) toggleSel(rr, on); } } else toggleSel(r); anchorP = p; dver++; schedule(); paintBar(); headUI.paint(); if (isSel(r)) popCheck(rowEl._cells[SEL].querySelector(".sn-box")); return; } // 树形：勾上一级 = 勾上它下面所有的
    if (e.target.closest(".sn-g-ab")) { rg = null; showSel(false); return; }
    if (editing && cell.contains(editing.input)) return;
    if (e.target.closest(INTERACTIVE)) { rg = null; showSel(false); return; } // 自定义 render 内的选择器、按钮、开关、链接：不抢焦点、不出框选
    const key = cell.dataset.c; if (special(key)) { rg = null; showSel(false); return; }
    e.preventDefault(); vp.focus({ preventScroll: true });
    if (e.shiftKey && activeSelected && merges.enabled) {
      kbdNav = false;
      const ap = rg?.ap ?? active.p, ac = rg?.ac ?? active.c;
      const [a0, k0] = anchorOf(ap, ac), [b0, k1] = anchorOf(p, key);
      rg = a0 === b0 && k0 === k1 ? null : { ap, ac, fp: p, fc: key };
      dver++; schedule(); syncMergeBar(); return;
    }
    rg = null; setActive(p, key, false); showSel(true, false);
    if (merges.enabled) startRangeDrag(e, active.p, active.c);
  });
  // 按住格子拖：框选一块（仅在网格模式下启用）。先动 4px 才算；拖回起点格时清掉范围选区；拖到边上自动滚；指针出了表格就停在边上那一格
  function startRangeDrag(e, ap, ac) {
    let px = e.clientX, py = e.clientY, raf3 = 0, done = false, moved = false;
    const cellAt = (x, y) => { const vr = vp.getBoundingClientRect(); x = Math.max(vr.left + 2, Math.min(vr.left + vp.clientWidth - 2, x)); y = Math.max(vr.top + HEAD + 2, Math.min(vr.top + vp.clientHeight - 2, y)); const c = document.elementFromPoint(x, y)?.closest(".sn-g-cell"); if (!c || !body.contains(c)) return null; const k = c.dataset.c; return special(k) ? null : [posOf(c), k]; };
    const applyPt = (h) => {
      if (!h) return;
      const [bp, bk] = anchorOf(h[0], h[1]);
      if (bp === ap && bk === ac) { if (rg) { rg = null; dver++; schedule(); syncMergeBar(); } return; }
      if (!rg || rg.fp !== h[0] || rg.fc !== h[1]) { rg = { ap, ac, fp: h[0], fc: h[1] }; dver++; schedule(); syncMergeBar(); }
    };
    const tick = () => {
      raf3 = 0; if (done) return; const vr = vp.getBoundingClientRect(), top = vr.top + HEAD + 24, bot = vr.top + vp.clientHeight - 24, lf = vr.left + model.leftW() + 24, rt = vr.left + vp.clientWidth - model.rightW() - 24;
      const dy = py < top ? -(top - py) / 3 : py > bot ? (py - bot) / 3 : 0, dx = px < lf ? -(lf - px) / 3 : px > rt ? (px - rt) / 3 : 0;
      if (dy) vp.scrollTop += Math.max(-24, Math.min(24, dy)); if (dx) vp.scrollLeft += Math.max(-24, Math.min(24, dx));
      applyPt(cellAt(px, py));
      if (dx || dy) raf3 = requestAnimationFrame(tick);
    };
    const mv = (ev) => { px = ev.clientX; py = ev.clientY; if (!moved) { if (Math.hypot(px - e.clientX, py - e.clientY) < 4) return; moved = true; try { body.setPointerCapture(ev.pointerId); } catch {} } if (!raf3) raf3 = requestAnimationFrame(tick); };
    const fin = () => { if (done) return; done = true; if (moved && raf3) { cancelAnimationFrame(raf3); raf3 = 0; applyPt(cellAt(px, py)); } cancelAnimationFrame(raf3); for (const [t, f] of evs) body.removeEventListener(t, f); removeEventListener("pointerup", fin); };
    const evs = [["pointermove", mv], ["pointerup", fin], ["pointercancel", fin], ["lostpointercapture", fin]];
    for (const [t, f] of evs) body.addEventListener(t, f); addEventListener("pointerup", fin); // 没拿到捕获时在窗口上收尾
  }
  body.addEventListener("click", (e) => { const b = e.target.closest(".sn-g-ab"); if (!b) return; const p = posOf(b); if (b.dataset.act === "detail") { toggleExpand(p); return; } if (b.dataset.act === "edit") { setActive(p, NAME, false); showSel(true, false); vp.focus({ preventScroll: true }); startEdit(); } else { const r = src.rowAt(p); if (r >= 0) emit("rowAction", { action: b.dataset.act, row: src.row(r), rowKey: keyOf(r), index: p }); } });
  // 点一行（数据格子，不算勾选框、把手、操作按钮、展开箭头、自定义交互控件）：rowClick
  body.addEventListener("click", (e) => { if (e.target.closest(".sn-check, .sn-g-grip, .sn-g-ab, .sn-g-exp, .sn-cell-ed") || e.target.closest(INTERACTIVE)) return; const cell = e.target.closest(".sn-g-cell"); if (!cell) return; const p = posOf(cell), r = src.rowAt(p); if (r >= 0) emit("rowClick", { row: src.row(r), rowKey: keyOf(r), key: cell.dataset.c, index: p }); });
  body.addEventListener("dblclick", (e) => { const rh = e.target.closest(".sn-g-rh"); if (rh) { resetRowH(rh.closest(".sn-g-row")); return; } const cell = e.target.closest(".sn-g-cell"); if (!cell || e.target.closest(".sn-check, .sn-g-grip, .sn-g-ab, .sn-g-exp") || e.target.closest(INTERACTIVE)) return; const k = cell.dataset.c; if (special(k)) return; rg = null; setActive(posOf(cell), k, false); showSel(true, false); startEdit(); });
  head.addEventListener("pointerdown", () => { rg = null; showSel(false); }); // 点表头（排序、筛选、拖列、改列宽）
  // 表格里任何地方按下、打字：先把还在等落位的拖行落好；正在编辑时点了别处，先把编辑存下来（不合法就停在编辑框里，这一下不生效）——拖得起来，不用多点一次
  root.addEventListener("pointerdown", (e) => { flushDrop(); if (editing?.input && !editing.cell.contains(e.target) && editing.end(true, 0, false) === false) { e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener("keydown", () => flushDrop(), true);
  vp.parentElement.addEventListener("pointerdown", (e) => { if (e.target.closest(".sn-g-sb")) { rg = null; showSel(false); } }); // 点滚动条
  vp.addEventListener("keydown", (e) => {
    if (editing) return; const disp = dataKeys(), ci = disp.indexOf(active.c), page = Math.max(1, Math.floor((vp.clientHeight - HEAD) / RH) - 1);
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveByKey(e.key === "ArrowUp" ? -1 : 1); return; }
    if (e.key === "Escape") { if (rg || selShown || activeSelected) { e.preventDefault(); rg = null; showSel(false); dver++; schedule(); } return; }
    const nav = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
    if (nav && e.shiftKey && merges.enabled) {
      e.preventDefault(); showSel(true, true);
      const b = rg || { ap: active.p, ac: active.c, fp: active.p, fc: active.c };
      const fp = Math.max(0, Math.min(src.shown - 1, b.fp + nav[0])), fc = disp[Math.max(0, Math.min(disp.length - 1, disp.indexOf(b.fc) + nav[1]))];
      const [a0, k0] = anchorOf(b.ap, b.ac), [f0, fk] = anchorOf(fp, fc);
      rg = a0 === f0 && k0 === fk ? null : { ...b, fp, fc };
      dver++; schedule(); syncMergeBar(); return;
    }
    const go = (p, c) => { e.preventDefault(); rg = null; setActive(p, c ?? active.c); showSel(true, true); };
    const am = merges.at(active.p, active.c), cEnd = am ? disp.indexOf(am.keys.at(-1)) : ci; // 从合并块出来时越过整块
    // 树形，在名称格上：右键展开（已经展开或没有下级时往右走一格），左键收起、再按走到上级（和简单表格一样）
    if (src.tree && active.c === NAME && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const id = src.idAt(active.p), has = src.hasKids(id), op = has && src.isOpen(id); showSel(true, true);
      if (e.key === "ArrowRight" && has && !op) { e.preventDefault(); toggleTree(active.p, true); return; }
      if (e.key === "ArrowLeft" && op) { e.preventDefault(); toggleTree(active.p, false); return; }
      if (e.key === "ArrowLeft" && src.parentOf(id) >= 0) { const pp = src.findPos(src.parentOf(id)); if (pp >= 0) return go(pp, NAME); }
    }
    switch (e.key) {
      case "ArrowDown": return go((am ? am.p1 : active.p) + 1); case "ArrowUp": return go(active.p - 1);
      case "ArrowRight": return go(active.p, disp[Math.min(disp.length - 1, cEnd + 1)]); case "ArrowLeft": return go(active.p, disp[Math.max(0, ci - 1)]);
      case "Tab": return go(active.p, disp[Math.max(0, Math.min(disp.length - 1, e.shiftKey ? ci - 1 : cEnd + 1))]);
      case "PageDown": return go(active.p + page); case "PageUp": return go(active.p - page);
      case "Home": return e.ctrlKey || e.metaKey ? go(0) : go(active.p, disp[0]); case "End": return e.ctrlKey || e.metaKey ? go(src.shown - 1) : go(active.p, disp.at(-1));
      case "Enter": case "F2": e.preventDefault(); showSel(true, true); startEdit(); return;
      case " ": { e.preventDefault(); const r = src.rowAt(active.p); if (r >= 0) { toggleSel(r); dver++; schedule(); paintBar(); headUI.paint(); if (isSel(r)) popCheck(cellEl(active.p, "sel")?.querySelector(".sn-box")); } return; }
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const col = model.byKey[active.c]; if (isTextEditable(col)) { e.preventDefault(); showSel(true, true); startEdit(e.key); } }
  });
  function cellEl(p, key) { const row = pool.find((r) => r._p === p && r.style.display !== "none"); return row?._cells[key]; }
  function startEdit(initial) {
    const col = model.byKey[active.c], r = src.rowAt(active.p); if (!col.edit || r < 0) return;
    revealActive(); render(); const cell = cellEl(active.p, col.key); if (!cell) return;
    const cur = src.val(r, col.key);
    if (col.edit === "enum") {
      const wasKbd = kbdNav;
      editing = { input: null }; showSel(false); cell.classList.add("sn-editing");
      openEnum(cell.getBoundingClientRect(), col, optionOf(col, cur)?.i ?? -1, (k, step) => {
        editing = null; cell.classList.remove("sn-editing");
        const nv = optionValue(col, k, cur); if (nv !== cur) commitEdit(r, col.key, nv, cur);
        if (step) { moveActive(step); showSel(true, true); vp.focus({ preventScroll: true }); }
        else if (wasKbd) { showSel(true, true); vp.focus({ preventScroll: true }); }
        dver++; schedule();
      }, () => {
        editing = null; cell.classList.remove("sn-editing");
        if (wasKbd) { showSel(true, true); vp.focus({ preventScroll: true }); }
        dver++; schedule();
      });
      return;
    }
    const input = document.createElement("input"); input.className = "sn-cell-ed" + (col.align === "right" ? " sn-r" : ""); input.value = initial ?? editText(col, cur); input.spellcheck = false;
    cell.append(input); cell.classList.add("sn-editing");
    if (cell.classList.contains("sn-mg")) { const H = parseFloat(cell.style.getPropertyValue("--mg-h")), ih = cell.offsetHeight - 8; Object.assign(input.style, { top: Math.max(4, H / 2 - ih / 2) + "px", bottom: "auto", height: ih + "px" }); cell.closest(".sn-g-row").classList.add("sn-g-editrow"); }
    input.focus({ preventScroll: true }); if (initial == null) input.select();
    editing = { input, cell, col, r, end: (c, st, rf) => end(c, st, rf) };
    const end = (commit, step = 0, refocus = true) => {
      if (!editing) return;
      if (commit) { const res = parseEdit(col, input.value); if (res.error) { showErr(cell, res.error); input.focus({ preventScroll: true }); return false; } if (res.value !== cur) commitEdit(r, col.key, res.value, cur); }
      hideErr(); input.remove(); cell.classList.remove("sn-editing"); cell.closest(".sn-g-row")?.classList.remove("sn-g-editrow"); editing = null; dver++; schedule();
      if (refocus) vp.focus({ preventScroll: true });
      if (step === "down") { const am = merges.at(active.p, active.c); setActive((am ? am.p1 : active.p) + 1, active.c); showSel(true, true); }
      else if (step) { moveActive(step); showSel(true, true); }
      return true;
    };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); end(true, "down"); } else if (e.key === "Escape") { e.preventDefault(); end(false); } else if (e.key === "Tab") { e.preventDefault(); end(true, e.shiftKey ? -1 : 1); } });
    input.addEventListener("input", hideErr);
    input.addEventListener("blur", () => setTimeout(() => editing?.input === input && end(true, 0, false), 0));
  }
  // 改了一个值：本地先生效、格子闪一下、发 cellEdit（{ row（改之前的行）, rowKey, key, value, oldValue }）
  function commitEdit(r, key, value, oldValue) { const row = src.row(r); src.edit(r, key, value); flash(r, key); emit("cellEdit", { row, rowKey: keyOf(r), key, value, oldValue }); }
  const moveActive = (step) => { const disp = model.display().filter((c) => c.type !== "sel" && c.type !== "act").map((c) => c.key), ci = disp.indexOf(active.c); setActive(active.p, disp[Math.max(0, Math.min(disp.length - 1, ci + step))]); };
  let errEl = null;
  function showErr(cell, msg) { hideErr(); cell.classList.add("sn-bad"); errEl = document.createElement("div"); errEl.className = "sn-g-err"; errEl.textContent = msg; document.body.append(errEl); const r = cell.getBoundingClientRect(); errEl.style.left = r.left + "px"; errEl.style.top = r.bottom + 4 + "px"; errEl._cell = cell; }
  function hideErr() { if (errEl) { errEl._cell.classList.remove("sn-bad"); errEl.remove(); errEl = null; } }
  // 改完值格子闪一下：格子里叠一层成功色的底，只动它的透明度，播完拿掉（不动格子自己的 background-color）
  function flash(r, key) { requestAnimationFrame(() => { const row = pool.find((x) => x._r === r && x.style.display !== "none"); const c = row?._cells[key]; if (!c || reduced()) return; const f = document.createElement("i"); f.className = "sn-g-flashbox"; f.setAttribute("aria-hidden", "true"); c.append(f); f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: EASE_CSS.out }).onfinish = () => f.remove(); }); }

  // ———— 拖行换位置（跟手） ————
  // 按住把手移动 4px 才算拿起：这一行浮起来（一层投影，160ms 淡入），一比一跟着指针上下走，不缓动；其他行逐帧缓动让开，
  // 让出来的空位就是落点（淡底 + 一圈细线，和让开的行同一条缓动）。松手：行从指针那里缓动落进空位，投影同时淡掉，再真正换顺序。
  // 拖到表格外 40px 以外 = 拿出去了：行变淡，其他行回原位，空位回到原处，松手就回原处；Esc、窗口失焦、指针被系统收走也取消。
  // 靠近上下边缘自动滚，被拖的行一直在指针下面；拖着时滚轮滚了也跟着重算；合并块里的行不能单独拖，落点不会插进合并块中间。
  function startRowDrag(row, e) {
    e.preventDefault(); flushDrop();
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("grid.27") }); return; }
    const p0 = row._p; if (merges.active().some((x) => x.p1 > x.p0 && p0 >= x.p0 && p0 <= x.p1)) { toast({ icon: "info", tone: "info", text: tt("grid.28") }); return; }
    const H0 = () => src.rowH(p0), y0 = src.rowY(p0), n = src.shown, fr = vp.parentElement, sx = e.clientX, sy = e.clientY, s0 = vp.scrollTop, tgt = e.target;
    let to = p0, py = sy, px = sx, raf2 = 0, out = false, done = false, on = false, anim = false, lastTop = s0, lift = 0, gapY = y0, liftEl = null, gapEl = null;
    const slot = (t) => (t <= p0 ? src.rowY(t) : src.rowY(t + 1) - H0()); // 放到第 t 位时它的顶部在哪
    const nearest = (y) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (slot(m) <= y) lo = m; else hi = m - 1; } return lo + 1 < n && Math.abs(slot(lo + 1) - y) < Math.abs(y - slot(lo)) ? lo + 1 : lo; };
    // 落点不插进合并块中间：插进去了就挪到块的前面或后面（哪边近去哪边）
    const snap = (t) => { for (const x of merges.active()) { if (x.p1 === x.p0) continue; if (x.p0 > p0 && t >= x.p0 && t <= x.p1 - 1) return t - (x.p0 - 1) <= x.p1 - t ? x.p0 - 1 : x.p1; if (x.p1 < p0 && t >= x.p0 + 1 && t <= x.p1) return t - x.p0 <= x.p1 + 1 - t ? x.p0 : x.p1 + 1; } return t; };
    // 被拖的行现在的顶部：拿起的位置 + 指针移动的距离 + 拖着时滚动的距离（最多拖出第一行、最后一行半行）
    // 被拖的行现在的顶部：拿起的位置 + 指针移动 + 拖着时滚动；夹在第一行和最后一行之间（不再放宽半行），也不盖到表头上、不跑出底边
    const follow = () => dragClamp(y0 + py - sy + vp.scrollTop - s0, 0, slot(n - 1), vp.scrollTop, vp.clientHeight - HEAD, H0());
    let lt = 0, was = false;
    const begin = () => {
      on = true; vp.classList.add("sn-rowdrag");
      gapEl = mk("i", "sn-g-gap"); gapEl2 = mk("i", "sn-g-gap"); body.append(gapEl, gapEl2); gOrder = gapOrder();
      liftEl = makeRow(); fill(liftEl, p0); liftEl.classList.add("sn-g-lift"); // 被拖的行单独一块：复用的行元素滚动时会换内容，被拖的行也可能离开渲染范围
      rowDrag = {
        p0, hides: (p) => p === p0, get out() { return out; }, get anim() { return anim; },
        // 每帧一次：让开的行、空位按指数缓动（时间常数 40ms；第一步按一帧算）；被拖的行跟手，松手后才缓动落进空位（取消就回原处）
        offs(a, z) { // 空位先走（只有它一个值缓动），别的行按空位摆（slotShift）：被越过的几行连在一起让开
          const now = performance.now(), dt = was ? Math.min(34, now - lt) : 16.7; lt = now; anim = false; const k = 1 - Math.exp(-dt / 40), res = [], back = out || done === "cancel";
          const ease = (c, tg) => { c += (tg - c) * k; if (Math.abs(tg - c) < .3) return tg; anim = true; return c; };
          const H = H0(), gt = back ? src.rowY(p0) : slot(to); gapY = gapStep(gapY, gt, k, dt, src.rowH(gapY < src.rowY(p0) ? src.rowAtY(gapY) : src.rowAtY(gapY + H))); if (gapY !== gt) anim = true;
          lift = done ? ease(lift, back ? 0 : slot(to) - src.rowY(p0)) : follow() - src.rowY(p0);
          for (let p = a; p < z; p++) res.push(p === p0 ? 0 : slotShift(src.rowY(p), src.rowH(p), p < p0, H, gapY));
          was = anim; return res;
        },
        paint() {
          const sl = vp.scrollLeft + "px", h = H0();
          liftEl.style.transform = `translateY(${lift}px)`; liftEl.style.setProperty("--sn-sl", sl); liftEl.classList.toggle("sn-out", out && !done); liftEl.classList.toggle("sn-settle", !!done);
          const before = gapY < src.rowY(p0), rr = src.rowAtY(before ? gapY : gapY + h);
          paintGaps([gapEl, gapEl2], gOrder(gapPieces(gapY, h, [src.rowY(rr) - (before ? 0 : h), src.rowH(rr)])), sl);
        },
      };
      dver++; schedule();
    };
    const upd = () => {
      const r = fr.getBoundingClientRect(); out = px < r.left - 40 || px > r.right + 40 || py < r.top - 40 || py > r.bottom + 40;
      to = out ? p0 : snap(nearest(Math.max(0, Math.min(slot(n - 1), follow())))); schedule();
    };
    const tick = () => { if (on && vp.scrollTop !== lastTop) { lastTop = vp.scrollTop; upd(); } if (on && !out && !done) { const vr = vp.getBoundingClientRect(), top = vr.top + HEAD + 36, bot = vr.top + vp.clientHeight - 36, sp = py < top ? -(top - py) / 2.5 : py > bot ? (py - bot) / 2.5 : 0; if (sp) { vp.scrollTop += Math.max(-28, Math.min(28, sp)); upd(); } } raf2 = requestAnimationFrame(tick); };
    raf2 = requestAnimationFrame(tick);
    try { tgt.setPointerCapture(e.pointerId); } catch {}
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(true); } }, onBlur = () => fin(true);
    const evs = [["pointermove", (ev) => { px = ev.clientX; py = ev.clientY; if (!on) { if (Math.hypot(px - sx, py - sy) < 4) return; begin(); } upd(); }], ["pointerup", () => fin(false)], ["pointercancel", () => fin(true)], ["lostpointercapture", () => fin(true)]];
    for (const [t, f] of evs) tgt.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
    function fin(cancel) {
      if (done) return; cancelAnimationFrame(raf2); for (const [t, f] of evs) tgt.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur);
      if (!on) { done = true; return; }
      done = cancel || out ? "cancel" : "drop"; if (done === "cancel") to = p0;
      // 等被拖的行落进空位、让开的行回位、投影淡掉（至少 160ms），再真正换顺序、清掉偏移——画面不跳
      let landed = false; const t0 = performance.now(), finish = () => {
        if (landed) return; landed = true; if (pendingDrop === finish) pendingDrop = null;
        vp.classList.remove("sn-rowdrag"); rowDrag = null; liftEl.remove(); gapEl.remove(); gapEl2?.remove();
        if (to !== p0) { src.move(p0, to); if (active.p === p0) active.p = to; else if (p0 < to && active.p > p0 && active.p <= to) active.p--; else if (p0 > to && active.p >= to && active.p < p0) active.p++; active.id = src.idAt(active.p); }
        for (const r of pool) r.style.transform = ""; dver++; render(); syncMergeBar();
      };
      pendingDrop = finish; const wait = () => { if (landed) return; const t = performance.now() - t0; if (!reduced() && (rowDrag?.anim || t < 160) && t < 800) { schedule(); requestAnimationFrame(wait); } else finish(); };
      schedule(); requestAnimationFrame(wait);
    }
  }
  // ———— 树形拖行：只在同一组兄弟里换位置，连同展开着的下级一起走（treeDrag 算兄弟、落点、让位，两版共用） ————
  // 手感和平铺一样：按住把手动 4px 拿起，被拖的块浮起来（一层投影）一比一跟着指针，别的块整块缓动让开，让出来的空位就是落点；松手缓动落进空位再真正换顺序。
  // 拿起时展开收起的过渡还在走：收起马上做完，每一行从现在看到的位置接着走；排序时也能拖（松手后排好的顺序就当成手动顺序，排序标记去掉）
  function startTreeDrag(row, e) {
    e.preventDefault(); flushDrop();
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("grid.29") }); return; }
    const id0 = src.idAt(row._p); if (id0 < 0) return;
    if (merges.active().some((x) => x.p1 > x.p0 && row._p >= x.p0 && row._p <= x.p1)) { toast({ icon: "info", tone: "info", text: tt("grid.28") }); return; }
    const fr = vp.parentElement, sx = e.clientX, tgt = e.target, off = new Map(), lifts = [];
    let D = null, y0 = 0, s0 = 0, to = 0, sy = e.clientY, py = sy, px = sx, raf2 = 0, out = false, done = false, on = false, anim = false, lastTop = 0, lift = 0, gapY = 0, gapEl = null, boxEl = null, lt = 0, was = false, wait = false;
    // 被拖的块现在的顶部：拿起时看到的位置 + 指针移动 + 拖着时滚动（最多拖出这一组兄弟的首尾半块）
    const follow = () => dragClamp(y0 + py - sy + vp.scrollTop - s0, D.lo(), D.hi(), vp.scrollTop, vp.clientHeight - HEAD, D.H()); // 夹在这一组兄弟的首尾之内，也不盖到表头上
    const begin = () => {
      const seed = mo.release(), p0 = src.findPos(id0); if (p0 < 0) return false; // 展开收起还在动：收起马上做完，现在每一行的位移交给拖行接着走
      D = treeDrag(src, merges, p0); on = true; vp.classList.add("sn-rowdrag");
      for (const [p, v] of seed) if (!D.inMe(p)) off.set(p, v);
      lift = seed.get(p0) ?? 0; y0 = src.rowY(p0) + lift; s0 = vp.scrollTop; lastTop = s0; gapY = y0; to = D.idx;
      gapEl = mk("i", "sn-g-gap"); gapEl2 = mk("i", "sn-g-gap"); body.append(gapEl, gapEl2); gOrder = gapOrder();
      boxEl = document.createElement("i"); boxEl.className = "sn-g-liftbox"; body.append(boxEl); liftIn(boxEl); // 整块一层投影（每一行各画一层会在行和行之间叠出暗线）
      rowDrag = {
        tree: true, hides: (p) => D.inMe(p), get out() { return out; }, get anim() { return anim; },
        abort() { cancelAnimationFrame(raf2); for (const [t, f] of evs) tgt.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur); done = "cancel"; if (pendingDrop) pendingDrop = null; vp.classList.remove("sn-rowdrag"); rowDrag = null; for (const el of lifts) el.remove(); gapEl.remove(); gapEl2?.remove(); boxEl.remove(); for (const r of pool) r.style.transform = ""; }, // 视图换了：位置都不对了，马上放回去（不换顺序）
        offs(a, z) {
          const now = performance.now(), dt = was ? Math.min(34, now - lt) : 16.7; lt = now; anim = false; const k = 1 - Math.exp(-dt / 40), res = [], back = out || done === "cancel";
          const ease = (c, tg) => { c += (tg - c) * k; if (Math.abs(tg - c) < .3) return tg; anim = true; return c; };
          const home = src.rowY(D.me.p), gt = back ? home : D.slotTop(to); gapY = gapStep(gapY, gt, k, dt, D.hAt(gapY)); if (gapY !== gt) anim = true; lift = done ? ease(lift, back ? 0 : D.slotTop(to) - home) : follow() - home; /* 空位先走（每帧有上限），别的块按空位摆 */
          for (let p = a; p < z; p++) { if (D.inMe(p)) { res.push(0); continue; } let v = D.shift(p, gapY); const r = off.get(p); if (r) { const r2 = r * (1 - k); if (Math.abs(r2) < .3) off.delete(p); else { off.set(p, r2); anim = true; v += r2; } } res.push(v); } /* off：拿起时还在动的行剩下的那点位移，缓动掉 */
          was = anim; return res;
        },
        paint() { // 被拖的块里这一帧看得见的那几行（块可能比视口还高）
          const sl = vp.scrollLeft + "px", h = D.H(), st = vp.scrollTop, vh = vp.clientHeight - HEAD, home = src.rowY(D.me.p); let j = 0;
          for (let p = Math.max(D.me.p, src.rowAtY(st - lift) - 1), z = Math.min(D.me.e, src.rowAtY(st + vh - lift) + 2); p < z; p++) {
            let el = lifts[j]; if (!el) { el = lifts[j] = makeRow(); el.classList.add("sn-g-lift", "sn-g-liftb"); } j++;
            if (el._p !== p || el._v !== dver) fill(el, p); el.style.display = ""; el.style.transform = `translateY(${lift}px)`; el.style.setProperty("--sn-sl", sl); el.classList.toggle("sn-out", out && !done); el.classList.toggle("sn-g-lhead", p === D.me.p);
          }
          for (let k = j; k < lifts.length; k++) if (lifts[k]._p !== -1) { lifts[k].style.display = "none"; lifts[k]._p = -1; }
          boxEl.style.top = home + lift + "px"; boxEl.style.height = h + "px"; boxEl.style.setProperty("--sn-sl", sl); boxEl.classList.toggle("sn-out", out && !done); boxEl.classList.toggle("sn-settle", !!done);
          paintGaps([gapEl, gapEl2], gOrder(gapPieces(gapY, h, D.rangeAt(gapY))), sl);
        },
      };
      rowDrag.paint(); dver++; schedule(); return true; /* 空位、影子当场摆好：不然刚放进来那一帧是 0 高 */
    };
    const upd = () => { const r = fr.getBoundingClientRect(); out = px < r.left - 40 || px > r.right + 40 || py < r.top - 40 || py > r.bottom + 40; to = out ? D.idx : D.target(follow()); schedule(); };
    // 收起的下级还在淡出（结构上还在）：先不拿起，等淡完（不到 120ms）再从看到的位置拿起——按住的那一点从这时候算，不会一下跳到指针下面
    const go = () => { wait = false; if (mo.fading()) { wait = true; return; } if (!begin()) { fin(true); return; } upd(); };
    const tick = () => { if (wait && !mo.fading()) { sy = py; go(); } if (on && vp.scrollTop !== lastTop) { lastTop = vp.scrollTop; upd(); } if (on && !out && !done) { const vr = vp.getBoundingClientRect(), top = vr.top + HEAD + 36, bot = vr.top + vp.clientHeight - 36, st = vp.scrollTop, vh = vp.clientHeight - HEAD; let sp = py < top ? -(top - py) / 2.5 : py > bot ? (py - bot) / 2.5 : 0; if ((sp > 0 && D.top0() + D.total() <= st + vh + .5) || (sp < 0 && D.top0() >= st - .5)) sp = 0; /* 只在这一组兄弟的范围里自动滚 */ if (sp) { vp.scrollTop += Math.max(-28, Math.min(28, sp)); upd(); } } if (!done) raf2 = requestAnimationFrame(tick); };
    raf2 = requestAnimationFrame(tick);
    try { tgt.setPointerCapture(e.pointerId); } catch {}
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(true); } }, onBlur = () => fin(true);
    const evs = [["pointermove", (ev) => { px = ev.clientX; py = ev.clientY; if (!on) { if (wait || Math.hypot(px - sx, py - sy) < 4) return; go(); return; } upd(); }], ["pointerup", () => fin(false)], ["pointercancel", () => fin(true)], ["lostpointercapture", () => fin(true)]];
    for (const [t, f] of evs) tgt.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", onBlur);
    function fin(cancel) {
      if (done) return; cancelAnimationFrame(raf2); for (const [t, f] of evs) tgt.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", onBlur);
      if (!on) { done = true; return; }
      done = cancel || out ? "cancel" : "drop"; if (done === "cancel") to = D.idx;
      let landed = false; const t0 = performance.now(), finish = () => {
        if (landed) return; landed = true; if (pendingDrop === finish) pendingDrop = null;
        vp.classList.remove("sn-rowdrag"); rowDrag = null; for (const el of lifts) el.remove(); gapEl.remove(); gapEl2?.remove(); boxEl.remove();
        if (done === "drop" && D.commit(to)) { afterTree(); headUI.paint(); }
        for (const r of pool) r.style.transform = ""; dver++; render(); syncMergeBar();
      };
      pendingDrop = finish; const wait = () => { if (landed) return; const t = performance.now() - t0; if (!reduced() && (rowDrag?.anim || t < 160) && t < 800) { schedule(); requestAnimationFrame(wait); } else finish(); };
      schedule(); requestAnimationFrame(wait);
    }
  }
  // ———— 树形：展开收起（名称前的箭头、名称格上的左右键、全部展开 / 收起），过渡由 createRowMotion 管（两版共用） ————
  const mo = createRowMotion(src, { reduced, view: () => ({ st: vp.scrollTop, vh: vp.clientHeight - HEAD }), scrollTo: (y) => { vp.scrollTop = y; }, sync: () => { body.style.height = src.rowsH() + (src.mode === "append" ? RH : 0) + "px"; }, after: afterTree });
  function toggleTree(p, open) {
    flushDrop(); const id = src.idAt(p); if (id < 0 || !src.hasKids(id) || mo.exiting(id) || rowDrag) return; // 正在淡出的行（上级刚收起）点了不算
    if (open == null) open = !src.isOpen(id); if (open === src.isOpen(id)) return;
    mo.toggle([id], open); dver++; paintBar(); schedule(); /* 起点那一帧由同一帧里的 render 画（改完结构钟的起点挪到了现在，这一帧不走钟） */
  }
  function expandAll() { flushDrop(); if (!src.tree || src.busy || rowDrag) return; mo.toggle(null, !src.allOpen()); dver++; paintBar(); schedule(); } // 所有级一起展开 / 收起
  // 结构变了（展开收起、换位置）：当前格子跟着它那一行走；那一行被收起了，就到最近的看得见的上级
  function afterTree() {
    let id = active.id ?? -1, p = id >= 0 ? src.findPos(id) : -1; while (p < 0 && id >= 0) { id = src.parentOf(id); p = id >= 0 ? src.findPos(id) : -1; }
    if (p >= 0) active = { ...active, p, id }; else { active.p = Math.min(active.p, Math.max(0, src.shown - 1)); active.id = src.idAt(active.p); }
    rg = null; anchorP = -1; dver++; schedule(); syncMergeBar(); paintBar();
  }
  // 平铺 / 树形：两套视图（名字、行高、合并、详情、展开状态各记各的）；先把手上的事（落位、编辑、过渡）做完
  function setTreeMode(on) { flushDrop(); if (editing?.end) editing.end(true); mo.reset(); hAnim.clear(); expAnim.clear(); expTo.clear(); src.setTree(on); }
  let shownTree = false;
  function syncTree() { // 新视图到了：换成这一套的外观（操作列多一个"详情"按钮、名称列宽一些放得下缩进、读屏按树形表格读）
    const t = src.tree; if (t === shownTree) return; shownTree = t; expd = EXPD[t ? "tree" : "flat"]; root.classList.toggle("sn-tree", t); root.classList.toggle("sn-has-exp", expd.size > 0); merges.invalidate(); vp.setAttribute("role", t ? "treegrid" : "grid");
    treeCols(model, t); apply(); active = { p: 0, c: NAME, id: src.idAt(0) };
  }
  // ———— 拖行高：在最左边那一列拖某一行的下边线；双击恢复默认；全选时所有行一起改（被拖那一行在视口里的位置不动） ————
  // 一条横的参考线和高度数字跟着；往下拖出表格底边会自动往下滚、行接着变高；Esc 恢复原来的高度
  const MINH = 32, MAXH = 160;
  // 行高平滑变到 h1（Esc 回到原来的高度、双击下边线恢复默认）：160ms 缓出，按行号改（中途换了位置也对）；展开着的行连同详情一起算
  const hAnim = new Map();
  function easeRowH(p, h1) {
    const r = src.rowAt(p); if (r < 0) return; src.track(r, p); const h0 = src.rowH(p), tok = {}, dur = reduced() ? 0 : 160; let t0 = 0; hAnim.set(r, tok);
    const step = (now) => { if (hAnim.get(r) !== tok) return; if (!t0) t0 = now - 16.7; const k = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : 1, h = k < 1 ? h0 + (h1 - h0) * (1 - (1 - k) ** 3) : h1; if (expd.has(r)) expd.set(r, Math.max(MINH, h - DETAIL)); src.setIdH(r, h); dver++; render(); if (k < 1) requestAnimationFrame(step); else { hAnim.delete(r); shade(); } };
    requestAnimationFrame(step);
  }
  function startRowResize(row, e) {
    e.preventDefault(); e.stopPropagation(); flushDrop();
    const p = row._p, h0 = src.rowH(p), all = selState() === "all", fr = vp.parentElement, y0 = e.clientY, el = e.target; hAnim.delete(src.rowAt(p)); // 上一次的平滑恢复还没走完：停在现在的高度，从这里接着拖
    const line = document.createElement("i"); line.className = "sn-g-rhline"; fr.append(line); root.classList.add("sn-rowsizing");
    let py = y0, cur = h0, scrolled = 0, raf3 = 0, done = false;
    const set = (h) => { if (h === cur) return; cur = h; const er = src.rowAt(p); if (!all && expd.has(er)) expd.set(er, Math.max(MINH, h - DETAIL)); if (all) { const a = src.rowY(p) - vp.scrollTop; src.setBaseH(h); body.style.height = src.rowsH() + "px"; vp.scrollTop = src.rowY(p) - a; } else src.setRowH(p, h); dver++; render(); };
    const step = () => {
      raf3 = 0; const yb = vp.getBoundingClientRect().top + vp.clientHeight - 2; set(Math.max(MINH, Math.min(MAXH, Math.round(h0 + Math.min(py, yb) - y0 + scrolled)))); // 边线最远到表格底边，超出的距离只用来决定往下滚多快
      line.style.top = HEAD + src.rowY(p) + cur - vp.scrollTop - 1 + "px"; line.style.width = vp.clientWidth + "px"; line.dataset.h = all ? tt("grid.30", { p0: cur }) : tt("grid.31", { p0: cur });
      const over = py - (vp.getBoundingClientRect().bottom - 16);
      if (over > 0 && cur < MAXH) { const s = vp.scrollTop; vp.scrollTop = s + Math.min(24, over / 2.5); scrolled += vp.scrollTop - s; raf3 = requestAnimationFrame(step); }
    };
    step();
    try { el.setPointerCapture(e.pointerId); } catch {}
    const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fin(); if (all) { src.setBaseH(h0); dver++; render(); } else easeRowH(p, h0); } }; // Esc：平滑回到原来的高度（和简单表格一样）
    const evs = [["pointermove", (ev) => { py = ev.clientY; if (!raf3) raf3 = requestAnimationFrame(step); }], ["pointerup", () => fin()], ["pointercancel", () => fin()], ["lostpointercapture", () => fin()]];
    for (const [t, f] of evs) el.addEventListener(t, f); document.addEventListener("keydown", onKey, true); addEventListener("blur", fin);
    function fin() { if (done) return; done = true; cancelAnimationFrame(raf3); for (const [t, f] of evs) el.removeEventListener(t, f); document.removeEventListener("keydown", onKey, true); removeEventListener("blur", fin); line.remove(); root.classList.remove("sn-rowsizing"); shade(); }
  }
  function resetRowH(row) { const r = row._r; if (selState() === "all") { src.setBaseH(RH); dver++; shade(); render(); } else easeRowH(row._p, RH + (r >= 0 && expd.has(r) ? DETAIL : 0)); } // 双击下边线：平滑恢复默认（展开着的行连同详情）
  function moveByKey(d) {
    if (src.tree) return moveTreeByKey(d);
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("grid.27") }); return; }
    const p = active.p, to = p + d; if (to < 0 || to >= src.shown || src.rowAt(p) < 0 || src.rowAt(to) < 0) return;
    src.move(p, to); active.p = to; dver++; revealActive(); schedule();
  }
  // 树形：和上一个 / 下一个兄弟换位置（连同展开着的下级），行滑过去；排序时先把排好的顺序当成手动顺序
  function moveTreeByKey(d) {
    if (!src.canMove()) { toast({ icon: "info", tone: "info", text: tt("grid.32") }); return; }
    if (mo.fading()) { mo.later(() => moveTreeByKey(d)); return; } // 收起的下级还在淡出：淡完再挪
    flushDrop(); const id = src.idAt(active.p); if (id < 0 || rowDrag) return; mo.release();
    const p = src.findPos(id), { list } = src.siblings(p), i = list.findIndex((b) => b.id === id), j = i + d; if (j < 0 || j >= list.length) return;
    mo.relayout(() => { src.adoptSort(); if (d < 0) src.moveNode(id, list[j].id); else src.moveNode(id, -1, list[j].id); });
    active = { ...active, p: src.findPos(id), id }; dver++; revealActive(); schedule(); headUI.paint();
  }

  // ———— 行展开收起：名称前面的小三角。展开时这一行 220ms 缓缓长高，下面的行跟着往下走；详情贴着视口左边（横滚时不跑），淡入 ————
  // 连点：只让最新的那次动，从现在的高度接着走；动的过程中排序、筛选、拖行换了位置，按行号接着改，不会卡在半高
  function toggleExpand(p) {
    flushDrop(); const r = src.rowAt(p); if (r < 0) return; const open = !(expTo.get(r) ?? expd.has(r)); expTo.set(r, open);
    const h0 = expd.get(r) ?? src.rowH(p), from = src.rowH(p), to = open ? h0 + DETAIL : h0;
    if (open && !expd.has(r)) expd.set(r, h0); root.classList.toggle("sn-has-exp", expd.size > 0); merges.invalidate(); syncMergeBar(); src.track(r, p);
    let t0 = 0; const dur = reduced() ? 0 : 220, tok = {}; expAnim.set(r, tok); dver++; schedule(); // t0 在第一步定：第一步就按走了一帧算，点下去下一帧就动
    const step = (now) => {
      if (expAnim.get(r) !== tok) return; if (!t0) t0 = now - 16.7;
      const k = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : 1, q = 1 - (1 - k) ** 3;
      src.setIdH(r, from + (to - from) * q); dver++; render();
      if (k < 1) { requestAnimationFrame(step); return; }
      expAnim.delete(r); expTo.delete(r); if (!open) { expd.delete(r); root.classList.toggle("sn-has-exp", expd.size > 0); merges.invalidate(); syncMergeBar(); src.setIdH(r, h0); dver++; render(); }
    };
    requestAnimationFrame(step);
  }
  // ———— 合并、拆分：框选一块后点"合并单元格"（只显示左上角的内容，可撤销）；选中合并块时丝滑滑出"拆分" ————
  const mb = mountMergeBar(root, injectIcons);
  mb.onSplitHover((on) => { splitPrev = on; paintSplitPrev(); });
  function syncMergeBar() {
    const r = rgRect(), cells = r ? (r.p1 - r.p0 + 1) * r.keys.length : 0, zones = r ? new Set(r.keys.map(merges.zoneOf)) : new Set(), sib = !r || merges.siblings(r.p0, r.p1);
    const canMerge = merges.enabled && cells > 1 && zones.size === 1 && r.p1 - r.p0 < 200 && sib;
    const mergeTip = !merges.enabled ? tt("grid.33") : cells > 1 && zones.size > 1 ? tt("grid.34") : cells > 1 && !sib ? tt("grid.35") : cells > 1 ? tt("grid.36", { p0: r.p1 - r.p0 + 1, p1: r.keys.length }) : tt("grid.37");
    const showSplit = Boolean(activeSelected && merges.at(active.p, active.c));
    const n = merges.suspended();
    const hintText = n ? (merges.enabled ? tt("grid.38", { p0: n, p1: src.tree ? tt("grid.54") : tt("grid.55") }) : tt("grid.39", { p0: n })) : "";
    mb.sync({ canMerge, mergeTip, showSplit, hintText });
    if (!showSplit && splitPrev) { splitPrev = false; paintSplitPrev(); }
  }
  const refreshM = () => { dver++; schedule(); syncMergeBar(); };
  mb.merge.addEventListener("click", () => {
    const r = rgRect(); if (!r || mb.merge.disabled) return;
    const inside = merges.active().filter((x) => x.p0 >= r.p0 && x.p1 <= r.p1 && x.c0 >= r.c0 && x.c1 <= r.c1).map((x) => x.m); inside.forEach((m) => merges.remove(m));
    const m = merges.add(r.p0, r.p1, r.keys); if (!m) { inside.forEach((x) => merges.restore(x)); toast({ text: tt("grid.40") }); return; }
    rg = null; vp.focus({ preventScroll: true }); setActive(r.p0, r.keys[0], false); showSel(true, false); dver++; schedule();
    toast({ kind: "action", text: tt("grid.41", { p0: r.p1 - r.p0 + 1, p1: r.keys.length }), action: { label: tt("grid.42"), run: (t) => { merges.remove(m); inside.forEach((x) => merges.restore(x)); refreshM(); t.update({ kind: "status", text: tt("grid.43"), done: true, duration: 1600 }); } } });
  });
  mb.split.addEventListener("click", () => {
    const x = merges.at(active.p, active.c); if (!x) return; splitPrev = false; paintSplitPrev(); merges.remove(x.m); vp.focus({ preventScroll: true }); showSel(activeSelected, kbdNav); refreshM();
    toast({ kind: "action", text: tt("grid.44"), action: { label: tt("grid.42"), run: (t) => { merges.restore(x.m); refreshM(); t.update({ kind: "status", text: tt("grid.45"), done: true, duration: 1600 }); } } });
  });

  const sbSeg = $('[data-seg="gsb"]', root), lnSeg = $('[data-seg="glines"]', root);
  if (sbSeg) initSeg(sbSeg, (v) => { bars.mode(v); shade(); schedule(); }, 0);
  root.dataset.lines = o.lines ?? "grid"; merges.enabled = root.dataset.lines === "grid";
  if (lnSeg) initSeg(lnSeg, (v) => { root.dataset.lines = v; merges.enabled = v === "grid"; if (!merges.enabled) rg = null; refreshM(); }, 1);
  let atEnd = false; vp.addEventListener("scroll", () => { const end = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2; if (end && !atEnd && src.shown > 0) emit("scrollEnd"); atEnd = end; }, { passive: true });
  src.ready.then(() => { for (const m of o.merges || []) merges.add(m.rows[0], m.rows[1], m.keys); if (o.merges?.length) { mergeFx.prime(merges.active(), snapMerge); refreshM(); } paintState(); });
  apply(); paintBar(); headUI.paint(); schedule();
  root._grid = { src, model, active: () => ({ ...active }), range: () => rgRect(), selShown: () => selShown, setActive, startEdit: (k) => startEdit(k), scrollToRow: (p) => { vp.scrollTop = src.rowY(p); }, editing: () => !!editing, selCount, poolSize: () => pool.length, rowDragging: () => !!rowDrag, merges, sel: () => ({ shown: selShown, rg: rgRect() }), toggleExpand, expanded: () => expd.size,
    toggleTree, expandAll, tsel, motion: () => mo.busy, mclock: () => mo.clock, selState,
    merge: (p0, p1, keys, opts) => { merges.add(p0, p1, keys); if (opts?.silent) mergeFx.prime(merges.active(), snapMerge); refreshM(); }, get sort() { return src.query.sort || null; }, get filter() { return { q: src.query.q || "", filters: src.query.filters || {} }; },
    get selectedKeys() { return selKeys(); }, reload: () => src.retry(), ready: src.ready };
  // 销毁：停掉下一帧的重画、拿掉放进 <head> 的两段样式（列宽、列位移动画）、关掉开着的弹层和编辑报错、放开实例（同一个容器可以再挂一次）。
  // 挂载时加的监听、观察器、后台线程（筛选排序那个 Worker）由 createDataGrid 一起撤
  const api = root._grid;
  // 选项变了（React / Vue 的 props、createDataGrid 的 update）：数据、排序、勾选、状态跟着变；列变了要换一张新表（React 的 key、Vue 的 :key）
  api.update = (n, prev = {}) => {
    if (n.data !== prev.data || n.dataSource !== prev.dataSource) swapData(n);
    if (n.height !== prev.height) setGridHeight(root, n.height);
    // 受控的 sort、selectedKeys：传进来的值换了才跟着变（父组件没接 onSortChange 也不会每次渲染都退回去）
    if (n.sort !== undefined && n.sort !== prev.sort && JSON.stringify(n.sort) !== JSON.stringify(src.query.sort || null)) { lastSort = JSON.stringify(n.sort); src.setSort(n.sort); }
    if (n.selectedKeys !== undefined && n.selectedKeys !== prev.selectedKeys) { Object.assign(o, n); wantKeys = n.selectedKeys; applyKeys(); }
    Object.assign(o, n); paintState();
  };
  api.destroy = () => { cancelAnimationFrame(raf); raf = 0; cancelAnimationFrame(motionRaf); clearMergeFxEls(); mb.dispose?.(); styleEl.remove(); motionEl.remove(); closeGridPops(); hideErr?.(); src.destroy(); if (root._grid === api) delete root._grid; };
  return api;
}

// 工具条（搜索、平铺 / 树形、全部展开、加载方式、滚动条、行线 / 网格、筛选条件、行数信息）：DOM 版和 Canvas 版共用，seg 是分段控件名字的前缀
// 搜索框搜的是主列：占位文字、读屏名称写主列的标题（"搜索名称"）
export const primaryTitle = (columns = []) => (columns.find((c) => c.primary) || columns.find((c) => c.type !== "sel" && c.type !== "act"))?.title ?? "";
const segHTML = (n, a, b, c, d) => `<div class="sn-seg sn-sm" data-seg="${n}"><span class="sn-thumb"></span><button data-v="${a}">${tt(b)}</button><button data-v="${c}">${tt(d)}</button></div>`;
export const gridBarHTML = ({ seg = "g", title = "", placeholder = tt("grid.56", { p0: title }), controls = false } = {}) =>
  `<div class="sn-g-bar"><span class="sn-ib sn-has-pre" style="width:220px"><span class="sn-pre" data-i="search"></span><input class="sn-input sn-sm" data-g-q placeholder="${esc(placeholder)}" aria-label="${esc(tt("grid.57", { p0: title }))}"></span>`
  + (controls ? segHTML(seg + "tree", "flat", "grid.58", "tree", "grid.59") + `<button class="sn-btn sn-ghost sn-sm" data-g-expand hidden data-i="chevrons-up-down:before">${tt("grid.14")}</button>`
  + segHTML(seg + "mode", "known", "grid.60", "append", "grid.61") + segHTML(seg + "sb", "gutter", "grid.62", "auto", "grid.63") + segHTML(seg + "lines", "row", "grid.64", "grid", "grid.65") : "")
  + `<span class="sn-g-filters" data-g-filters></span><span class="sn-g-info" data-g-info></span></div>`;
const SHADES = `<i class="sn-g-shade sn-l" aria-hidden="true"></i><i class="sn-g-shade sn-r" aria-hidden="true"></i>`;
// DOM 版数据表格的标记（和设计稿里那块一样）：createDataGrid 遇到空容器自己用它填
export const dataGridHTML = ({ label = tt("grid.66"), toolbar = true, controls = false, columns, height } = {}) =>
  `<div class="sn-grid"${heightCSS(height) ? ` style="--sn-g-h:${esc(heightCSS(height))}"` : ""}>${toolbar ? gridBarHTML({ controls, title: primaryTitle(columns) }) : ""}<div class="sn-g-frame"><div class="sn-g-vp" tabindex="0" role="grid" aria-label="${esc(label)}"><div class="sn-g-head" role="row"></div><div class="sn-g-body" role="rowgroup"><div class="sn-g-foot" hidden></div></div></div>${SHADES}</div></div>`;
export const gridShadesHTML = () => SHADES;

// createDataGrid(空容器或 .sn-grid, { columns, data | dataSource, rowKey, … }) → { update, destroy, on, off, merge, reload, … }：统一的组件写法。
// 选项、事件见 mountDataGrid 开头；update 换数据、受控的排序和勾选、状态；destroy 撤掉挂载时加的全部监听、观察器，拿掉 <head> 里的样式，清空容器
export const createDataGrid = /* @__PURE__ */ defineComponent({
  name: "data-grid",
  html: (o) => dataGridHTML(o),
  mount(el, o, api) { injectIcons(el); return mountDataGrid(el, { ...o, emit: api.emit }); }, // 实例上有 update(选项, 之前的选项) 和 destroy
});
