import { TICK, showTip, hideTip, tipTarget } from "../core/core.js";
import { onCleanup } from "../core/lifecycle.js";
import { hitAny, pushDismiss, dropDismiss } from "../overlay/dismiss.js";
import { computeFloating, isAnchorOutOfView } from "../overlay/floating.js";
import { svg } from "../foundation/svg.js";
import { eye, eyeOff } from "../foundation/icons/index.js";
import { scoped } from "../foundation/i18n.js";
import I18N_DEFAULTS from "../foundation/locales/zh-CN/form.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
// UI 库设计稿：按钮的等待和成功、菜单与下拉、复制、芯片、字段校验、输入框、密码、自动增高、滑块、验证码。
// 所有数值照 09 号：等待 300/500ms、错误抖动 360ms、列表补位用弹簧、离开用 ease.in。
// ———— 复选框：整个组件库共用一份 ————
// 页面上的 <label class="check"><input type="checkbox">${BOX}文字</label>、表格里受控的 <span class="check">${BOX}</span>（类名 on / mixed），
// 还有 Canvas 表格画的勾选框，都用这里的路径和时长：底色 140ms、勾 180ms（晚 40ms 起笔）、半选横条 160ms、勾上那一下缩到 88% 再弹回 260ms。
export const CHECK = { path: "M2.5 6.2l2.4 2.4 4.6-5", pts: [[2.5, 6.2], [4.9, 8.6], [9.5, 3.6]], dash: 14, stroke: 1.8, fill: 140, tick: 180, tickDelay: 40, bar: 160, pop: 260 };
export const BOX = `<span class="sn-box"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${CHECK.path}"/></svg><span class="sn-bar"></span></span>`;
// kit.css 里缓动令牌的同一条曲线（JS 版）：Canvas 上画的动效、WAAPI 都用这几条，和 CSS 过渡一模一样
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, D = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x; for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) return Y(t); const d = D(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) break; if (e > 0) hi = t; else lo = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
export const EASE_CSS = { out: "cubic-bezier(0, 0, .58, 1)", outStrong: "cubic-bezier(.22, 1, .36, 1)", overshoot: "cubic-bezier(.34, 1.56, .64, 1)", inOut: "cubic-bezier(.42, 0, .58, 1)" };
export const EASE = { out: /* @__PURE__ */ bezier(0, 0, .58, 1), outStrong: /* @__PURE__ */ bezier(.22, 1, .36, 1), overshoot: /* @__PURE__ */ bezier(.34, 1.56, .64, 1), inOut: /* @__PURE__ */ bezier(.42, 0, .58, 1) };
const calm = () => document.documentElement.classList.contains("sn-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
// 勾上那一下的"弹"：缩到 88% 再弹回，两段都用回弹曲线（Canvas 版按这个函数画）
export const popScale = (t) => (t < .4 ? 1 - .12 * EASE.overshoot(t / .4) : .88 + .12 * EASE.overshoot((t - .4) / .6));
// 只在用户自己点的时候播：页面上的复选框靠 change 事件自动播（initForms 里挂了）；表格里受控的由表格在点的那一下调。程序改状态、表格复用行时都不播
// 数值补间：一组数从 from 一起滑到 to，每帧回调一次（最后一帧 end = true），返回停止函数。
// 不跟着指针走的变化（Esc 恢复列宽、双击按内容定宽）都用它，不一帧跳过去；默认曲线和时长同列换位置的滑动（EASE.outStrong、220ms）
export function tween(from, to, onFrame, dur = 220, ease = EASE.outStrong) {
  const t0 = performance.now(); let raf = 0;
  const f = (now) => { const t = Math.min(1, Math.max(0, (now - t0) / dur)), e = ease(t), cur = {}; for (const k in to) cur[k] = from[k] + (to[k] - from[k]) * e; raf = t < 1 ? requestAnimationFrame(f) : 0; onFrame(cur, t >= 1); };
  raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
}
// 内容本来要多宽（不管现在被挤成多窄、有没有省略号）：量里面所有内容的外框。按内容定列宽用（scrollWidth 量到的是撑满格子的容器，只能变宽不能变窄）
export const contentW = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
// 拖起来的影子淡进来：每帧在主线程上直接写透明度。不用 CSS animation / WAAPI：刚开始的那一两帧动画还在"等待开始"，
// 这时如果同一帧里有样式表被改写（表格每帧写列宽、位移），会被打断一帧——先闪成不透明再从头播
export const liftIn = (el, dur = 160) => {
  if (calm()) return; const to = +getComputedStyle(el).opacity, t0 = performance.now(); el.style.opacity = "0";
  const f = (now) => { const t = Math.min(1, Math.max(0, (now - t0) / dur)); el.style.opacity = t < 1 ? (to * EASE.out(t)).toFixed(3) : ""; if (t < 1 && el.isConnected) requestAnimationFrame(f); };
  requestAnimationFrame(f);
};
export function popCheck(box) { if (box && !calm()) box.animate([{ scale: 1, easing: EASE_CSS.overshoot }, { scale: .88, offset: .4, easing: EASE_CSS.overshoot }, { scale: 1 }], { duration: CHECK.pop }); }
// 滑块：悬停圆钮放大，拖动时再放大并显示数值；方向键走一格，Shift 走十分之一。
// 标记：<div class="slider" data-slider data-max="100" tabindex="0" role="slider" aria-valuenow="52"><span class="rail"></span><span class="fillbar"></span><span class="knob"></span><span class="bubble"></span></div>
// 值变了派发 slide 事件（detail 是新值）；el.setValue(v) 从外面设值
export function initSlider(s) {
  const $ = (q) => s.querySelector(q), min = Number(s.dataset.min ?? s.getAttribute("aria-valuemin") ?? 0), max = Number(s.dataset.max ?? s.getAttribute("aria-valuemax") ?? 100), span = Math.max(1, max - min), fill = $(".sn-fillbar"), knob = $(".sn-knob"), bubble = $(".sn-bubble");
  const clampV = (n) => Math.min(max, Math.max(min, n));
  let v = clampV(Number(s.getAttribute("aria-valuenow") ?? min));
  const render = () => {
    const p = ((v - min) / span) * 100; fill.style.width = p + "%"; knob.style.left = p + "%"; if (bubble) { bubble.style.left = p + "%"; bubble.textContent = v; }
    if (s.getAttribute("aria-valuenow") !== String(v)) { s.setAttribute("aria-valuenow", v); s.dispatchEvent(new CustomEvent("slide", { detail: v })); }
  };
  s.setValue = (nv) => { v = clampV(nv); s.setAttribute("aria-valuenow", v); render(); };
  const fromX = (x) => { const r = s.getBoundingClientRect(); v = clampV(Math.round(min + Math.min(1, Math.max(0, (x - r.left) / r.width)) * span)); render(); };
  s.addEventListener("pointerdown", (e) => { s.setPointerCapture(e.pointerId); s.classList.add("sn-drag"); fromX(e.clientX); });
  s.addEventListener("pointermove", (e) => s.classList.contains("sn-drag") && fromX(e.clientX));
  for (const ev of ["pointerup", "pointercancel"]) s.addEventListener(ev, () => s.classList.remove("sn-drag"));
  s.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? Math.max(1, Math.round(span / 10)) : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v = Math.min(max, v + step); else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = Math.max(min, v - step); else return;
    e.preventDefault(); render(); s.classList.add("sn-drag"); clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove("sn-drag"), 700);
  });
  render();
}
// 复选框勾上：弹一下（只有用户自己点的才会触发 change；程序改的、表格复用行时都不播）。引入这个模块就生效，官网和库的使用者不用另接
// 复制按钮复制成功后：图标原地变成对勾 1.2 秒；若当前正显示着它的 Tooltip，就地改成"已复制"并在 1.2 秒后一并收起，不另弹 Toast、也不滞留。
// 按钮里放 <span class="sn-swap"><span class="sn-a" data-i="copy"></span><span class="sn-b" data-i="check"></span></span>
export function copied(b) {
  const sw = b.querySelector(".sn-swap"); sw?.classList.add("sn-on");
  if (b.hasAttribute("data-tip") && tipTarget() === b) showTip(b, tt("form.0"));
  else if (tipTarget() !== b) hideTip();
  clearTimeout(b._t);
  b._t = setTimeout(() => { sw?.classList.remove("sn-on"); if (tipTarget() === b) hideTip(true); }, 1200);
}
// 按钮的等待 → 成功：300ms 内完成就不显示转圈；转圈出现后至少留 500ms，不闪一下就没；成功后对勾留 1.5 秒。
// work 可以是毫秒数，也可以是 Promise（真实请求）。按钮里要有 .label > .spin + .tick + .txt，用 prepBusy(btn) 一次补齐。
export function busy(btn, work) {
  return new Promise((resolve) => {
    let shownAt = 0;
    const show = setTimeout(() => { btn.classList.add("sn-busy"); shownAt = performance.now(); }, 300);
    const done = () => {
      clearTimeout(show);
      const wait = shownAt ? Math.max(0, 500 - (performance.now() - shownAt)) : 0;
      setTimeout(() => { btn.classList.remove("sn-busy"); resolve(); }, wait);
    };
    if (typeof work === "number") setTimeout(done, work); else Promise.resolve(work).finally(done);
  });
}
export const succeed = (btn, back = 1500) => { btn.classList.add("sn-ok"); setTimeout(() => btn.classList.remove("sn-ok"), back); };
export const prepBusy = (btn) => { if (!btn.querySelector(".sn-label")) btn.innerHTML = `<span class="sn-sheen"></span><span class="sn-label"><span class="sn-spin"></span>${TICK}<span class="sn-txt">${btn.innerHTML}</span></span>`; return btn; };
// ———— 下拉选择、菜单按钮（.select）————
// 从触发器长出来，带一点回弹；上下键移动、回车选中、Esc 关闭并把焦点还给触发器；点外面关闭；同一时间只开一个。
// 标记：<div class="select" data-select>（选中后把文字写进 .val，打勾）或 <div class="select">（菜单按钮：选了就关）
//   里面一个触发器（.trigger 或 [data-menubtn]）和一个 .menu，条目是 .item（data-v 是值，没写就用文字）。
//   菜单按钮的触发器写了 data-prefix（比如"排序："），选中后按钮文字变成 前缀 + 条目文字。
// mountSelect(元素, { onChange(value, item) })：返回 { open(), close(refocus), value, set(value) }；选中时还在元素上发 select 事件（detail: { value, item }）
const selects = new Set();
// 销毁时把它从登记表里拿掉
export const forgetSelect = (api) => selects.delete(api);
export function mountSelect(h, { onChange } = {}) {
  if (h._select) return h._select;
  const trig = h.querySelector(".sn-trigger,[data-menubtn]"), menu = h.querySelector(".sn-menu"), items = [...h.querySelectorAll(".sn-menu .sn-item")];
  const preferUp = h.classList.contains("sn-up") || !!menu?.classList.contains("sn-up");
  const preferEnd = h.classList.contains("sn-end") || h.classList.contains("sn-cm-models") || !!menu?.classList.contains("sn-end");
  const place = (autoOut) => {
    if (!menu || !trig?.getBoundingClientRect || !globalThis.innerHeight) return;
    if (autoOut && isAnchorOutOfView(trig)) return close(false);
    const pos = computeFloating(menu, trig, { preferUp, preferEnd, gap: 6, margin: 8 });
    const mc = menu.classList; mc.toggle("sn-up", pos.up); mc.toggle("sn-down", !pos.up); mc.toggle("sn-end", pos.end); mc.toggle("sn-start", !pos.end);
    pos.dx ? menu.style.setProperty("--sn-menu-dx", `${pos.dx}px`) : menu.style.removeProperty("--sn-menu-dx");
    pos.dy ? menu.style.setProperty("--sn-menu-dy", `${pos.dy}px`) : menu.style.removeProperty("--sn-menu-dy");
    menu.style.transformOrigin = `${pos.ox}px ${pos.oy}px`;
  };
  const onRe = () => place(false), onSc = (e) => { if (!menu || (e.target !== menu && !menu.contains?.(e.target))) place(true); };
  let dl = null;
  const close = (refocus) => {
    if (!h.classList.contains("sn-open")) return;
    h.classList.remove("sn-open"); trig?.setAttribute("aria-expanded", "false"); items.forEach((x) => x.classList.remove("sn-hl"));
    if (dl) { dropDismiss(dl); dl = null; }
    globalThis.removeEventListener?.("resize", onRe); globalThis.removeEventListener?.("scroll", onSc, true); globalThis.removeEventListener?.("satin-reposition", onRe);
    if (refocus) trig?.focus();
  };
  const open = () => {
    for (const o of selects) if (o !== api) o.close();
    place(false);
    h.classList.add("sn-open"); trig?.setAttribute("aria-expanded", "true"); hideTip();
    // 精准判定交互面：只认触发按钮与菜单本体，绝不把宿主容器里的多余空白区当成内部
    dl = pushDismiss({ panel: menu || h, trigger: trig || h, close, contains: (t, p) => hitAny(t, p, [trig || h, menu]) });
    globalThis.addEventListener?.("resize", onRe); globalThis.addEventListener?.("scroll", onSc, { passive: true, capture: true }); globalThis.addEventListener?.("satin-reposition", onRe);
  };
  const valueOf = (it) => it.dataset.v ?? it.textContent.trim();
  const pick = (it, quiet) => {
    if (it.querySelector(".sn-chk") || h.hasAttribute("data-select")) {
      items.forEach((x) => { const on = x === it; x.classList.toggle("sn-sel", on); if (x.hasAttribute("aria-selected")) x.setAttribute("aria-selected", String(on)); });
      const text = it.textContent.trim(), val = h.querySelector(".sn-val");
      if (val) val.textContent = text; else if (trig?.dataset.prefix != null) trig.firstChild.textContent = trig.dataset.prefix + text;
    }
    if (!quiet) { const value = valueOf(it); onChange?.(value, it); h.dispatchEvent(new CustomEvent("select", { bubbles: true, detail: { value, item: it } })); }
  };
  trig?.addEventListener("click", () => (h.classList.contains("sn-open") ? close() : open()));
  items.forEach((it) => {
    it.addEventListener("pointerenter", () => { items.forEach((x) => x.classList.remove("sn-hl")); it.classList.add("sn-hl"); });
    it.addEventListener("click", () => { if (it.classList.contains("sn-is-off")) return; pick(it); close(true); });
  });
  const onKey = (e) => {
    if (!h.classList.contains("sn-open")) { if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && e.target === trig) { e.preventDefault(); open(); items[0]?.classList.add("sn-hl"); } return; }
    const i = items.findIndex((x) => x.classList.contains("sn-hl"));
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items.forEach((x, k) => x.classList.toggle("sn-hl", k === n)); }
    else if (e.key === "Enter" && i >= 0) { e.preventDefault(); items[i].click(); }
  };
  h.addEventListener("keydown", onKey);
  const api = { el: h, open, close, get value() { const s = items.find((x) => x.classList.contains("sn-sel")); return s ? valueOf(s) : null; }, set(v) { const it = items.find((x) => valueOf(x) === String(v)); if (it) pick(it, true); } };
  api.dispose = () => { close(false); h.removeEventListener("keydown", onKey); selects.delete(api); delete h._select; };
  onCleanup(() => api.dispose());
  selects.add(api); h._select = api;
  return api;
}
export function bindSelects(root = document) { for (const h of root.querySelectorAll(".sn-select")) mountSelect(h); }
// ———— 字段报错 ————
// setFieldError(.field, 文字)：错误放在字段下方展开、输入框抖两下；clearFieldError(.field) 收起。一开始输入就自动收起
// validateForm(form, 规则)：规则是 { 字段的 data-f: (值, 输入框) => 错误文字或假值 }；有错的都标出来、焦点到第一个，返回有没有通过
export function setFieldError(f, msg) {
  const err = f.querySelector(".sn-err span"); if (err) err.textContent = msg; f.classList.add("sn-bad");
  f.querySelector(".sn-input")?.setAttribute("aria-invalid", "true"); shakeInput(f);
}
// 字段里的输入框左右抖两下（出错的那一下；React、Vue 的 Field 错误出现时也调它）。减少动态效果时不抖
export function shakeInput(f) {
  const input = f?.querySelector(".sn-input");
  if (input && !matchMedia("(prefers-reduced-motion: reduce)").matches && !document.documentElement.classList.contains("sn-reduce-motion")) { input.classList.remove("sn-shake"); void input.offsetWidth; input.classList.add("sn-shake"); }
}
export function clearFieldError(f) { f.classList.remove("sn-bad"); f.querySelector(".sn-input")?.removeAttribute("aria-invalid"); }
export function validateForm(form, rules) {
  let first = null;
  for (const f of form.querySelectorAll(".sn-field[data-f]")) {
    const input = f.querySelector(".sn-input"), rule = rules[f.dataset.f]; if (!rule || !input) continue;
    const msg = rule(input.value, input); if (msg) { setFieldError(f, msg); first ??= input; } else clearFieldError(f);
  }
  first?.focus(); return !first;
}
// 禁用的按钮（aria-disabled="true"）：点了不响应，只把原因（data-tip）亮出来
// ———— 验证码 ————
// 密码掩码切换按钮（SSR 与运行时共用）：掩码时显示睁眼图标（点一下显示明文），明文时显示闭眼图标（点一下隐藏）
export const otpEyeHTML = (masked = false) =>
  `<button type="button" class="sn-eye sn-otp-eye" data-otp-eye aria-label="${masked ? tt("form.2") : tt("form.1")}" aria-pressed="${String(!masked)}"><span class="sn-swap${masked ? "" : " sn-on"}"><span class="sn-a">${svg(eye, 16, "eye")}</span><span class="sn-b">${svg(eyeOff, 16, "eye-off")}</span></span></button>`;

