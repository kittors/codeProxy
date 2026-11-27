// Satin：表格滚动条（DOM 版和 Canvas 版共用）。
// 视口还是浏览器原生滚动（滚轮、触控板惯性、键盘都在），只把系统滚动条藏起来，换成这两根：
// - 常驻（gutter）：滚动条有自己的一条位置，不压内容；只有这个方向真的溢出才出现。竖条从表头下面开始（表头那一截是表头的延伸），
//   横条铺满整个宽度（两端是箭头，右边让开竖条）。两端的箭头能点：点一下滚一行 / 一列，按住连续滚（越按越快），
//   按住时指针移出箭头就暂停、移回来接着滚；点轨道往指针那边翻一页，按住连续翻、翻到滑块到指针处为止；滑块随便拖，拖出窗口也跟手。
// - 自动（auto）：悬浮在内容边上，滚动或悬停时出现，停下 0.7 秒淡出；没有箭头。
// 滑块的位置由滚动时间线驱动（合成线程上跟手，不比内容晚一帧）；JS 只量长度、处理点击和拖动。

const SD = typeof CSS !== "undefined" && /* @__PURE__ */ CSS.supports("animation-timeline: scroll()");
const SB = 14, AL = 16, MIN = 24, AUTO = 10;
const PROP = { y: "scrollTop", x: "scrollLeft" };
const ARROW = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M4 2.4 6.1 5.3H1.9z"/></svg>';
// 小三角，描边圆角（样式里 stroke-linejoin: round），不是尖角

/**
 * gridBars(frame, vp, o)
 *  o.head     表头高度（竖条从它下面开始）
 *  o.rowH     一行多高（箭头一步、翻页留一行）
 *  o.rowsH()  所有行加起来多高（不含表头）
 *  o.colsW()  所有列加起来多宽
 *  o.pinL() / o.pinR()  左、右固定列的宽度（横向翻页时一页按中间可滚区域的宽度算）
 *  o.stops()  中间每一列左边对齐到可滚区域左边时的 scrollLeft（横向箭头一步走到下一列）
 *  o.reduced() 减少动态效果
 * 返回 { mode(m), refresh(), get gutterV, get gutterH }
 */
