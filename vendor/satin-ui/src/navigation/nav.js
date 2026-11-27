// UI 库设计稿第二批：媒体与上传、导航、行为。数值照 09 号 §2（连续性、模式 b/g/h）、§8（拖拽、增删）、§7.2（乐观更新）、§10（玻璃）。
// 用法：图片放大（openLightbox）、上传（mountUpload）、侧栏（mountSidebar）、标签页（mountTabs）、分页（mountPager）、步骤（setStep）、
// 拖拽重排（mountReorder）、带补位动画的增删（insertWithFlip / removeWithFlip）、乐观更新（optimistic）
import { onCleanup } from "../core/lifecycle.js";
import { fitScroll, $, $$, reduced, injectIcons, edgeFrames, initSeg, hideTip } from "../core/core.js";
import { toast } from "../feedback/feedback.js";
import { scoped } from "../foundation/i18n.js";
import I18N_DEFAULTS from "../foundation/locales/zh-CN/nav.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const OPEN = "cubic-bezier(.32,.72,0,1)", EASE_IN = "cubic-bezier(.42,0,1,1)", OUT = "cubic-bezier(0,0,.58,1)", IN_OUT = "cubic-bezier(.42,0,.58,1)";
const SPRING = "linear(0, .32, .78, 1.04, 1.09, 1.06, 1.02, 1, .99, .99, 1)";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 只用 transform 把一组元素从旧位置移到新位置
const flip = (els, change, opt = {}) => {
  const before = new Map(els.map((e) => [e, e.getBoundingClientRect()])); change();
  if (reduced()) return;
  els.forEach((e, k) => {
    if (!e.isConnected) return; const a = before.get(e), b = e.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: opt.duration || 300, easing: opt.easing || IN_OUT, delay: (opt.stagger || 0) * k, fill: "backwards" });
  });
};
void wait;
void initSeg;
// ———— 1. 图片放大：看图组件在 lightbox.js（放大缩小、旋转、还原、视频）；从这里引入的照样能用 ————
export { openLightbox, closeLightbox } from "../media/lightbox.js";
// ———— 2. 上传 ————
// mountUpload(拖放区, { list, accept, maxSize, tooBig, badType, upload })：点了选文件、拖进来；每个文件一行（进度、失败重试、取消 / 移除）。
//   accept：允许的扩展名（正则）；maxSize：字节；upload(file, onProgress) 返回 Promise——真上传（不给就是演示用的假进度：名字带"断网"的传到一半失败）。
//   返回 { add(files) }
export function mountUpload(drop, { list, accept = /.*/, maxSize = Infinity, badType = tt("nav.0"), tooBig = tt("nav.1"), upload: realUpload } = {}) {
  if (drop._upl) return drop._upl;
  // list 不给：拖放区后面有 .sn-files 就用它，没有就放一个（组件销毁时拿掉）
  if (!list) { list = drop.nextElementSibling?.matches(".sn-files") ? drop.nextElementSibling : null; if (!list) { list = document.createElement("div"); list.className = "sn-files"; drop.after(list); const l = list; onCleanup(() => l.remove()); } }
  const input = $("input", drop), files = list;
  const OK = accept, LIMIT = maxSize;
const size = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
function addFiles(list) {
  for (const f of list) {
    const bad = !OK.test(f.name) ? badType : f.size > LIMIT ? tooBig : "";
    const row = document.createElement("div"); row.className = "sn-file" + (bad ? " sn-bad" : "");
    row.innerHTML = `<span class="sn-fi" data-i="${bad ? "circle-alert" : "file-text"}"></span><div class="sn-fm"><b class="sn-fname">${f.name.replace(/[<>&"]/g, "")}</b><span class="sn-st"><span>${size(f.size)}</span><span class="sn-msg">${bad || tt("nav.18")}</span></span><div class="sn-pbar"><i style="width:0"></i></div></div>`
      + `<button class="sn-btn sn-ghost sn-sm" data-file-act>${bad ? tt("nav.4") : tt("nav.8")}</button>`;
    injectIcons(row); files.append(row);
    if (!reduced()) row.animate([{ opacity: 0, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: OUT });
    row._file = f; if (!bad) run(row, f.name.includes(tt("nav.2")));
  }
}
function run(row, fail) {
  if (realUpload && row._file instanceof Blob) { // 真上传：进度由 upload 报
    const bar = $(".sn-pbar i", row), msg = $(".sn-msg", row);
    realUpload(row._file, (q) => { bar.style.width = q * 100 + "%"; msg.textContent = `${Math.round(q * 100)}%`; })
      .then(() => { row.classList.add("sn-done"); msg.textContent = tt("nav.3"); $("[data-file-act]", row).textContent = tt("nav.4"); },
            () => { row.classList.add("sn-bad"); msg.textContent = tt("nav.5"); $("[data-file-act]", row).textContent = tt("nav.6"); row.dataset.retry = "1"; });
    return;
  }
  let p = 0; const bar = $(".sn-pbar i", row), msg = $(".sn-msg", row);
  row._t = setInterval(() => {
    p = Math.min(1, p + .05 + Math.random() * .08); bar.style.width = p * 100 + "%"; msg.textContent = `${Math.round(p * 100)}%`;
    if (fail && p > .55) { clearInterval(row._t); row.classList.add("sn-bad"); msg.textContent = tt("nav.7"); $("[data-file-act]", row).textContent = tt("nav.6"); row.dataset.retry = "1"; }
    else if (p >= 1) { clearInterval(row._t); row.classList.add("sn-done"); msg.textContent = tt("nav.3"); $(".sn-fi", row).innerHTML = '<svg class="sn-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'; $("[data-file-act]", row).textContent = tt("nav.4"); }
  }, 220);
}
files.addEventListener("click", (e) => {
  const b = e.target.closest("[data-file-act]"); if (!b) return; const row = b.closest(".sn-file");
  if (row.dataset.retry) { delete row.dataset.retry; row.classList.remove("sn-bad"); b.textContent = tt("nav.8"); run(row, false); return; }
  clearInterval(row._t);
  const sibs = $$(".sn-file", files).filter((x) => x !== row), r = row.getBoundingClientRect(), fr = files.getBoundingClientRect();
  flip(sibs, () => Object.assign(row.style, { position: "absolute", left: 0, right: 0, top: r.top - fr.top + "px" }), { duration: 520, easing: SPRING });
  if (reduced()) row.remove(); else row.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 160, easing: EASE_IN, fill: "forwards" }).onfinish = () => row.remove();
});
drop.addEventListener("click", () => input.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
let depth = 0;
drop.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; drop.classList.add("sn-over"); });
drop.addEventListener("dragover", (e) => e.preventDefault());
drop.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; drop.classList.remove("sn-over"); } });
drop.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; drop.classList.remove("sn-over"); addFiles(e.dataTransfer.files); });
  // 销毁：停掉还在走的演示进度（每个文件一个定时器，挂载之后才开的，不在自动记录的范围里）
  return (drop._upl = { add: addFiles, destroy() { for (const r of files.querySelectorAll(".sn-file")) clearInterval(r._t); } });
}
// ———— 3. 侧栏与布局 ————
// mountSidebar(.app, { onNavigate })：侧栏选中的底色 / 指示条在条目之间滑动（app 上 data-navfx="slide | bar | fade | text"）；
// [data-collapse] 收起 / 展开（⌘\ 也行），主区宽度连续变，.app-grid 里的卡片按新列数从原位置滑过去。返回 { toggle(), select(a) }
// 只有侧栏和导航也行：卡片网格（.sn-app-grid）、选中底色（.sn-hl-bar）、指示条（.sn-hl-ind）、收起按钮（[data-collapse]）都可以没有。
// collapseBelow：整个布局窄于这个宽度时自动收成图标栏（手机上用；用户自己点过收起 / 展开以后就按用户的来）
export function mountSidebar(app, { onNavigate, collapseBelow = 0 } = {}) {
  if (app._side) return app._side;
  const side = $(".sn-side", app), agrid = $(".sn-app-grid", app), nav = $(".sn-side-nav", app), hl = $(".sn-hl-bar", nav);
const cardsEls = agrid ? $$(".sn-gc", agrid) : [], CARD_MIN = 140, CARD_GAP = 12, SIDE_EASE = "cubic-bezier(.32, .72, 0, 1)"; /* 和 .app-grid 的 minmax(140px, 1fr)、gap 12、侧栏宽度动画的 ease.open 一致 */
const cols = () => (agrid ? getComputedStyle(agrid).gridTemplateColumns.split(" ").length : 1);
const colsAt = (w) => Math.max(1, Math.floor((w + CARD_GAP) / (CARD_MIN + CARD_GAP)));
// 从旧位置、旧大小滑到现在的位置、大小（同比缩放，封面不变形）；动的时候布局还在变也接得上（偏移是相对现在布局的）
const flipCards = (first, dur) => {
  if (reduced()) return;
  for (const c of cardsEls) c.getAnimations().forEach((x) => x.cancel()); /* 先停掉上一段（first 已经按看到的位置量好），再量新布局，量到的才是不带位移的位置 */
  for (const c of cardsEls) {
    const a = first.get(c), b = c.getBoundingClientRect(), s = a.width / b.width, dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(s - 1) < .002) continue;
    c.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transformOrigin: "0 0", transform: "none" }], { duration: dur, easing: SIDE_EASE });
  }
};
let lastCols = cols(), sideAnim = 0;
// 窗口大小变了、网格自己换列：同样从原位置滑过去（侧栏开合时由 toggleSide 处理，这里不管）
let lastRects = new Map(cardsEls.map((c) => [c, c.getBoundingClientRect()]));
if (agrid) new ResizeObserver(() => {
  const n = cols(); if (n !== lastCols && !sideAnim) flipCards(lastRects, 300);
  lastCols = n; lastRects = new Map(cardsEls.map((c) => [c, c.getBoundingClientRect()]));
}).observe(agrid);
// 选中切换四种：滑块（底色滑过去）/ 指示条（左边短条从旧项伸到新项）/ 原地淡入（纯 CSS）/ 仅文字（纯 CSS）
const moveHl = (a, instant) => { if (!hl || !a) return; hl.style.transition = instant ? "none" : ""; hl.style.translate = `0 ${a.offsetTop}px`; };
moveHl($("a.sn-on", nav), true); if (hl) requestAnimationFrame(() => (hl.style.transition = ""));
// 指示条：前缘先走、后缘跟上（和分段控件、标签页下划线同一套走法），关键帧交给合成线程播；中途再点，从当前看到的位置接着走
const ind = $(".sn-hl-ind", nav), IND = 16; let indAnim = null;
const indAt = (a) => { const y = a.offsetTop + (a.offsetHeight - IND) / 2; return [y, y + IND]; };
const moveInd = (a, instant) => {
  if (!ind || !a) return;
  const to = indAt(a), tf = ([t, b]) => `translateY(${t}px) scaleY(${(b - t) / IND})`;
  let from = to;
  if (indAnim) { const m = new DOMMatrixReadOnly(getComputedStyle(ind).transform); from = [m.f, m.f + IND * m.d]; indAnim.cancel(); indAnim = null; }
  else if (ind._to) from = ind._to;
  ind.style.transform = tf(to); ind._to = to;
  if (instant || reduced() || app.dataset.navfx !== "bar" || Math.abs(from[0] - to[0]) < 1) return;
  const { frames, duration } = edgeFrames(from, to, (e) => tf(e));
  indAnim = ind.animate(frames, { duration, easing: "linear" }); indAnim.onfinish = () => (indAnim = null);
};
moveInd($("a.sn-on", nav), true);
const setFx = (v) => { app.dataset.navfx = v; const on = $("a.sn-on", nav); moveHl(on, true); moveInd(on, true); };
nav.addEventListener("click", (e) => {
  const a = e.target.closest("a"); if (!a || a.classList.contains("sn-on")) return;
  $$("a", nav).forEach((x) => x.classList.toggle("sn-on", x === a)); moveHl(a); moveInd(a);
  onNavigate?.(a); const head = $(".sn-app-head b", app); if (!head) return; const nt = ($(".sn-lbl", a) ?? a).textContent;
  if (reduced()) head.textContent = nt; else head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: EASE_IN }).onfinish = () => { head.textContent = nt; head.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: OUT }); };
});
const colBtn = $("[data-collapse]", app);
const syncCollapsedTips = (on) => {
  if (colBtn) { colBtn.dataset.tip = on ? tt("nav.9") : tt("nav.10"); if (on) colBtn.dataset.tipSide = "right"; else delete colBtn.dataset.tipSide; }
  for (const a of $$(".sn-side a", app)) {
    a.dataset.tip = on ? ($(".sn-lbl", a)?.textContent ?? "") : "";
    if (on) a.dataset.tipSide = "right"; else delete a.dataset.tipSide;
  }
};
const toggleSide = () => {
  const on = !app.classList.contains("sn-collapsed"), first = new Map(cardsEls.map((c) => [c, c.getBoundingClientRect()]));
  // 侧栏宽度连续变，主区跟着连续变。一开始就按最终宽度定好列数（中途不再换列、卡片不会突然变大变小），卡片从原位置滑到新位置
  // 最终宽度 = 现在的宽度 + 侧栏现在的宽度 − 侧栏最终的宽度：收到一半又点展开时，侧栏现在的宽度是动画中途的值，照样算得准
  const sideNow = side.getBoundingClientRect().width, sideTo = parseFloat(getComputedStyle(app).getPropertyValue(on ? "--sn-side-w-min" : "--sn-side-w"));
  const n = agrid ? colsAt(agrid.clientWidth + sideNow - sideTo) : 1; if (agrid) agrid.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  hideTip();
  app.classList.toggle("sn-collapsed", on); syncCollapsedTips(on);
  flipCards(first, 300); lastCols = n;
  clearTimeout(sideAnim); sideAnim = setTimeout(() => { sideAnim = 0; if (agrid) agrid.style.gridTemplateColumns = ""; lastCols = cols(); lastRects = new Map(cardsEls.map((c) => [c, c.getBoundingClientRect()])); }, 340); /* 侧栏动画完：交回自动列数（最终宽度下列数一样，不会再动） */
};
let userSet = false;
colBtn?.addEventListener("click", () => { userSet = true; toggleSide(); });
if (app.classList.contains("sn-collapsed")) syncCollapsedTips(true);
// 窄屏自动收起（只在给了 collapseBelow 时）：跟着布局宽度，用户自己点过就不再自动
if (collapseBelow > 0) {
  // 一挂上就已经很窄：直接收起，不播收起的动画（打开页面时不该看到侧栏缩一下）
  if (app.clientWidth < collapseBelow) {
    const els = [side, ...$$(".sn-side .sn-lbl, .sn-side-top b, .sn-side-top .sn-logo, .sn-side .sn-badge, .sn-side-nav p", app)];
    for (const e of els) e.style.transition = "none";
    app.classList.add("sn-collapsed"); syncCollapsedTips(true);
    void app.offsetWidth; for (const e of els) e.style.transition = "";
  }
  new ResizeObserver(() => { if (userSet) return; const want = app.clientWidth < collapseBelow; if (want !== app.classList.contains("sn-collapsed")) toggleSide(); }).observe(app);
}
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); userSet = true; toggleSide(); } });
  return (app._side = { toggle: toggleSide, select: (a) => a.click(), setFx });
}
// ———— 4. 标签页 ————
// mountTabs(.tabs, { onChange(i, tab) })：下划线前缘先走、后缘跟上；新内容从所选标签那一侧滑进来；← → 切换；一行放不下横着滑。返回 { select(i), index }
export function mountTabs(root, { onChange } = {}) {
  if (root._tabs) return root._tabs;
  const tl = $(".sn-tab-list", root), ink = $(".sn-ink", tl), tabs = $$("button", tl), panels = $$(".sn-tab-panel", root);
fitScroll(tl, { bar: "hover" });
// 一开始选中的是标了 sn-on 的那个（服务端渲染、createTabs({ value }) 给的），没标就第一个
let ti = Math.max(0, tabs.findIndex((b) => b.classList.contains("sn-on"))), inkAnim = null, inkEdges = null;
// 下划线只用 transform（平移 + 横向缩放）在合成线程上动，不动 left/right（那会每帧重排）
ink.style.left = "0"; ink.style.width = "100px"; ink.style.transformOrigin = "0 0";
const inkTf = ([l, r]) => `translateX(${l}px) scaleX(${(r - l) / 100})`;
const placeInk = (b, instant) => {
  const to = [b.offsetLeft, b.offsetLeft + b.offsetWidth];
  const from = inkAnim && inkEdges ? (() => { const m = new DOMMatrix(getComputedStyle(ink).transform); return [m.e, m.e + m.a * 100]; })() : inkEdges;
  inkAnim?.cancel(); inkAnim = null; inkEdges = to; ink.style.transform = inkTf(to);
  if (instant || reduced() || !from) return;
  const { frames, duration } = edgeFrames(from, to, (e) => inkTf(e));
  inkAnim = ink.animate(frames, { duration, easing: "linear" }); const a = inkAnim; a.onfinish = () => { if (inkAnim === a) inkAnim = null; };
};
placeInk(tabs[ti], true); root.removeAttribute("data-ssr"); // 真正的下划线放好了，服务端第一帧那条临时的去掉
new ResizeObserver(() => placeInk(tabs[ti], true)).observe(tl);
tabs.forEach((b, i) => b.addEventListener("click", () => {
  if (i === ti) return; const right = i > ti, old = panels[ti], nw = panels[i];
  tabs[ti].classList.remove("sn-on"); b.classList.add("sn-on"); placeInk(b, false, right); ti = i;
  if (old) old.hidden = true; if (nw) nw.hidden = false; onChange?.(i, b);
  if (nw && !reduced()) nw.animate([{ opacity: 0, transform: `translateX(${right ? 16 : -16}px)` }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" });
}));
tl.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = Math.max(0, Math.min(tabs.length - 1, ti + (e.key === "ArrowRight" ? 1 : -1))); tabs[n].click(); tabs[n].focus(); } });
  return (root._tabs = { select: (i) => tabs[i]?.click(), get index() { return ti; } });
}
// ———— 5. 分页 ————
// mountPager(.pager, { total, page, onChange(page), pageLabel })：当前页的底色滑到新页码；页码多时中间用省略。返回 { go(p), page }
export function mountPager(pager, { total = 1, page = 1, onChange, pageLabel } = {}) {
  if (pager._pg) return pager._pg;
  const pages = $(".sn-pages", pager), prevBtn = $('[data-pg="prev"]', pager), nextBtn = $('[data-pg="next"]', pager); let TOTAL = Math.max(1, total); // 总页数可以变（筛选以后变少）：setTotal
  const seq = (p) => { const s = new Set([1, TOTAL, p - 1, p, p + 1].filter((x) => x >= 1 && x <= TOTAL)); const a = [...s].sort((x, y) => x - y), out = []; a.forEach((x, i) => { if (i && x - a[i - 1] > 1) out.push("…"); out.push(x); }); return out; };
  let labelFn = typeof pageLabel === "function" ? pageLabel : null;
  function renderPager(animate) {
    const curEl = $(".sn-cur", pages), oldLeft = curEl ? curEl.getBoundingClientRect().left : null;
    pages.innerHTML = '<span class="sn-cur"></span>' + seq(page).map((x) => x === "…" ? '<span class="sn-pg sn-gap" aria-hidden="true">…</span>' : `<button type="button" class="sn-pg${x === page ? " sn-on" : ""}" data-p="${x}"${x === page ? ' aria-current="page"' : ""}${labelFn ? ` aria-label="${String(labelFn(x)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])}"` : ""}>${x}</button>`).join("");
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= TOTAL;
    const on = $(".sn-pg.sn-on", pages), c = $(".sn-cur", pages);
    if (on && c && on.offsetWidth > 0) { c.style.width = on.offsetWidth + "px"; c.style.translate = `${on.offsetLeft}px 0`; }
    if (animate && oldLeft != null && !reduced()) { const dx = oldLeft - c.getBoundingClientRect().left; c.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 270, easing: IN_OUT }); }
  }
  renderPager(false);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      const on = $(".sn-pg.sn-on", pages), c = $(".sn-cur", pages);
      if (on && c && on.offsetWidth > 0) { c.style.width = on.offsetWidth + "px"; c.style.translate = `${on.offsetLeft}px 0`; }
    }).observe(pages);
  }
  pager.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p],[data-pg]"); if (!b || b.disabled) return;
    const np = b.dataset.p ? Number(b.dataset.p) : Math.max(1, Math.min(TOTAL, page + (b.dataset.pg === "next" ? 1 : -1)));
    if (np !== page) { page = np; renderPager(true); onChange?.(page); }
  });
  // go(p, silent)：silent 不发 onChange（外面受控地改页码时用，不回声）；setTotal(n)：总页数变了，当前页超出就停在最后一页
  return (pager._pg = { go: (p, silent) => { const np = Math.max(1, Math.min(TOTAL, p)); if (np !== page) { page = np; renderPager(true); if (!silent) onChange?.(page); } }, setTotal: (t) => { t = Math.max(1, Math.round(t) || 1); if (t === TOTAL) return; TOTAL = t; if (page > TOTAL) page = TOTAL; renderPager(false); }, setLabels: (fn) => { labelFn = typeof fn === "function" ? fn : null; renderPager(false); }, get page() { return page; }, get total() { return TOTAL; } });
}
// ———— 6. 步骤：setStep(.steps, i)——第 i 步是当前，前面的都完成（连线跟着填满） ————
export function setStep(steps, i) {
  const st = $$(".sn-st", steps), ln = $$(".sn-ln", steps); i = Math.max(0, Math.min(st.length - 1, i));
  st.forEach((s, k) => { s.classList.toggle("sn-done", k < i); s.classList.toggle("sn-cur", k === i); });
  ln.forEach((l, k) => l.classList.toggle("sn-done", k < i));
  return i;
}
// ———— 7. 拖拽重排（09 号 §8.1） ————
// mountReorder(列表, { onReorder(from, to, row) })：按住行或 .sn-grip 拖过 4px 才拿起；原地微浮起跟手，超出首尾带橡皮筋阻尼不误取消；
// 其他行按目标槽位实时让出整格空位并显示柔和落槽框（4px 迟滞防抖）；水平大幅拖离列表外或按 Esc 取消；靠近窗口上下边缘自动滚。键盘：空格拿起、↑↓ 移动、空格放下、Esc 取消。
// 行是列表里的 .sn-drag-row（可以用 row 选项换）。返回 { rows() }
export function mountReorder(list, { onReorder, row: rowSel = ".sn-drag-row" } = {}) {
  if (list._ro) return list._ro;
  let line = $(".sn-drop-line", list); if (!line) { line = document.createElement("span"); line.className = "sn-drop-line"; list.prepend(line); onCleanup(() => line.remove()); }
  const live = document.createElement("span");
live.className = "sn-dl-sr"; live.setAttribute("aria-live", "assertive"); list.after(live); onCleanup(() => live.remove()); // 组件销毁时拿掉（框架里卸载、重挂不会越积越多）
const rowsOf = () => $$(rowSel, list), SLOP = 4, HYST = 4, AWAY_X = 140, EDGE = 56, RUB = 28, OUT_STRONG = "cubic-bezier(.22, 1, .36, 1)";
const say = (t) => { live.textContent = ""; if (t) setTimeout(() => (live.textContent = t), 30); };
const rubber = (o) => (1 - 1 / ((o * .55) / RUB + 1)) * RUB; // 超出首尾的距离 → 橡皮筋阻尼位移，最多 28px，绝不误判取消
const stopMoves = (r) => r.getAnimations().forEach((a) => { if (!(a instanceof CSSTransition) || a.transitionProperty === "transform") a.cancel(); });
let drag = null, kb = false;
function begin(row) {
  const rs = rowsOf();
  // 正在跑的位移动画停在眼睛看到的位置（写成内联 transform），后面的过渡从这里接着走
  let busy = false; for (const r of rs) { if (!r.getAnimations().length) continue; busy = true; const cur = getComputedStyle(r).transform; stopMoves(r); r.style.transition = "none"; r.style.transform = cur === "none" ? "" : cur; }
  if (busy) void list.offsetWidth;
  const idx = rs.indexOf(row), m = busy ? new DOMMatrixReadOnly(getComputedStyle(row).transform) : new DOMMatrixReadOnly();
  const tops = rs.map((r) => r.offsetTop), hs = rs.map((r) => r.offsetHeight);
  const gap = rs.length > 1 ? Math.max(0, tops[1] - (tops[0] + hs[0])) : 6;
  const h = hs[idx] + gap, others = rs.filter((_, i) => i !== idx);
  // 预计算每个候选目标槽位的精确顶部与中心坐标（等高/不等高行全部精确守恒）
  const slotTops = [], slotMids = [];
  let sy = tops[0] || 0;
  for (let t = 0; t < rs.length; t++) {
    slotTops[t] = sy; slotMids[t] = sy + hs[idx] / 2;
    if (t < others.length) sy += hs[rs.indexOf(others[t])] + gap;
  }
  drag = { row, rs, idx, tops, hs, h, slotTops, slotMids, x: 0, y: 0, gy: 0, target: idx, out: false, laid: false, auto: false, t0: 0, k0: Math.max(0, Math.min(1, (m.a - 1) / .014)), dy0: m.m42, raf: 0 };
  line.style.height = hs[idx] + "px";
  row.classList.remove("sn-picked"); row.classList.add("sn-lifted");
}
function frame(now) {
  const d = drag; if (!d) return; d.raf = 0;
  const { row, rs, idx, tops, hs, slotMids } = d, n = rs.length, vh = innerHeight;
  // 靠近窗口上下边缘、列表还有一部分在窗口外：自动滚过去，越靠边越快
  let lr = list.getBoundingClientRect(); const up = d.y < EDGE && lr.top < 0, dn = d.y > vh - EDGE && lr.bottom > vh;
  d.auto = up || dn;
  if (d.auto) { const f = Math.min(1, up ? (EDGE - d.y) / EDGE : (d.y - vh + EDGE) / EDGE); scrollBy({ top: (up ? -1 : 1) * Math.ceil(18 * f * f), behavior: "instant" }); lr = list.getBoundingClientRect(); }
  // 只有水平大幅拉离列表外才进入取消态；向上/向下超出首尾始终锁定首项/末项，绝不反直觉取消
  const out = d.x < lr.left - AWAY_X || d.x > lr.right + AWAY_X;
  const raw = d.dy0 + (d.y - lr.top - d.gy), lo = tops[0] - tops[idx], hi = tops[n - 1] + hs[n - 1] - hs[idx] - tops[idx];
  const dy = raw < lo ? lo - rubber(lo - raw) : raw > hi ? hi + rubber(raw - hi) : raw;
  if (!d.t0) d.t0 = Math.max(now, performance.now() - 4);
  const t = Math.max(0, Math.min(1, (now - d.t0) / 160)), k = d.k0 + (1 - d.k0) * (1 - (1 - t) ** 3);
  row.style.transform = `translateY(${dy}px) scale(${1 + .014 * k})`;
  if (out !== d.out) row.classList.toggle("sn-away", out);
  // 所见即所得落点计算：跨过相邻槽位中点 ± 4px 迟滞带即刻让位，拖到首尾边缘外稳锁首/尾
  let target = out ? idx : d.target;
  if (!out) {
    const cy = tops[idx] + Math.max(lo, Math.min(hi, raw)) + hs[idx] / 2;
    while (target > 0 && cy < (slotMids[target] + slotMids[target - 1]) / 2 - HYST) target--;
    while (target < n - 1 && cy > (slotMids[target] + slotMids[target + 1]) / 2 + HYST) target++;
  }
  if (target !== d.target || out !== d.out || !d.laid) { d.target = target; d.out = out; d.laid = true; place(d); }
  if (t < 1 || d.auto) d.raf = requestAnimationFrame(frame);
}
// 柔和落槽框与整格实时让位：只在目标槽位或取消态改变时触发，过渡丝滑不重启
function place(d) {
  const { row, rs, idx, h, slotTops, target, out } = d, show = !out;
  if (show) {
    const y = slotTops[target] ?? 0;
    if (!line.classList.contains("sn-on")) { line.style.transition = "none"; line.style.translate = `0 ${y}px`; void line.offsetWidth; line.style.transition = ""; }
    else line.style.translate = `0 ${y}px`;
  }
  line.classList.toggle("sn-on", show);
  rs.forEach((r, i) => {
    if (r === row) return;
    if (out) { r.style.transition = reduced() ? "none" : `transform .22s ${OUT_STRONG}`; r.style.transform = ""; return; }
    let shift = 0;
    if (target < idx && i >= target && i < idx) shift = h;
    else if (target > idx && i > idx && i <= target) shift = -h;
    r.style.transition = reduced() ? "none" : `transform .22s ${OUT_STRONG}`;
    r.style.transform = shift ? `translateY(${shift}px)` : "";
  });
}
function end(cancel) {
  const d = drag; if (!d) return; drag = null; if (d.raf) cancelAnimationFrame(d.raf);
  line.classList.remove("sn-on");
  const { row, rs, idx } = d, back = cancel || d.out, target = back ? idx : d.target;
  // 记下每一行的布局位置和眼睛看到的变换；复位、换顺序之后，从看到的位置弹回新位置（起点和松手那一刻完全一致，不跳）
  const pre = rs.map((r) => [r, r.offsetLeft, r.offsetTop, getComputedStyle(r).transform]);
  for (const r of rs) { stopMoves(r); r.style.transition = ""; r.style.transform = ""; }
  row.classList.remove("sn-lifted", "sn-away");
  if (target !== idx) { list.insertBefore(row, rs.filter((r) => r !== row)[target] || null); onReorder?.(idx, target, row); }
  if (!reduced()) for (const [r, l0, t0, tf] of pre) {
    const dx = l0 - r.offsetLeft, dy = t0 - r.offsetTop; if (!dx && !dy && tf === "none") continue;
    const a = r.animate([{ transform: `translate(${dx}px, ${dy}px)${tf === "none" ? "" : " " + tf}` }, { transform: "none" }], { duration: r === row ? 360 : 280, easing: r === row ? SPRING : OUT_STRONG });
    if (r === row) { row.classList.add("sn-landing"); a.onfinish = a.oncancel = () => row.classList.remove("sn-landing"); }
  }
  say(back ? tt("nav.11") : target !== idx ? tt("nav.12", { p0: target + 1 }) : "");
}
list.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || drag) return;
  const g = e.target.closest(".sn-grip");
  const row = g ? g.closest(rowSel) : (e.pointerType !== "touch" && !e.target.closest("button, a, input, textarea, select, label, [contenteditable]") ? e.target.closest(rowSel) : null);
  if (!row || !list.contains(row)) return;
  const cap = g || row;
  e.preventDefault(); if (g) g.focus({ preventScroll: true }); try { cap.setPointerCapture(e.pointerId); } catch {}
  const sx = e.clientX, sy = e.clientY; let on = false, done = false;
  const mv = (ev) => {
    if (done) return;
    if (!on) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < SLOP) return; on = true; begin(row); drag.gy = sy - list.getBoundingClientRect().top; }
    if (!drag) return; drag.x = ev.clientX; drag.y = ev.clientY; if (!drag.raf) drag.raf = requestAnimationFrame(frame);
  };
  const fin = (cancel) => { if (done) return; done = true; for (const [t, f] of evs) cap.removeEventListener(t, f); if (on) end(cancel); };
  const evs = [["pointermove", mv], ["pointerup", () => fin(false)], ["pointercancel", () => fin(true)], ["lostpointercapture", () => fin(true)]];
  for (const [t, f] of evs) cap.addEventListener(t, f);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag) { e.preventDefault(); e.stopPropagation(); end(true); } }, true);
