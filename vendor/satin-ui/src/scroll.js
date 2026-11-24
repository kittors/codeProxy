// 滚动区域（ScrollArea）：把一个会溢出的元素变成"原生滚动 + 悬浮细滚动条 + 可配置的边缘渐隐"。
// 滚动条位置和渐隐由滚动时间线驱动（合成线程），JS 只做几件事：量滑块长度、滚动时显示滚动条、拖动滑块，以及按配置开的回弹和滚轮转横向。

import { onCleanup } from "./lifecycle.js";
const SD = typeof CSS !== "undefined" && /* @__PURE__ */ CSS.supports("animation-timeline: scroll()");
/**
 * scrollArea(el, opts)
 *  fade        渐隐方向："y"（默认）|"x"|"both"|"none"，或者"top bottom left right"任意组合
 *  size        渐隐带宽度（px），默认 24
 *  inner       el 自己有定位（菜单、侧栏这类 fixed/absolute/sticky 的面板）时为 true——在 el 里面套一层滚动视口；
 *              否则在 el 外面包一层，el 自己当滚动视口。
 *  bar         滚动条："auto"（默认：滚动或悬停时出现，停下 0.7 秒淡出）|"hover"（只在悬停时出现）|"always"（常显，悬浮在内容上）
 *              |"gutter"（常驻：滚动条有自己的一条位置，不压内容；只有这个方向真的溢出才出现、才占位置）|"none"（不显示，只靠渐隐、滚轮、触控板）
 *  barSize     滚动条平时的粗细（px），默认 5；悬停、拖动时再粗 3px
 *  barInset    滚动条离边的距离（px），默认 1
 *  overscroll  滚到头："auto"（默认：一次滚动在区域里开始，滚到头就停住——不回弹，也不带着页面滚；新的一次滚动开始时已经到头，交给外层，页面接着滚；
 *              横向停住，不触发浏览器左右滑动返回。表格、列表都用这个——浏览器自带的回弹会把吸附的表头、合计行一起拉走，表格里露出空隙）
 *              |"contain"（两个方向都停住，弹层、菜单、抽屉里的列表用）|"bounce"（回弹：再拉会多出一段、越拉越紧，松手弹回；表格和有吸附部分的别用）
 *              |"chain"（两个方向都交给外层）
 *  wheel       "auto"（默认）|"x"：竖着滚滚轮也横向滚（附件条、胶片条这类横向长条用）；滚到头时放行，外层页面接着滚
 * 返回 { box, vp, refresh(), set(opts) }，set 可以在运行时改上面任意一项。
 */