const optFlag = (v) => v === "" || (v != null && v !== false && v !== "false");

// mountOtp(容器, { onComplete(code), mask, reveal })：自动跳格、退格回上一格、粘贴自动分配；填进去的数字从下面淡入；支持密码掩码隐藏与眼睛显隐切换；填满时回调。返回 { value, masked, setMask(on), clear() }
export function mountOtp(box, { onComplete, mask, reveal } = {}) {
  if (box._otp) return box._otp;
  const cells = [...box.querySelectorAll("input")], pop = (c) => { c.classList.remove("sn-typed"); void c.offsetWidth; c.classList.add("sn-typed"); };
  const code = () => cells.map((c) => c.value).join(""), done = () => { const v = code(); if (v.length === cells.length) { onComplete?.(v); box.dispatchEvent(new CustomEvent("complete", { bubbles: true, detail: { code: v } })); } };
  let isMasked = mask !== undefined ? optFlag(mask) : (box.hasAttribute("data-mask") && box.getAttribute("data-mask") !== "false");
  const wantReveal = reveal !== undefined ? optFlag(reveal) : (box.hasAttribute("data-reveal") ? box.getAttribute("data-reveal") !== "false" : isMasked);
  let eyeBtn = box.querySelector("[data-otp-eye], .sn-otp-eye"), injectedEye = false;
  if (wantReveal && !eyeBtn) {
    box.insertAdjacentHTML("beforeend", otpEyeHTML(isMasked));
    eyeBtn = box.querySelector("[data-otp-eye]");
    injectedEye = true;
  }
  const syncMask = (on) => {
    isMasked = !!on;
    box.classList.toggle("sn-masked", isMasked);
    for (const c of cells) c.type = isMasked ? "password" : "text";
    if (eyeBtn) {
      eyeBtn.querySelector(".sn-swap")?.classList.toggle("sn-on", !isMasked);
      eyeBtn.setAttribute("aria-label", isMasked ? tt("form.2") : tt("form.1"));
      eyeBtn.setAttribute("aria-pressed", String(!isMasked));
    }
  };
  syncMask(isMasked);
  if (eyeBtn) eyeBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); syncMask(!isMasked); });
  cells.forEach((c, i) => {
    c.addEventListener("input", () => { c.value = c.value.replace(/\D/g, "").slice(-1); if (c.value) { pop(c); cells[i + 1]?.focus(); done(); } });
    c.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !c.value && i > 0) { e.preventDefault(); cells[i - 1].value = ""; cells[i - 1].focus(); }
      else if (e.key === "ArrowLeft") cells[i - 1]?.focus(); else if (e.key === "ArrowRight") cells[i + 1]?.focus();
    });
    c.addEventListener("paste", (e) => {
      const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, cells.length - i); if (!d) return;
      e.preventDefault(); [...d].forEach((ch, k) => { cells[i + k].value = ch; pop(cells[i + k]); }); cells[Math.min(cells.length - 1, i + d.length)].focus(); done();
    });
    c.addEventListener("focus", () => c.select());
  });
  onCleanup(() => { if (injectedEye) eyeBtn?.remove(); });
  return (box._otp = {
    get value() { return code(); },
    get masked() { return isMasked; },
    setMask: syncMask,
    clear() { cells.forEach((c) => (c.value = "")); cells[0]?.focus(); },
  });
}
// ———— 芯片 ————
// 筛选芯片：.chip[data-toggle]，点了切换 .on（aria-pressed 跟着变）；
// 可移除的标签：容器写 data-chips="removable"，标签里的 .x 点了先脱离布局淡出，剩下的用弹簧补位；removeChip(芯片) 也能直接调
const CHIP_SPRING = "linear(0, .32, .78, 1.04, 1.09, 1.06, 1.02, 1, .99, .99, 1)";
// keep：节点由调用方自己删（React、Vue 里父组件从列表里拿掉这一项）——这里只播收起动画、让旁边的补位，播完调 onRemoved
export function removeChip(chip, { onRemoved, keep } = {}) {
  const row = chip.parentElement, sibs = [...row.children].filter((c) => c !== chip);
  const before = new Map(sibs.map((x) => [x, x.getBoundingClientRect()])), r = chip.getBoundingClientRect(), rr = row.getBoundingClientRect();
  const done = () => { if (!keep) chip.remove(); onRemoved?.(); row.dispatchEvent(new CustomEvent("chipremove", { bubbles: true, detail: { chip } })); };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("sn-reduce-motion")) return done();
  row.style.position = "relative"; Object.assign(chip.style, { position: "absolute", left: r.left - rr.left + "px", top: r.top - rr.top + "px", pointerEvents: "none" });
  chip.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.96)" }], { duration: 160, easing: "cubic-bezier(.42,0,1,1)", fill: "forwards" }).onfinish = done;
  for (const x of sibs) { const a = before.get(x), b = x.getBoundingClientRect(); const dx = a.left - b.left, dy = a.top - b.top; if (dx || dy) x.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 520, easing: CHIP_SPRING }); }
}
// ———— 写在标记上：一次接上 ————
// bindForms(root = document)：.select 下拉、[data-copy] 复制、.chip[data-toggle] 筛选芯片、[data-chips="removable"] 可移除标签、
// [data-clearable] 清除按钮、[data-eye] 显示密码、[data-autogrow] 自动长高、[data-slider] 滑块、[data-otp] 验证码、[data-indeterminate] 半选
export function bindForms(root = document) {
  const once = (el) => (el._fw ? false : (el._fw = true));
  // root 自己符合也算（组件只接自己这一个，不去动旁边的）；document 没有 matches，照旧只找里面的
  const all = (q) => [...(root.matches?.(q) ? [root] : []), ...root.querySelectorAll(q)];
  bindSelects(root);
  for (const b of all("[data-copy]")) if (once(b)) b.addEventListener("click", async () => { const v = b.dataset.copy; if (v) try { await navigator.clipboard?.writeText(v); } catch {} copied(b); });
  for (const c of all(".sn-chip[data-toggle]")) if (once(c)) { c.setAttribute("aria-pressed", String(c.classList.contains("sn-on"))); c.addEventListener("click", () => { const on = c.classList.toggle("sn-on"); c.setAttribute("aria-pressed", String(on)); }); }
  for (const row of all('[data-chips="removable"]')) if (once(row)) row.addEventListener("click", (e) => { const x = e.target.closest(".sn-chip .sn-x"); if (x && row.contains(x)) removeChip(x.closest(".sn-chip")); });
  for (const w of all("[data-clearable]")) if (once(w)) {
    const input = w.querySelector("input"), sync = () => w.classList.toggle("sn-filled", !!input.value);
    input.addEventListener("input", sync); sync();
    // 清空后补发一次 input 事件，搜索结果、字数这些跟着输入框走的东西一起归零；阻断冒泡防误触父级浮层触发器
    w.querySelector(".sn-clear")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); sync(); input.focus(); });
  }
  for (const b of all("[data-eye]")) if (once(b)) b.addEventListener("click", () => {
    const input = b.closest(".sn-ib").querySelector("input"), on = input.type === "password";
    input.type = on ? "text" : "password"; b.querySelector(".sn-swap")?.classList.toggle("sn-on", on); b.setAttribute("aria-label", on ? tt("form.1") : tt("form.2")); input.focus();
  });
  for (const t of all("[data-autogrow]")) if (once(t)) t.addEventListener("input", () => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; });
  for (const el of all("[data-slider]")) if (once(el)) initSlider(el);
  for (const box of all("[data-otp]")) mountOtp(box);
  for (const c of all("[data-indeterminate]")) c.indeterminate = true;
}

// 页面级：复选框勾上时弹一下、下拉在外面点一下就收起、字段改了就清错、抖动结束去掉类、带 aria-disabled 的按钮点了不触发（只出提示）。
// setup() 里装一次
export function installForms() {
document.addEventListener("change", (e) => { const i = e.target; if (i instanceof HTMLInputElement && i.type === "checkbox" && i.checked && i.parentElement?.classList.contains("sn-check")) popCheck(i.nextElementSibling); }, true);
document.addEventListener("input", (e) => { const f = e.target.closest?.(".sn-field.sn-bad"); if (f) clearFieldError(f); });
document.addEventListener("animationend", (e) => e.target.classList?.remove("sn-shake"));
// 点了不可用的按钮：提示写的是原因（"等附件传完再发"）才弹出来；和按钮名字一样（"发送"）就不弹——说了等于没说（触屏上点一下灰着的发送按钮也不出"发送 ⌘↵"）
document.addEventListener("click", (e) => { const b = e.target.closest?.('[aria-disabled="true"]'); if (b) { e.preventDefault(); e.stopPropagation(); if (b.dataset.tip && b.dataset.tip !== b.getAttribute("aria-label")) showTip(b, b.dataset.tip); } }, true);
}