addEventListener("blur", () => end(true));
addEventListener("scroll", () => { if (drag && !drag.raf) drag.raf = requestAnimationFrame(frame); }, { passive: true, capture: true });
// 键盘：空格拿起，上下键移动，空格放下，Esc 取消并回到原位；焦点离开就放下
function flipRows(change) {
  const rs = rowsOf(), before = rs.map((r) => r.getBoundingClientRect());
  rs.forEach(stopMoves); kb = true; change(); kb = false; // DOM 换位会让焦点短暂离开，期间不当成放下
  if (reduced()) return;
  rs.forEach((r, k) => { const b = r.getBoundingClientRect(), dx = before[k].left - b.left, dy = before[k].top - b.top; if (dx || dy) r.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 220, easing: IN_OUT }); });
}
list.addEventListener("keydown", (e) => {
  const g = e.target.closest(".sn-grip"); if (!g || drag) return;
  const row = g.closest(rowSel), rs = rowsOf(), i = rs.indexOf(row), picked = row.classList.contains("sn-picked");
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (!picked) { row.classList.add("sn-picked"); row._from = i; say(tt("nav.13", { p0: ($("b", row) || row).textContent.trim(), p1: i + 1, p2: rs.length })); }
    else { row.classList.remove("sn-picked"); say(tt("nav.14", { p0: i + 1 })); if (row._from !== i) onReorder?.(row._from, i, row); }
  } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && picked) {
    e.preventDefault(); const j = i + (e.key === "ArrowUp" ? -1 : 1); if (j < 0 || j >= rs.length) return;
    flipRows(() => list.insertBefore(row, e.key === "ArrowUp" ? rs[j] : rs[j].nextSibling)); g.focus({ preventScroll: true }); say(tt("nav.15", { p0: j + 1 }));
  } else if (e.key === "Escape" && picked) {
    e.preventDefault(); e.stopPropagation(); row.classList.remove("sn-picked");
    if (row._from !== i) flipRows(() => list.insertBefore(row, rs.filter((r) => r !== row)[row._from] || null));
    g.focus({ preventScroll: true }); say(tt("nav.16", { p0: row._from + 1 }));
  }
});
list.addEventListener("focusout", (e) => { if (kb) return; const row = e.target.closest(rowSel); if (row?.classList.contains("sn-picked") && !row.contains(e.relatedTarget)) { row.classList.remove("sn-picked"); say(tt("nav.14", { p0: rowsOf().indexOf(row) + 1 })); } });
  return (list._ro = { rows: rowsOf });
}
// ———— 8. 新增与删除：插进来的从下面淡入，别的元素让位；删掉的先脱离布局淡出，剩下的用弹簧补位 ————
// insertWithFlip(容器, 元素, 放在谁前面)；removeWithFlip(元素) 返回 Promise（动画走完、元素移除后）
// 框架里（DOM 由 React、Vue……改）：删用 removeWithFlip(元素, { keep: true })，Promise 完成后再改数据；加用 flipSnapshot，见下
const ENTER = [{ opacity: 0, transform: "translateY(8px) scale(.96)" }, { opacity: 1, transform: "none" }];
export function insertWithFlip(box, el, before = null) {
  const sibs = [...box.children].filter((x) => x !== el && getComputedStyle(x).position !== "absolute");
  flip(sibs, () => box.insertBefore(el, before), { duration: 260 });
  if (!reduced()) el.animate(ENTER, { duration: 240, easing: OUT });
  return el;
}
// keep：动画走完不把元素拿掉（留在原处、脱离布局、透明），交给框架按数据删——框架自己删节点，库不跟它抢
export function removeWithFlip(el, { keep = false } = {}) {
  const box = el.parentElement, sibs = [...box.children].filter((s) => s !== el), r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
  if (getComputedStyle(box).position === "static") box.style.position = "relative";
  flip(sibs, () => Object.assign(el.style, { position: "absolute", left: r.left - br.left + "px", top: r.top - br.top + "px", width: r.width + "px", pointerEvents: "none" }), { duration: 520, easing: SPRING });
  const done = () => { if (keep) el.style.opacity = "0"; else el.remove(); };
  if (reduced()) { done(); return Promise.resolve(); }
  return new Promise((ok) => { el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 160, easing: EASE_IN, fill: "forwards" }).onfinish = () => { done(); ok(); }; });
}
// 框架里加一项：改数据之前 const play = flipSnapshot(容器) 记下每个子元素现在的位置；DOM 更新以后 play(新元素)——
// 留下来的元素从旧位置平滑移到新位置，新元素按"新增"的方式出现（和 insertWithFlip 一样的动画）
export function flipSnapshot(box) {
  const before = new Map([...box.children].filter((x) => getComputedStyle(x).position !== "absolute").map((e) => [e, e.getBoundingClientRect()]));
  return (entering) => {
    if (reduced()) return;
    for (const [e, a] of before) {
      if (e.parentElement !== box) continue;
      const b = e.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (dx || dy) e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 260, easing: IN_OUT, fill: "backwards" });
    }
    for (const el of [entering].flat()) if (el && !before.has(el)) el.animate(ENTER, { duration: 240, easing: OUT });
  };
}
// ———— 9. 乐观更新：先显示结果再保存；失败时抖两下、恢复、给重试 ————
// optimistic({ apply, revert, save, shake, failText })：apply() 马上改界面；save() 返回 Promise；失败就 revert()、shake 元素抖两下、
// 出一条带"重试"的提示（重试 = 再来一遍整个过程）。返回 save 的 Promise（失败时 reject）
export function optimistic({ apply, revert, save, shake, failText = tt("nav.17") }) {
  apply();
  const run = Promise.resolve().then(save);
  run.catch(() => {
    revert();
    if (shake) { shake.classList.remove("sn-shake2"); void shake.offsetWidth; shake.classList.add("sn-shake2"); shake.addEventListener("animationend", () => shake.classList.remove("sn-shake2"), { once: true }); }
    toast({ icon: "circle-x", tone: "danger", text: failText, alert: true, action: { label: tt("nav.6"), run: (t) => { t.close(); optimistic({ apply, revert, save, shake, failText }); } } });
  });
  return run;
}
// 展示页接线（demo/）要用的内部名字
export { wait, OUT };