export function scrollArea(el, options = {}) {
  if (el._sa) { if (options && Object.keys(options).length) el._sa.set(options); return el._sa; } // 接过的：改选项（标记里带着 sa-vp 类、但还没接过的照常接）
  const o = { fade: "y", size: undefined, inner: false, bar: "auto", barSize: 5, barInset: 1, overscroll: "auto", wheel: "auto", ...options };
  let box, vp;
  const elCls0 = el.className, elPad0 = el.style.padding, elOv0 = el.style.overflow, elPos0 = el.style.position, osX0 = el.style.overscrollBehaviorX, osY0 = el.style.overscrollBehaviorY; // 销毁时还原
  if (o.inner) {
    box = el; vp = document.createElement("div");
    const cs = getComputedStyle(el);
    vp.style.padding = cs.padding; vp.style.maxHeight = "inherit"; vp.style.boxSizing = "border-box";
    if (cs.position === "static") el.style.position = "relative";
    el.style.padding = "0"; el.style.overflow = "hidden";
    while (el.firstChild) vp.append(el.firstChild);
    el.append(vp);
  } else {
    vp = el; box = document.createElement("div");
    el.parentNode.insertBefore(box, el); box.append(el);
  }
  box.classList.add("sn-sa"); if (o.inner) box.classList.add("sn-sa-in"); vp.classList.add("sn-sa-vp");

  const bar = (axis) => { const b = document.createElement("div"); b.className = `sn-sa-bar sn-${axis}`; b.innerHTML = '<i class="sn-sa-thumb"></i>'; b.hidden = true; b.setAttribute("aria-hidden", "true"); box.append(b); return b; };
  const by = bar("y"), bx = bar("x");
  const geo = { y: { th: 24, tr: 0 }, x: { th: 24, tr: 0 } };
  const js = !SD; // 不支持滚动时间线时，JS 驱动滑块和渐隐
  let raf = 0;
  const measure = () => {
    raf = 0;
    const ch = vp.clientHeight, sh = vp.scrollHeight, cw = vp.clientWidth, sw = vp.scrollWidth;
    by.hidden = sh <= ch + 1; bx.hidden = sw <= cw + 1;
    box.classList.toggle("sn-ov-y", !by.hidden); box.classList.toggle("sn-ov-x", !bx.hidden); // 常驻（gutter）模式按这两个类留出滚动条那一条
    if (!by.hidden) { const tr = Math.max(24, by.clientHeight || (ch - 6)), th = Math.max(24, Math.min(tr, tr * ch / sh)); geo.y = { th, tr }; by.style.setProperty("--sn-thumb", th + "px"); by.style.setProperty("--sn-track", tr + "px"); }
    if (!bx.hidden) { const tr = Math.max(24, bx.clientWidth || (cw - 6)), th = Math.max(24, Math.min(tr, tr * cw / sw)); geo.x = { th, tr }; bx.style.setProperty("--sn-thumb", th + "px"); bx.style.setProperty("--sn-track", tr + "px"); }
    if (js) paint();
    axes();
  };
  const later = () => { if (!raf) raf = requestAnimationFrame(measure); };
  new ResizeObserver(later).observe(vp);
  new MutationObserver(later).observe(vp, { childList: true, subtree: true, characterData: true });
  if (vp.tagName === "TEXTAREA") vp.addEventListener("input", later); // 输入框的内容变了不会触发 DOM 变化：按输入重新量滑块
  // 不支持滚动时间线时，JS 每帧写滑块位置和渐隐宽度
  const fadeW = () => parseFloat(getComputedStyle(box).getPropertyValue("--sn-sa-fade")) || 24;
  function paint() {
    const fy = vp.scrollHeight - vp.clientHeight, fx = vp.scrollWidth - vp.clientWidth, w = fadeW();
    $thumb(by).style.translate = `0 ${fy > 0 ? (vp.scrollTop / fy) * (geo.y.tr - geo.y.th) : 0}px`;
    $thumb(bx).style.translate = `${fx > 0 ? (vp.scrollLeft / fx) * (geo.x.tr - geo.x.th) : 0}px 0`;
    vp.style.setProperty("--sn-sa-t", (vp.classList.contains("sn-no-t") ? 0 : Math.min(w, vp.scrollTop)) + "px");
    vp.style.setProperty("--sn-sa-b", (vp.classList.contains("sn-no-b") ? 0 : Math.min(w, Math.max(0, fy - vp.scrollTop))) + "px");
    vp.style.setProperty("--sn-sa-l", (vp.classList.contains("sn-no-l") ? 0 : Math.min(w, vp.scrollLeft)) + "px");
    vp.style.setProperty("--sn-sa-r", (vp.classList.contains("sn-no-r") ? 0 : Math.min(w, Math.max(0, fx - vp.scrollLeft))) + "px");
  }
  const $thumb = (b) => b.firstElementChild;
  if (js) box.classList.add("sn-js-driven");
  // 滚动时显示滚动条，停下 0.7 秒后淡出
  let idle = 0;
  vp.addEventListener("scroll", () => {
    box.classList.add("sn-active"); clearTimeout(idle); idle = setTimeout(() => box.classList.remove("sn-active"), 700);
    if (js) { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  }, { passive: true });
  // 拖动滑块、点轨道翻页
  for (const [b, ax] of [[by, "y"], [bx, "x"]]) {
    const th = $thumb(b);
    th.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation(); th.setPointerCapture(e.pointerId); b.classList.add("sn-drag");
      const p0 = ax === "y" ? e.clientY : e.clientX, s0 = ax === "y" ? vp.scrollTop : vp.scrollLeft;
      const range = ax === "y" ? vp.scrollHeight - vp.clientHeight : vp.scrollWidth - vp.clientWidth, k = range / Math.max(1, geo[ax].tr - geo[ax].th);
      // 拖滑块一下能跳很远：设好位置后同步发 sa-jump，让虚拟列表在同一个任务里把新位置的内容画出来，不等下一帧的 scroll 事件
      const mv = (ev) => { const d = ((ax === "y" ? ev.clientY : ev.clientX) - p0) * k; if (ax === "y") vp.scrollTop = s0 + d; else vp.scrollLeft = s0 + d; vp.dispatchEvent(new Event("sa-jump")); if (js) paint(); };
      const up = () => { b.classList.remove("sn-drag"); th.removeEventListener("pointermove", mv); th.removeEventListener("pointerup", up); th.removeEventListener("pointercancel", up); };
      th.addEventListener("pointermove", mv); th.addEventListener("pointerup", up); th.addEventListener("pointercancel", up);
    });
    b.addEventListener("pointerdown", (e) => {
      if (e.target !== b) return; const r = th.getBoundingClientRect(), before = ax === "y" ? e.clientY < r.top : e.clientX < r.left;
      vp.scrollBy({ [ax === "y" ? "top" : "left"]: (before ? -1 : 1) * (ax === "y" ? vp.clientHeight : vp.clientWidth) * .9, behavior: "smooth" });
    });
  }

  // ———— 滚到头（见下面的 elastic）：auto 在一次滚动里滚到头就停住、不回弹；bounce 由它画回弹 ————
  const ela = elastic(vp, () => o, () => axes());
  // ———— 滚轮转横向（wheel: "x"）：要拦截滚轮（preventDefault），只有开了这一项才挂这个非 passive 的监听 ————
  function onWheelX(e) {
    if (e.ctrlKey) return;
    const dx = e.deltaX, dy = e.deltaY;
    if (Math.abs(dy) > Math.abs(dx) && vp.scrollWidth > vp.clientWidth + 1 && vp.scrollHeight <= vp.clientHeight + 1) {
      const max = vp.scrollWidth - vp.clientWidth;
      if ((dy < 0 && vp.scrollLeft > 0) || (dy > 0 && vp.scrollLeft < max - 1)) { e.preventDefault(); vp.scrollLeft += dy; }
      // 竖滚轮滚到头：放行，外层页面接着滚
    }
  }
  let wheelingX = false;
  // 滚到头的行为按方向分开设：只在真能滚的那个方向上停住（none：不传给外层、也不出浏览器自带的回弹），不能滚的方向放行——横向长条上竖着滚，页面照样能滚。
  // auto 的竖向平时交给外层；一次滚动在区域里开始时，elastic 在这次滚动里临时改成 none（holding），滚动结束后回到这里的设定
  function axes() {
    const sx = vp.scrollWidth > vp.clientWidth + 1, sy = vp.scrollHeight > vp.clientHeight + 1, m = o.overscroll;
    const isTbl = vp.classList.contains("sn-tbl-sc");
    vp.style.overscrollBehaviorX = isTbl ? "none" : (m === "chain" || !sx ? "auto" : "none");
    vp.style.overscrollBehaviorY = ela.holding() ? "none" : m === "chain" || m === "auto" || !sy ? "auto" : "none";
  }
  // ———— 应用配置（创建时一次；以后 set() 再调） ————
  function apply() {
    const f = { y: "top bottom", x: "left right", both: "top bottom left right", none: "" }[o.fade] ?? o.fade;
    const on = (k) => f.includes(k);
    vp.classList.toggle("sn-fy", on("top") || on("bottom")); vp.classList.toggle("sn-fx", on("left") || on("right"));
    vp.classList.remove("sn-no-t", "sn-no-b", "sn-no-l", "sn-no-r");
    if (on("top") !== on("bottom")) vp.classList.add(on("top") ? "sn-no-b" : "sn-no-t");
    if (on("left") !== on("right")) vp.classList.add(on("left") ? "sn-no-r" : "sn-no-l");
    if (o.size != null) box.style.setProperty("--sn-sa-fade", o.size + "px");
    box.dataset.bar = o.bar; box.dataset.over = o.overscroll;
    box.style.setProperty("--sn-sa-bar", o.barSize + "px"); box.style.setProperty("--sn-sa-inset", o.barInset + "px");
    axes();
    if (o.wheel === "x" && !wheelingX) { vp.addEventListener("wheel", onWheelX, { passive: false }); wheelingX = true; }
    if (o.wheel !== "x" && wheelingX) { vp.removeEventListener("wheel", onWheelX); wheelingX = false; }
    if (o.overscroll !== "bounce") ela.release();
  }
  apply(); measure();
  // 销毁：拆掉包的那一层和两根滚动条、还原类名和内联样式，元素回到接之前的样子（同一个元素可以再接一次）。
  // 挂载时加的监听、观察器由 createScrollArea（或外面的组件）的 destroy 一起撤
  let dead = false;
  const destroy = () => {
    if (dead) return; dead = true;
    cancelAnimationFrame(raf); raf = 0; ela.release?.();
    by.remove(); bx.remove();
    if (o.inner) { while (vp.firstChild) el.insertBefore(vp.firstChild, vp); vp.remove(); el.style.padding = elPad0; el.style.overflow = elOv0; el.style.position = elPos0; }
    else if (box.parentNode) { box.parentNode.insertBefore(el, box); box.remove(); }
    if (o.inner) { el.className = elCls0; if (!elCls0) el.removeAttribute("class"); }
    else {
      // 元素自己当视口：只撤这里加的类和内联样式（滚到头的设定、JS 驱动时的渐隐宽度）——接上以后别人加的类、写的样式不动
      const had = new Set(elCls0.split(/\s+/));
      for (const c of ["sn-sa-vp", "sn-fy", "sn-fx", "sn-no-t", "sn-no-b", "sn-no-l", "sn-no-r"]) if (!had.has(c)) el.classList.remove(c);
      if (!el.className) el.removeAttribute("class");
      el.style.overscrollBehaviorX = osX0; el.style.overscrollBehaviorY = osY0; for (const k of ["t", "b", "l", "r"]) el.style.removeProperty(`--sn-sa-${k}`);
      if (!el.getAttribute("style")) el.removeAttribute("style");
    }
    delete el._sa; delete vp._sa;
  };
  const api = { box, vp, refresh: measure, set(next) { Object.assign(o, next); apply(); later(); }, destroy, get options() { return { ...o }; } };
  el._sa = api; vp._sa = api;
  onCleanup(destroy); // 在组件挂载或 enhance() 里建的：撤销时拆掉（直接调 scrollArea 的不受影响）
  return api;
}
// ———— 滚到头：一次滚动开始时决定滚到头谁来管 ————
// 一次滚动：滚轮 / 触控板事件间隔 < 160ms 算同一次（松手后的惯性也算）；触摸从按下、滑动到松手后惯性滚完算一次。
//  · "auto"（默认）：开始时这个方向还能滚，这次滚动就归区域自己——关掉浏览器的回弹和传递（overscroll-behavior: none），滚到头就停住，
//    不回弹、也不带着页面滚；开始时已经到头，不接管，浏览器把滚动交给外层（页面接着滚）。
//    浏览器自带的回弹（macOS 触控板、手机）会把整个滚动内容连同吸附的表头、合计行一起拉走，表格里露出空隙——所以表格、列表都不回弹。
//  · "bounce"：能滚的方向都由这里画回弹——再往外拉会被拉开一段（越拉越紧，最多 72px），停手 90ms 后弹回（合成线程上播）；拉的是整个视口。
// 一次滚动结束后调 restore 恢复原来的设定。监听全是 passive 的：不拦截滚动，合成线程不用等主线程。
// 滚动区域内部用；数据表格（自己画滚动条、不包滚动区域）也直接用：elastic(vp, () => ({ overscroll: "auto" }), 恢复函数)
export function elastic(vp, opts, restore = () => {}) {
  const MAXO = 72; let ov = 0, ovAxis = "y", ovT = 0, ovAnim = null, gest = null, gestT = 0, gestEnd = 0, touch = null, settling = false;
  const reduced = () => document.documentElement.classList.contains("sn-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const owns = () => { const m = opts().overscroll; return m === "auto" || m === "bounce"; };
  const room = (axis) => axis === "y" ? [vp.scrollTop, vp.scrollHeight - vp.clientHeight] : [vp.scrollLeft, vp.scrollWidth - vp.clientWidth];
  // 这一次滚动归不归区域自己：bounce 都归；auto 只在开始时这个方向还能滚才归——这次滚动里竖向改成 none，滚到头停住、不传给外层
  function begin(axis, d) {
    const o = opts(), [pos, max] = room(axis);
    gest = { mine: max > 1 && (o.overscroll === "bounce" || (d < 0 ? pos > .5 : pos < max - 1)) };
    if (o.overscroll === "auto" && axis === "y") { if (gest.mine) vp.style.overscrollBehaviorY = "none"; else restore(); }
  }
  function end() { gest = null; touch = null; settling = false; restore(); }
  const endLater = () => { clearTimeout(gestEnd); gestEnd = setTimeout(end, 220); };
  function stretch(axis, d) {
    if (ovAnim) { const m = new DOMMatrixReadOnly(getComputedStyle(vp).transform); ov = axis === "y" ? m.f : m.e; ovAnim.cancel(); ovAnim = null; }
    if (axis !== ovAxis) ov = 0; ovAxis = axis;
    const k = .4 * (1 - Math.min(1, Math.abs(ov) / MAXO)) ** 2; ov = Math.max(-MAXO, Math.min(MAXO, ov - d * k));
    vp.style.transform = axis === "y" ? `translateY(${ov}px)` : `translateX(${ov}px)`;
    clearTimeout(ovT); ovT = setTimeout(release, 90);
  }
  function release() {
    if (!ov) return; const from = vp.style.transform; vp.style.transform = ""; ov = 0;
    ovAnim = vp.animate([{ transform: from }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.2, .9, .25, 1)" });
    ovAnim.onfinish = () => (ovAnim = null);
  }
  function onWheel(e) {
    if (e.ctrlKey || touch || !owns()) return;
    const o = opts(), now = performance.now(), dx = e.deltaX, dy = e.deltaY, axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x", d = axis === "y" ? dy : dx;
    if (o.overscroll === "auto" && axis === "x") return; // auto：横向本来就停住
    if (!gest || now - gestT > 160) begin(axis, d);
    gestT = now; endLater();
    if (!gest.mine || o.overscroll !== "bounce" || reduced()) return;
    const [pos, max] = room(axis);
    if ((d < 0 && pos <= .5) || (d > 0 && pos >= max - 1)) stretch(axis, d);
  }
  // 触摸：按下时还不知道往哪滑，第一下滑动（超过 4px）定方向，规则同上；松手后等惯性滚完（220ms 没有滚动）才算这次结束
  function onTouchStart(e) {
    if (!owns() || e.touches.length !== 1) return;
    clearTimeout(gestEnd); settling = false; gest = null; touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchMove(e) {
    if (!touch || gest) return;
    const t = e.touches[0], dx = touch.x - t.clientX, dy = touch.y - t.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
    if (Math.abs(dy) >= Math.abs(dx)) begin("y", dy); else gest = { mine: false };
  }
  function onTouchEnd(e) { if (!touch || e.touches.length) return; touch = null; settling = true; endLater(); }
  const pass = { passive: true };
  vp.addEventListener("wheel", onWheel, pass);
  vp.addEventListener("touchstart", onTouchStart, pass); vp.addEventListener("touchmove", onTouchMove, pass);
  vp.addEventListener("touchend", onTouchEnd, pass); vp.addEventListener("touchcancel", onTouchEnd, pass);
  vp.addEventListener("scroll", () => { if (settling) endLater(); }, pass);
  // 区域自己管着这次滚动（auto）：滚动区域重新设定滚到头的行为时，竖向保持 none，直到这次滚动结束
  const holding = () => !!gest?.mine && opts().overscroll === "auto";
  return { owns, holding, release, stretch };
}