export function gridBars(frame, vp, o) {
  const mk = (ax) => {
    const b = document.createElement("div"); b.className = `sn-g-sb ${ax === "y" ? "sn-v" : "sn-h"}`; b.hidden = true; b.setAttribute("aria-hidden", "true");
    b.innerHTML = `<button class="sn-g-sb-a" data-d="-1" tabindex="-1">${ARROW}</button><div class="sn-g-sb-t"><i class="sn-g-sb-th"></i></div><button class="sn-g-sb-a" data-d="1" tabindex="-1">${ARROW}</button>`;
    frame.append(b); return b;
  };
  const bars = { y: mk("y"), x: mk("x") }, cap = document.createElement("i"); cap.className = "sn-g-sb-cap"; cap.hidden = true; frame.append(cap);
  const geo = { y: { tr: 0, th: MIN }, x: { tr: 0, th: MIN } };
  let mode = "gutter", key = "", gv = false, gh = false;
  frame.classList.add("sn-sb-gutter"); if (!SD) frame.classList.add("sn-sb-js");
  const max = (ax) => ax === "y" ? vp.scrollHeight - vp.clientHeight : vp.scrollWidth - vp.clientWidth;

  // ———— 量：哪个方向溢出、滚动条占不占位置、轨道和滑块多长 ————
  function refresh() {
    const gut = mode === "gutter", H = o.head, CH = H + o.rowsH(), CW = o.colsW(), L = o.pinL(), R = o.pinR(), FW = frame.clientWidth, FH = frame.clientHeight;
    // 常驻时竖条占了宽度可能让横向也溢出（反过来也一样），来回算几次到稳定
    let v = false, h = false;
    if (gut) for (let i = 0; i < 3; i++) { h = CW > FW - (v ? SB : 0) + .5; v = CH > FH - (h ? SB : 0) + .5; }
    else { v = CH > FH + .5; h = CW > FW + .5; }
    const k = [mode, v, h, CH, CW, L, R, FW, FH].join("|"); if (k === key) return; key = k;
    gv = gut && v; gh = gut && h;
    frame.classList.toggle("sn-sb-gutter", gut); frame.classList.toggle("sn-sb-auto", !gut); frame.classList.toggle("sn-sb-v", v); frame.classList.toggle("sn-sb-h", h);
    bars.y.hidden = !v; bars.x.hidden = !h; cap.hidden = !gv;
    if (v) {
      const top = H + (gut ? 1 : 0), bot = h ? (gut ? SB : AUTO) : 0, len = FH - top - bot, tr = len - (gut ? 2 * AL : 4), view = FH - (gh ? SB : 0) - H;
      geo.y = { tr, th: Math.max(MIN, Math.min(tr, tr * view / Math.max(1, CH - H))) };
      Object.assign(bars.y.style, { top: top + "px", bottom: bot + "px" }); bars.y.style.setProperty("--sn-tr", tr + "px"); bars.y.style.setProperty("--sn-th", geo.y.th + "px");
    }
    if (h) { // 横条铺满整个宽度（之前只在中间的列下面，左右各空一大截，看着不合理）；滑块长短按"看得见的宽 / 总宽"
      const right = v ? (gut ? SB : AUTO) : 0, len = FW - right, tr = len - (gut ? 2 * AL : 4), view = FW - (gv ? SB : 0);
      geo.x = { tr, th: Math.max(MIN, Math.min(tr, tr * view / Math.max(1, CW))) };
      Object.assign(bars.x.style, { left: "0px", right: right + "px" }); bars.x.style.setProperty("--sn-tr", tr + "px"); bars.x.style.setProperty("--sn-th", geo.x.th + "px");
    }
    edges(); if (!SD) paint();
  }
  // 滚到头的那一端，箭头变灰、点不动
  const offs = new Map();
  function edges() {
    for (const ax of ["y", "x"]) {
      const s = vp[PROP[ax]], m = max(ax), [a, z] = bars[ax].querySelectorAll(".sn-g-sb-a");
      for (const [btn, off] of [[a, s <= 0], [z, s >= m - 1]]) if (offs.get(btn) !== off) { offs.set(btn, off); btn.classList.toggle("sn-off", off); }
    }
  }
  // 不支持滚动时间线时 JS 写滑块位置
  function paint() {
    for (const ax of ["y", "x"]) { const m = max(ax), p = m > 0 ? vp[PROP[ax]] / m : 0, t = (geo[ax].tr - geo[ax].th) * p; bars[ax].querySelector(".sn-g-sb-th").style.translate = ax === "y" ? `0 ${t}px` : `${t}px 0`; }
  }
  // 自动模式：滚动时显示，停下 0.7 秒淡出
  let idle = 0;
  vp.addEventListener("scroll", () => {
    edges(); if (!SD) paint();
    if (mode === "auto") { frame.classList.add("sn-sb-active"); clearTimeout(idle); idle = setTimeout(() => frame.classList.remove("sn-sb-active"), 700); }
  }, { passive: true });

  // ———— 平滑滚一段（箭头点一下、点轨道翻页）：连点会接着上一次的终点往前加，不丢步 ————
  const tw = { raf: 0, ax: "y", from: 0, to: 0, t0: 0, ms: 120 };
  function glideTo(ax, to, ms) {
    to = Math.max(0, Math.min(max(ax), to));
    if (o.reduced?.() || ms <= 0) { stopGlide(); vp[PROP[ax]] = to; return; }
    if (tw.raf && tw.ax !== ax) stopGlide();
    Object.assign(tw, { ax, from: vp[PROP[ax]], to, t0: performance.now(), ms });
    if (!tw.raf) tw.raf = requestAnimationFrame(gtick);
  }
  const glideBy = (ax, d, ms) => glideTo(ax, (tw.raf && tw.ax === ax ? tw.to : vp[PROP[ax]]) + d, ms);
  function gtick(now) { const t = Math.max(0, Math.min(1, (now - tw.t0) / tw.ms)), e = 1 - (1 - t) ** 3; vp[PROP[tw.ax]] = tw.from + (tw.to - tw.from) * e; tw.raf = t < 1 ? requestAnimationFrame(gtick) : 0; }
  function stopGlide() { if (tw.raf) cancelAnimationFrame(tw.raf); tw.raf = 0; }
  // 按住箭头：连续滚，从 300px/s 加速到最快；指针移出箭头暂停
  let cr = null;
  const VMAX = { y: 1400, x: 1100 }, V0 = 300, ACC = 1.8; // px/s，每毫秒加速 1.8px/s
  function cruise(ax, dir) { stopGlide(); cr = { ax, dir, v: V0, pos: vp[PROP[ax]], last: performance.now(), paused: false, raf: requestAnimationFrame(ctick) }; }
  function ctick(now) {
    if (!cr) return; const dt = Math.max(0, Math.min(48, now - cr.last)); cr.last = now;
    if (!cr.paused) { cr.v = Math.min(VMAX[cr.ax], cr.v + ACC * dt); cr.pos = Math.max(0, Math.min(max(cr.ax), cr.pos + cr.dir * cr.v * dt / 1000)); vp[PROP[cr.ax]] = cr.pos; }
    else cr.v = V0;
    cr.raf = requestAnimationFrame(ctick);
  }
  function stopCruise() { if (cr) cancelAnimationFrame(cr.raf); cr = null; }
  const stopAll = () => { stopGlide(); stopCruise(); };
  vp.addEventListener("wheel", stopAll, { passive: true }); // 用户自己滚了，就不再替他滚

  // 一次按下的生命周期：拿到指针捕获，抬起、取消、捕获丢了、窗口失焦都收尾
  function press(el, e, { move, end }) {
    e.preventDefault(); e.stopPropagation(); stopAll();
    try { el.setPointerCapture(e.pointerId); } catch {}
    let done = false;
    const fin = () => { if (done) return; done = true; for (const [t, f] of evs) el.removeEventListener(t, f); removeEventListener("blur", fin); end?.(); };
    const evs = [["pointermove", (ev) => move?.(ev)], ["pointerup", fin], ["pointercancel", fin], ["lostpointercapture", fin]];
    for (const [t, f] of evs) el.addEventListener(t, f); addEventListener("blur", fin);
  }
  for (const ax of ["y", "x"]) {
    const b = bars[ax], th = b.querySelector(".sn-g-sb-th"), track = b.querySelector(".sn-g-sb-t"), P = (e) => (ax === "y" ? e.clientY : e.clientX);
    // 拖滑块：按住的那一点始终对着滑块上的同一个位置
    th.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; const p0 = P(e), s0 = vp[PROP[ax]], k = max(ax) / Math.max(1, geo[ax].tr - geo[ax].th);
      b.classList.add("sn-drag"); press(th, e, { move: (ev) => { vp[PROP[ax]] = s0 + (P(ev) - p0) * k; }, end: () => b.classList.remove("sn-drag") });
    });
    // 点轨道：往指针那边翻一页；按住连续翻，滑块到了指针处就停；按住时指针可以沿着轨道移动，目标跟着变
    track.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target !== track) return; let at = P(e), tid = 0;
      // 点一下翻一页；按住连续翻：每次走剩下距离的 8%→40%（至少一页），不管多长的表两秒左右就减速停到指针处——终点卡在"滑块中心对准指针"的位置
      let rep = 0;
      const page = () => {
        const r = th.getBoundingClientRect(), a = ax === "y" ? r.top : r.left, z = ax === "y" ? r.bottom : r.right; if (at >= a && at <= z) return false;
        const dir = at < a ? -1 : 1, pg = ax === "y" ? vp.clientHeight - o.head - o.rowH : Math.max(o.rowH, vp.clientWidth - o.pinL() - o.pinR() - 48);
        const cur = tw.raf && tw.ax === ax ? tw.to : vp[PROP[ax]];
        if (rep++ === 0) { glideTo(ax, cur + dir * pg, 140); return true; }
        const tb = track.getBoundingClientRect(), t0 = ax === "y" ? tb.top : tb.left, m = max(ax);
        const goal = Math.max(0, Math.min(m, ((at - t0 - geo[ax].th / 2) / Math.max(1, geo[ax].tr - geo[ax].th)) * m)), size = Math.max(pg, Math.abs(goal - cur) * Math.min(.4, .08 * rep)), next = dir > 0 ? Math.min(goal, cur + size) : Math.max(goal, cur - size);
        if ((dir > 0 && next <= cur) || (dir < 0 && next >= cur)) return false;
        glideTo(ax, next, 140); return Math.abs(next - goal) > .5;
      };
      press(track, e, { move: (ev) => (at = P(ev)), end: () => { clearTimeout(tid); b.classList.remove("sn-paging"); } }); // 先接管指针（会停掉之前的滚动），再翻
      b.classList.add("sn-paging"); page(); tid = setTimeout(function again() { if (page()) tid = setTimeout(again, 70); }, 320);
    });
    // 箭头：点一下走一步（竖着一行，横着到下一列）；按住 300ms 后连续滚；指针移出箭头暂停，移回来接着滚
    for (const btn of b.querySelectorAll(".sn-g-sb-a")) btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || btn.classList.contains("sn-off")) return; const dir = +btn.dataset.d; let tid = 0;
      press(btn, e, { // 先接管指针（会停掉之前的滚动），再走一步
        move: (ev) => { const r = btn.getBoundingClientRect(), inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; btn.classList.toggle("sn-press", inside); if (cr) cr.paused = !inside; },
        end: () => { clearTimeout(tid); stopCruise(); btn.classList.remove("sn-press"); },
      });
      if (ax === "y") glideBy("y", dir * o.rowH, 90);
      else { const sl = tw.raf && tw.ax === "x" ? tw.to : vp.scrollLeft, st = o.stops(); let to = dir > 0 ? max("x") : 0; if (dir > 0) { for (const s of st) if (s > sl + 1) { to = s; break; } } else for (let i = st.length - 1; i >= 0; i--) if (st[i] < sl - 1) { to = st[i]; break; } glideTo("x", to, 120); }
      btn.classList.add("sn-press"); tid = setTimeout(() => cruise(ax, dir), 300);
    });
  }
  return {
    refresh,
    mode(m) { if (m === mode) return; mode = m; key = ""; frame.classList.remove("sn-sb-active"); refresh(); },
    get gutterV() { return gv ? SB : 0; }, get gutterH() { return gh ? SB : 0; },
  };
}
