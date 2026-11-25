// Satin 运行时的公共部分：选择器、减少动态效果、图标占位、分段控件、Tooltip。
// 组件展示页（kit.js）和官网都从这里拿，库的使用者也可以单独引入：import { initSeg, injectIcons } from "../kit-core.js"
import { scrollArea } from "../layout/scroll.js";
import { track, onCleanup } from "./lifecycle.js";
import { icon } from "../foundation/icons.js";
import { computeFloating } from "../overlay/floating.js";
export const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
// 根元素：在 Node / SSR 里导入时没有 document，这里是 undefined（只在浏览器里调用的函数才用到它）
export const root = typeof document !== "undefined" ? document.documentElement : undefined;
export const reduced = () => root.classList.contains("sn-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
export const TICK = '<svg class="sn-tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';
// 图标占位：data-i="名字" 或 "名字:before|after|caret|chk|more…"。写在没有 class 的空 span 上时，span 直接换成图标，免得多一层包裹挡住 margin-left:auto 这类排版
export function injectIcons(scope = document) {
  for (const el of $$("[data-i]", scope)) {
    const [name, pos] = el.dataset.i.split(":"); let svg = icon(name, 16); el.removeAttribute("data-i");
    if (pos && pos !== "before" && pos !== "chk") svg = svg.replace('class="sn-ic"', `class="sn-ic sn-${pos}"`);
    if (el.tagName === "SPAN" && !el.className && !el.childNodes.length) { el.outerHTML = svg; continue; }
    if (pos === "chk") el.insertAdjacentHTML("beforeend", `<span class="sn-chk">${svg}</span>`);
    else if (pos && pos !== "before") el.insertAdjacentHTML("beforeend", svg);
    else el.insertAdjacentHTML("afterbegin", svg);
  }
}
// ———— 2. 分段控件：滑块左右两条边各走一条曲线，前缘先到、后缘跟上、落定轻压（09 号 §2.1 模式 g） ————
const bezier = (x1, y1, x2, y2) => (t) => {
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 20; i++) { u = (lo + hi) / 2; const x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3; if (x < t) lo = u; else hi = u; }
  return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
};
const leadEase = bezier(.22, 1, .36, 1), trailEase = bezier(.42, 0, .58, 1);
// 指示器的通用走法（分段控件、标签页下划线、分页当前页都用它）：给出起止两条边，返回一串关键帧，交给合成线程播。
// toTransform([左, 右], 压扁量) 由调用方决定单位（分段控件用格数，标签页用像素）。
export function edgeFrames(from, to, toTransform, k = 0) {
  const lead = to[0] > from[0] ? 1 : 0, LEAD = 230 + 40 * k, LAG = 45, TRAIL = 300 + 40 * k, SETTLE = 150, total = TRAIL - 70 + SETTLE;
  const c = (x) => Math.min(1, Math.max(0, x)), frames = [];
  for (let t = 0; t < total; t += 8) {
    const e = [0, 0];
    e[lead] = from[lead] + (to[lead] - from[lead]) * leadEase(c(t / LEAD));
    e[1 - lead] = from[1 - lead] + (to[1 - lead] - from[1 - lead]) * trailEase(c((t - LAG) / (TRAIL - LAG)));
    const q = (t - (TRAIL - 70)) / SETTLE;
    frames.push({ transform: toTransform(e, q > 0 && q < 1 ? 1 - Math.sin(q * Math.PI) * .06 : 1), offset: t / total });
  }
  frames.push({ transform: toTransform(to, 1), offset: 1 });
  return { frames, duration: total };
}
// 两条边的走法先算成一串关键帧，交给 Web Animations 在合成线程上播：主线程这时候再忙（换主题、换圆角、大段重排），滑块也不掉帧。
// onChange 在动画起跑之后、隔两帧再调，重活不会压住动画的第一帧；第三个参数是这段动画，调用方可以等它播完再做事。
// 一行放不下就横着滑：真的放不下时才把它变成滚动区域（scroll.js：横向渐隐、竖着滚滚轮也横向滚、滚到头停住），加 .sn-scroll；
// 后来又放得下了（转屏、容器变宽、字号变小、选项变少）就拆掉滚动区域，回到原来的排列——原来判定一次就不回头，转回横屏还卡在横滑。
// 回差：变成横滑那一刻记下容器宽和内容宽；放得下了，还要容器比那时宽 24px 以上、或者内容比那时窄 24px 以上才回去，
// 免得在临界宽度来回跳（页面竖滚动条随高度出现、消失，容器宽度就差 15px 上下）。
// 刚载入时的判断和原来一样（放不下才横滑），静态画面不变。
// bar：分段控件不出滚动条（只靠渐隐），标签页悬停时出一根细滚动条
export function fitScroll(el, { bar = "none" } = {}) {
  const H = 24;
  let sa = null, undo = null, host = null, w0 = 0, c0 = 0;
  // 包一层 / 拆一层要把元素挪个位置，挪的时候焦点会丢：焦点在里面的话挪完放回去
  const keep = (f) => { const a = document.activeElement, had = a !== el && el.contains(a); f(); if (had && document.activeElement !== a) a.focus({ preventScroll: true }); };
  const off = () => { if (!sa) return; const s = sa, u = undo; sa = undo = null; s.destroy(); u(); el.classList.remove("sn-scroll"); };
  const fit = () => {
    if (!el.isConnected) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    if (!sa) {
      if (!over) return;
      host = el.parentElement; w0 = host ? host.clientWidth : 0; c0 = el.scrollWidth;
      // 滚动区域加的监听、观察器单独记下来，拆的时候一起撤（不然转一次屏多一份）
      keep(() => { el.classList.add("sn-scroll"); [sa, undo] = track(() => scrollArea(el, { fade: "x", size: 24, bar, wheel: "x", overscroll: "contain" })); });
      if (host) ro.observe(host); // 横滑时元素自己不会比内容宽：容器变宽要看容器
    } else {
      if (over) return;
      if (!(host && host.clientWidth >= w0 + H) && !(el.scrollWidth <= c0 - H)) return;
      if (host) ro.unobserve(host);
      keep(off);
      fit(); // 回到原来的排列以后再量一次
    }
  };
  const ro = new ResizeObserver(fit); ro.observe(el); for (const c of el.children) ro.observe(c);
  onCleanup(off); // 组件销毁时：后来才建的滚动区域也拆掉
  fit();
  return fit;
}
// 宽排版放不下就换窄排版：内容比容器宽时加 .stack，记下宽排版要多宽，容器够宽了再换回来（宽度不随排版变，不会来回跳）
export function fitStack(el) {
  let need = 0;
  const fit = () => {
    const w = el.clientWidth;
    if (!el.classList.contains("stack")) { if (el.scrollWidth > w + 1) { need = el.scrollWidth; el.classList.add("stack"); } }
    else if (w >= need) { el.classList.remove("stack"); if (el.scrollWidth > el.clientWidth + 1) { need = el.scrollWidth; el.classList.add("stack"); } }
  };
  // 不只看外框：外框宽度不变、里面变宽（网页字体加载完以后字变宽）时也要重新判断——原来只看外框，
  // 刚载入时用后备字体放得下，字体到了变宽溢出却不再检查，一直超出（2026-11-20 巡检：按钮状态矩阵在 1024 宽超出 70px）
  const ro = new ResizeObserver(fit); ro.observe(el); for (const c of el.children) ro.observe(c);
  // 同一段初始化跑完（宣布“演示好了”之前）再判断一次：生成矩阵时按钮里的图标还没插进去，按钮窄、放得下，插完图标才放不下——
  // 等下一帧再改成竖排，演示已经按横排的高度露出来了，框高跳一下（手机宽度巡检抓到 388 → 664）
  document.fonts?.ready.then(fit); fit(); queueMicrotask(fit);
  return fit;
}
export function initSeg(seg, onChange, start = 0) {
  const thumb = $(".sn-thumb", seg), btns = $$("button", seg);
  if (!btns.length) return { go() {} }; // 还没有选项（比如框架先插元素、后设属性）：什么都不接，选项来了重建时再接
  let idx = start, edges = [idx, idx + 1], anim = null, plan = null;
  // 滑块的位置按每一格实际的左右边算（不假设每格一样宽）：边的位置 e 是"第几格"，小数部分在这一格里按比例插值
  let X = [0], W0 = 1;
  const measure = () => { const o = btns[0].offsetLeft, last = btns[btns.length - 1]; X = [...btns.map((b) => b.offsetLeft - o), last.offsetLeft + last.offsetWidth - o]; W0 = btns[0].offsetWidth || 1; };
  const px = (e) => { const k = Math.max(0, Math.min(btns.length, e)), i = Math.floor(k); return i >= btns.length ? X[btns.length] : X[i] + (X[i + 1] - X[i]) * (k - i); };
  const tf = ([l, r], sy = 1) => `translateX(${px(l).toFixed(2)}px) scaleX(${((px(r) - px(l)) / W0).toFixed(4)}) scaleY(${sy})`;
  const set = (e) => (thumb.style.transform = tf(e));
  // 尺寸变了（字体换了、字号变了、容器变窄）：重新量，停着的滑块马上对准；正在走的那一段走完以后也对准（onfinish 里再 set 一次）
  const size = () => { thumb.style.width = btns[0].offsetWidth + "px"; measure(); if (!anim) set(edges); };
  const mark = () => btns.forEach((b, i) => { b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(i === idx)); b.tabIndex = i === idx ? 0 : -1; });
  size(); set(edges); mark(); seg.removeAttribute("data-ssr"); { const ro = new ResizeObserver(size); ro.observe(seg); btns.forEach((b) => ro.observe(b)); }
  // 放不下时横着滑；选中的格子滑到看得见的地方
  fitScroll(seg);
  const reveal = (n) => { if (!seg.classList.contains("sn-scroll")) return; const b = btns[n], l = b.offsetLeft - 2, r = b.offsetLeft + b.offsetWidth + 2; if (l < seg.scrollLeft) seg.scrollTo({ left: l, behavior: reduced() ? "auto" : "smooth" }); else if (r > seg.scrollLeft + seg.clientWidth) seg.scrollTo({ left: r - seg.clientWidth, behavior: reduced() ? "auto" : "smooth" }); };
  const c = (x) => Math.min(1, Math.max(0, x));
  // 时刻 t（毫秒）时两条边的位置和压扁量
  const at = (p, t) => {
    const e = [0, 0];
    e[p.lead] = p.from[p.lead] + (p.target[p.lead] - p.from[p.lead]) * leadEase(c(t / p.LEAD));
    e[1 - p.lead] = p.from[1 - p.lead] + (p.target[1 - p.lead] - p.from[1 - p.lead]) * trailEase(c((t - p.LAG) / (p.TRAIL - p.LAG)));
    const q = (t - (p.TRAIL - 70)) / p.SETTLE, squash = q > 0 && q < 1 ? Math.sin(q * Math.PI) * .06 : 0;
    return { e, sy: 1 - squash };
  };
  function go(n, focus, instant) {
    if (n === idx || n < 0 || n >= btns.length) return;
    idx = n; mark(); if (focus) btns[n].focus(); reveal(n);
    // 半路又点了别的：从滑块此刻的位置接着走，不跳回去
    const now = performance.now(), from = anim && plan && now - plan.t0 < plan.total ? at(plan, now - plan.t0).e : edges.slice(), target = [n, n + 1];
    anim?.cancel(); anim = null; edges = target; set(target);
    if (!(reduced() || instant)) {
      const lead = target[0] > from[0] ? 1 : 0, k = Math.max(0, Math.round(Math.abs(target[0] - from[0])) - 1);
      const TRAIL = 300 + 40 * k;
      plan = { from, target, lead, t0: now, LEAD: 230 + 40 * k, LAG: 45, TRAIL, SETTLE: 150, total: TRAIL - 70 + 150 };
      const frames = [];
      for (let t = 0; t < plan.total; t += 8) { const { e, sy } = at(plan, t); frames.push({ transform: tf(e, sy), offset: t / plan.total }); }
      frames.push({ transform: tf(target), offset: 1 });
      anim = thumb.animate(frames, { duration: plan.total, easing: "linear" });
      const a = anim; a.onfinish = () => { if (anim === a) { anim = null; measure(); set(edges); } };
    }
    if (instant || !onChange) return;
    const a = anim, v = btns[n].dataset.v ?? n;
    requestAnimationFrame(() => requestAnimationFrame(() => onChange(v, n, a)));
  }
  btns.forEach((b, i) => b.addEventListener("click", () => go(i)));
  seg.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1, true); } if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1, true); } });
  return { go };
}
// ———— 3. Tooltip：首次悬停 500ms 后出现，刚关掉 300ms 内移到相邻元素立即出现；键盘聚焦也出现（09 号 §5.2） ————
// 页面里没有提示气泡的容器就自己建一个（官网、库的使用者不用在 HTML 里写）
let tip = null, tipTimer = 0, lastHide = 0, tipFor = null, described = null, tipWait = null, shown = "", dismissed = null;
const tipEl = () => (tip ??= document.getElementById("sn-tip") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "sn-tip", id: "sn-tip", popover: "manual" })));
// 读屏：提示层 role="tooltip"，显示时元素 aria-describedby 指向它（提示和 aria-label 一样时不再重复读）
const undescribe = () => { described?.removeAttribute("aria-describedby"); described = null; };
const positionTip = (el) => {
  if (!tip || !el?.isConnected) return;
  const placement = el.dataset.tipSide || "top";
  const pos = computeFloating(tip, el, { placement, align: "center", gap: 8, margin: 8 });
  tip.style.left = pos.left + "px";
  tip.style.top = pos.top + "px";
  tip.style.transformOrigin = `${pos.ox}px ${pos.oy}px`;
  tip.classList.toggle("sn-below", !pos.side && !pos.up);
  tip.classList.toggle("sn-right", pos.side === "right");
  tip.classList.toggle("sn-left", pos.side === "left");
};
export function showTip(el, text) {
  clearTimeout(tipTimer); tipWait = null;
  tipEl(); if (!tip.matches(":popover-open")) tip.showPopover();
  tip.setAttribute("role", "tooltip"); if (described !== el || el.getAttribute("aria-label") === text) undescribe();
  if (!described && !el.hasAttribute("aria-describedby") && el.getAttribute("aria-label") !== text) { el.setAttribute("aria-describedby", tip.id); described = el; }
  tip.textContent = shown = text; if (el.dataset.kbd && !matchMedia("(hover: none)").matches) { const k = document.createElement("kbd"); k.textContent = el.dataset.kbd; tip.append(k); } // 触屏上不写快捷键
  tip.classList.toggle("sn-wrap", text.length > 20);
  tipFor = el;
  positionTip(el);
  tip.classList.add("sn-on");
}
export const hideTip = (dismiss = false) => { clearTimeout(tipTimer); tipWait = null; undescribe(); if (tipFor) { if (dismiss) dismissed = tipFor; tip.classList.remove("sn-on"); tipFor = null; lastHide = performance.now(); } };
export const tipTarget = () => tipFor;
// 元素换了状态、改了 data-tip（发送按钮变成停止、又变回来）：正显示着它的提示当场换字，还在等 500ms 的也换成新字；新字为空就收起
export const retip = (el) => {
  const t = tipText(el);
  if (tipWait?.el === el) { if (t) tipWait.text = t; else hideTip(); }
  if (tipFor === el && t !== shown) { if (t) showTip(el, t); else hideTip(); }
};
// 弹窗进入顶层后，Tooltip 要重新放进顶层才能盖在弹窗上面
export const resetTipLayer = () => { hideTip(); if (tip?.matches(":popover-open")) tip.hidePopover(); };
const tipText = (el) => el.dataset.tip || (el.hasAttribute("data-tip-full") && el.scrollWidth > el.clientWidth ? el.textContent : "");
// 页面级：悬停 / 聚焦带 data-tip 的元素出提示。setup() 里装一次（展示页在 main.js 开头按原来的顺序装）
export function installTooltips() {
tipEl();
// 触屏、没有悬停的设备（手机、平板）不出悬停提示：手指点一下也会先来一个 pointerover，提示会盖在手指刚点的地方，上面的快捷键在手机上也没用
const noHover = matchMedia("(hover: none)");
document.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch" || e.pointerType === "pen" || noHover.matches) return;
  const el = e.target.closest("[data-tip],[data-tip-full]"); if (!el || el === tipFor || el === dismissed) return;
  const text = tipText(el); if (!text) return;
  clearTimeout(tipTimer); const w = tipWait = { el, text }; tipTimer = setTimeout(() => { tipWait = null; showTip(w.el, w.text); }, performance.now() - lastHide < 300 ? 0 : 500);
});
document.addEventListener("pointerout", (e) => { const el = e.target.closest("[data-tip],[data-tip-full]") || (tipFor?.contains(e.target) ? tipFor : null); if (el && !el.contains(e.relatedTarget)) { if (el === dismissed) dismissed = null; hideTip(); } });
// 按 Esc 收起提示（WCAG 1.4.13：不挪指针、不挪焦点也能关掉）；不拦这个键——弹窗、菜单照样一起关。收起以后指针还停在这个元素上就不再冒出来，移出去再移进来才出
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (tipFor || tipWait)) { dismissed = tipFor || tipWait.el; hideTip(); } });
document.addEventListener("focusin", (e) => { const el = e.target.closest?.("[data-tip]"); if (el?.matches(":focus-visible")) showTip(el, el.dataset.tip); });
document.addEventListener("focusout", hideTip);
addEventListener("scroll", hideTip, { passive: true });
addEventListener("satin-reposition", () => { if (tipFor) positionTip(tipFor); });
}
