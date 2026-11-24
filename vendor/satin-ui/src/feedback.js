// UI 库设计稿第二批：反馈。这里先放 Toast（状态、操作、进度），通知、横幅、骨架、进度卡见 initFeedback。
// 数值照 09 号 §6、§7：进入 500ms 下落 10px 并从 8px 模糊变清晰，离开 200ms ease.in；同时最多 3 条；悬停或聚焦时暂停计时。
import { icon } from "./icons.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/feedback.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const root = typeof document !== "undefined" ? document.documentElement : undefined;
const reduced = () => root.classList.contains("sn-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
const ENTER = "cubic-bezier(.25,.1,.25,1)", EASE_IN = "cubic-bezier(.42,0,1,1)", IN_OUT = "cubic-bezier(.42,0,.58,1)", POP = "cubic-bezier(.34,1.56,.64,1)";
const RING = 2 * Math.PI * 6.5;
// 文案转成 HTML：文件名包进 .sn-fname，不让中英文自动留空插到"第三集.mp4"中间
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// 通知里按钮的外观：variant 写 "secondary"、"ghost"……（和 <Button variant> 一样），类名加上 sn- 前缀（已经带了就不再加）
const btnVariant = (v = "secondary") => (v.startsWith("sn-") ? v : "sn-" + v);
export const fmt = (s) => esc(s).replace(/[^\s&;·，。"]+\.[a-z][a-z0-9]{1,4}\b/gi, (m) => `<span class="sn-fname">${m}</span>`);
const ringSVG =() => `<svg class="sn-ring" viewBox="0 0 16 16" aria-hidden="true"><circle class="sn-track" cx="8" cy="8" r="6.5"/><circle class="sn-left" cx="8" cy="8" r="6.5" style="stroke-dasharray:${RING};stroke-dashoffset:0"/></svg>`;
let host = null, z = 0;
const live = [];
// 新的在前

function getHost() {
  if (host) return host;
  host = document.createElement("div"); host.className = "sn-toasts"; host.dataset.pos = localStorage.getItem("satin-toast") || "top";
  document.body.append(host);
  const pauseAll = (on) => live.forEach((t) => t.pause(on));
  host.addEventListener("pointerenter", () => pauseAll(true));
  host.addEventListener("pointerleave", () => { if (!host.contains(document.activeElement)) pauseAll(false); });
  host.addEventListener("focusin", () => pauseAll(true));
  host.addEventListener("focusout", (e) => { if (!host.contains(e.relatedTarget) && !host.matches(":hover")) pauseAll(false); });
  return host;
}
function layout() {
  let y = 0; const up = host.dataset.pos === "bottom" ? -1 : 1;
  for (const t of live) { t.el.style.transform = `translateY(${up * y}px)`; y += t.el.offsetHeight + 8; }
}
export function setToastPos(pos) {
  getHost().dataset.pos = pos; localStorage.setItem("satin-toast", pos);
  live.forEach((t) => (t.el.style.transition = "none")); layout();
  requestAnimationFrame(() => live.forEach((t) => (t.el.style.transition = "")));
}
export const toastPos = () => getHost().dataset.pos;
/**
 * toast({ kind, text, tone, action, duration })
 *  kind: "status"（对勾或信息图标，3 秒）| "action"（倒计时环 + 按钮，5 秒）| "progress"（进度环 + 百分比，直到 update 成结果）
 *  返回 { update(o), close() }。update 原地变形：图标换、文字模糊换、宽度跟着走，done 时扫一道光。
 */
export function toast(o = {}) {
  const h = getHost(), el = document.createElement("div");
  el.className = "sn-toast"; el.setAttribute("role", o.alert ? "alert" : "status");
  el.innerHTML = '<div class="sn-toast-in"><span class="sn-ico"></span><span class="sn-txt"></span><span class="sn-pct sn-num"></span></div>';
  const inner = el.firstElementChild, ico = inner.children[0], txt = inner.children[1], pct = inner.children[2];
  let timer = 0, left = 0, startedAt = 0, ring = null, closed = false, paused = h.matches(":hover");
  const t = { el, pause, update, close };

  function setIcon(kind, tone, animate) {
    const old = ico.firstElementChild, wrap = document.createElement("span");
    wrap.className = "sn-glyph" + (tone ? " sn-" + tone : ""); // 状态色：.sn-glyph.sn-ok / .sn-danger / .sn-info（前缀不能漏，不然图标没有颜色）
    wrap.innerHTML = kind === "count" || kind === "progress" ? ringSVG() : icon(kind, 16);
    ico.append(wrap); ring?.cancel(); ring = null;
    if (old) {
      if (animate && !reduced()) {
        old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.6)" }], { duration: 140, easing: EASE_IN, fill: "forwards" }).onfinish = () => old.remove();
        wrap.animate([{ opacity: 0, transform: "scale(.6) rotate(-12deg)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: 60, easing: POP, fill: "backwards" });
      } else old.remove();
    }
    return wrap;
  }
  function setText(s, animate) {
    const old = txt.firstElementChild, span = document.createElement("span"); span.innerHTML = fmt(s);
    if (!animate || !old || reduced()) { txt.replaceChildren(span); return; }
    old.classList.add("sn-old"); txt.append(span);
    old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-3px)" }], { duration: 160, easing: EASE_IN, fill: "forwards" }).onfinish = () => old.remove();
    span.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 80, easing: ENTER, fill: "backwards" });
  }
  function setAction(a) {
    inner.querySelector(".sn-act")?.remove(); inner.classList.toggle("sn-has-act", !!a);
    if (!a) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "sn-act"; b.textContent = a.label;
    b.addEventListener("click", () => a.run?.(t)); inner.append(b);
  }
  function setProgress(p) {
    const c = ico.querySelector(".sn-ring .sn-left"); if (c) c.style.strokeDashoffset = String(RING * (1 - p));
    pct.textContent = Math.round(p * 100) + "%";
  }
  function arm(ms) {
    clearTimeout(timer); left = ms; startedAt = performance.now();
    if (ms !== Infinity && !paused) timer = setTimeout(close, ms);
  }
  function pause(on) {
    if (closed || paused === on) return; paused = on;
    if (on) { clearTimeout(timer); if (left !== Infinity) left -= performance.now() - startedAt; ring?.pause(); }
    else { startedAt = performance.now(); if (left !== Infinity) timer = setTimeout(close, Math.max(600, left)); ring?.play(); }
  }
  function shine() { if (reduced()) return; inner.classList.remove("sn-shine"); void inner.offsetWidth; inner.classList.add("sn-shine"); }
  function apply(n, animate) {
    const kind = n.kind || "status";
    const glyph = setIcon(kind === "action" ? "count" : kind === "progress" ? "progress" : n.icon || "check", n.tone ?? (kind === "status" && !n.icon ? "ok" : ""), animate);
    setText(n.text || "", animate); setAction(n.action); pct.textContent = ""; inner.classList.toggle("sn-has-pct", kind === "progress");
    const ms = n.duration ?? (kind === "progress" ? Infinity : n.action ? 5000 : 3000);
    if (kind === "progress") setProgress(n.progress || 0);
    if (kind === "action" && !reduced()) {
      ring = glyph.querySelector(".sn-left").animate([{ strokeDashoffset: 0 }, { strokeDashoffset: RING }], { duration: ms, easing: "linear", fill: "forwards" });
      if (paused) ring.pause();
    }
    arm(ms);
    // 光泽只给成功的那一刻：状态 Toast 进入（失败、信息类不扫）、进度变成结果、撤销完成
    const success = (n.tone ?? (kind === "status" && !n.icon ? "ok" : "")) === "ok";
    if (n.done || (kind === "status" && !animate && success)) shine();
  }
  function update(n) {
    if (closed) return;
    if (n.progress != null && !n.kind) { setProgress(n.progress); return; }
    const w0 = inner.offsetWidth; apply(n, true); const w1 = inner.offsetWidth;
    if (w0 !== w1 && !reduced()) inner.animate([{ width: w0 + "px" }, { width: w1 + "px" }], { duration: 320, easing: IN_OUT });
    layout();
  }
  function close() {
    if (closed) return; closed = true; clearTimeout(timer);
    live.splice(live.indexOf(t), 1); layout();
    const a = reduced() ? inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" })
      : inner.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 200, easing: EASE_IN, fill: "forwards" });
    a.onfinish = () => el.remove();
  }

  apply(o, false);
  el.style.zIndex = String(++z); el.style.transition = "none";
  h.append(el); live.unshift(t); layout();
  requestAnimationFrame(() => (el.style.transition = ""));
  if (reduced()) inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
  else inner.animate([{ opacity: 0, transform: `translateY(${h.dataset.pos === "bottom" ? 10 : -10}px)`, scale: ".98" }, { opacity: 1, transform: "none", scale: "1" }], { duration: 500, easing: ENTER });
  while (live.length > 3) live.at(-1).close();
  return t;
}
// ———— 通知：卡片在右上角叠起来，后面的卡底边各露出 12px、最多 3 层；指针移上去展开成列表；可以一键全部清除 ————
// notify({ icon, tone: "ok" | "bad" | "warn" | "", title, body, time, actions: [{ label, variant, run(card) }] }) → { el, close() }
// 页面上没有 .notifs 就自己建一个；每来一条在 document 上发 notify 事件（detail 是传进来的选项），铃铛这类地方可以跟着记
let nHost = null, nExpanded = false;
const nCards = [];
function notifHost() {
  if (nHost?.isConnected) return nHost;
  nHost = document.querySelector(".sn-notifs");
  if (!nHost) { nHost = document.createElement("div"); nHost.className = "sn-notifs"; nHost.setAttribute("aria-live", "polite"); nHost.innerHTML = tt("feedback.0"); document.body.append(nHost); }
  nHost.addEventListener("pointerenter", () => { if (nCards.length > 1) { nExpanded = true; nLayout(); } });
  nHost.addEventListener("pointerleave", () => { if (nExpanded) { nExpanded = false; nLayout(); } });
  nHost.querySelector("[data-clear-all]")?.addEventListener("click", () => [...nCards].forEach((c, i) => setTimeout(() => nDismiss(c), i * 40)));
  return nHost;
}
function nLayout() {
  const host = notifHost(), clearAll = host.querySelector("[data-clear-all]"), h0 = nCards[0]?.offsetHeight || 0; let y = 0;
  nCards.forEach((c, i) => {
    const h = c.offsetHeight; c.style.zIndex = String(100 - i);
    if (nExpanded) { c.style.transform = `translateY(${y}px)`; y += h + 8; c.classList.remove("sn-behind"); c.style.opacity = ""; }
    else { const k = 1 - i * .05; c.style.transform = i ? `translateY(${Math.max(0, h0 + 12 * i - h * k)}px) scale(${k})` : "none"; c.classList.toggle("sn-behind", i > 0); c.style.opacity = i < 3 ? "" : "0"; }
  });
  if (clearAll) clearAll.style.transform = `translateY(${y}px)`;
  host.style.height = nCards.length ? (nExpanded ? y + 36 : h0 + 24) + "px" : "0px";
  host.classList.toggle("sn-expanded", nExpanded && nCards.length > 1);
}
function nDismiss(c) {
  const i = nCards.indexOf(c); if (i < 0) return; nCards.splice(i, 1);
  c.animate([{ opacity: 1, transform: c.style.transform }, { opacity: 0, transform: `${c.style.transform === "none" ? "" : c.style.transform} translateX(28px)` }], { duration: 200, easing: EASE_IN, fill: "forwards" }).onfinish = () => c.remove();
  if (!nCards.length) nExpanded = false; nLayout();
}
export function notify(o = {}) {
  const host = notifHost(), time = o.time ?? new Date().toTimeString().slice(0, 5);
  const c = document.createElement("div"); c.className = "sn-notif"; c.setAttribute("role", o.tone === "bad" ? "alert" : "status");
  c.innerHTML = `<button class="sn-x" aria-label="${tt("feedback.1")}"></button><span class="sn-src ${o.tone ? "sn-" + o.tone : ""}">${o.icon ? icon(o.icon, 16) : ""}</span><div class="sn-top"><h5>${esc(o.title || "")}</h5><time>${esc(time)}</time></div>${o.body ? `<p>${fmt(o.body)}</p>` : ""}`
    + (o.actions?.length ? `<div class="sn-acts">${o.actions.map((a, i) => `<button class="sn-btn ${btnVariant(a.variant)} sn-sm" data-k="${i}">${esc(a.label)}</button>`).join("")}</div>` : "");
  c.querySelector(".sn-x").innerHTML = icon("x", 14);
  host.append(c); nCards.unshift(c);
  c.style.transition = "none"; c.style.transform = "translateY(-56px)"; c.style.opacity = "0"; void c.offsetWidth; c.style.transition = ""; c.style.opacity = "";
  nLayout();
  const api = { el: c, close: () => nDismiss(c) };
  c.querySelector(".sn-x").addEventListener("click", api.close);
  for (const b of c.querySelectorAll(".sn-acts .sn-btn")) b.addEventListener("click", () => { const a = o.actions[+b.dataset.k]; a.run ? a.run(api) : api.close(); });
  document.dispatchEvent(new CustomEvent("notify", { detail: o }));
  return api;
}
// ———— 横幅：关掉时高度收起；成功以后原地变绿、自己收起 ————
// closeBanner(.banner-wrap)：收起（高度过渡）；bindBanners(root)：横幅里的 [data-dismiss] 点了关
export const closeBanner = (wrap) => wrap?.classList.add("sn-closing");
export function bindBanners(root = document) { for (const x of root.querySelectorAll(".sn-banner-wrap [data-dismiss]")) { if (x._bw) continue; x._bw = true; x.addEventListener("click", () => closeBanner(x.closest(".sn-banner-wrap"))); } }
// ———— 骨架加载：300ms 内回来就不显示骨架；显示了就至少留 500ms；数据到了逐行替换（间隔 40ms），每行淡入 ————
// loadWithSkeleton(容器, { load, skeleton, render, stagger })：load() 返回 Promise（数据）；skeleton：骨架的 HTML；render(数据) 返回数据的 HTML。
// 返回 Promise：{ shown（骨架出现过没有）, waited（等了多久，ms）}
let skSeq = new WeakMap();
export function loadWithSkeleton(el, { load, skeleton = "", render = () => "", stagger = 40 } = {}) {
  const id = (skSeq.get(el) || 0) + 1; skSeq.set(el, id); const t0 = performance.now(); let shownAt = 0;
  const show = setTimeout(() => { if (skSeq.get(el) !== id) return; shownAt = performance.now(); el.innerHTML = skeleton; if (!reduced()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 }); }, 300);
  return Promise.resolve().then(load).then((data) => new Promise((resolve) => {
    clearTimeout(show); if (skSeq.get(el) !== id) return;
    const put = () => {
      if (skSeq.get(el) !== id) return;
      const html = render(data), waited = Math.round(performance.now() - t0);
      if (!shownAt) { el.innerHTML = html; resolve({ shown: false, waited }); return; }
      const tmp = document.createElement("div"); tmp.innerHTML = html; const next = [...tmp.children], rows = [...el.children];
      next.forEach((nr, i) => setTimeout(() => {
        if (skSeq.get(el) !== id) return;
        if (rows[i]) rows[i].replaceWith(nr); else el.append(nr);
        if (!reduced()) nr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0,0,.58,1)" });
        if (i === next.length - 1) { rows.slice(next.length).forEach((r) => r.remove()); resolve({ shown: true, waited }); }
      }, i * stagger));
      if (!next.length) { el.innerHTML = ""; resolve({ shown: true, waited }); }
    };
    setTimeout(put, shownAt ? Math.max(0, 500 - (performance.now() - shownAt)) : 0);
  }));
}
// ———— 进度卡：数量、进度条、剩余时间、可取消；完成时文字模糊换掉，图标原地变对勾 ————
// mountProgress(.pcard, { onCancel, onOpen }) → { start(title, sub), set(p, sub), finish(title, sub), cancel(title, sub) }
// 标记：.pc-title、.pc-num、.pbar > i、.pc-sub、[data-pc-cancel]、[data-pc-open]（没有就不出"打开"按钮）、.swap（图标换对勾）
export function mountProgress(pc, { onCancel, onOpen } = {}) {
  if (pc._pc) return pc._pc;
  const bar = pc.querySelector(".sn-pbar > i"), num = pc.querySelector(".sn-pc-num"), title = pc.querySelector(".sn-pc-title"), sub = pc.querySelector(".sn-pc-sub");
  const cancelBtn = pc.querySelector("[data-pc-cancel]"), openBtn = pc.querySelector("[data-pc-open]"), sw = pc.querySelector(".sn-swap");
  const swapText = (box, text, quiet) => {
    if (!box) return; const old = box.lastElementChild, span = document.createElement("span"); span.innerHTML = fmt(text);
    if (quiet || reduced() || !old) { box.replaceChildren(span); return; }
    old.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-3px)" }], { duration: 160, easing: EASE_IN, fill: "forwards" }).onfinish = () => old.remove();
    box.append(span); span.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 100, easing: ENTER, fill: "backwards" });
  };
  const api = {
    start(t, s2, enter = true) {
      pc.classList.remove("sn-done", "sn-canceled"); sw?.classList.remove("sn-on"); pc.style.setProperty("--sn-p", 0); bar.style.width = "0%"; num.textContent = "0%";
      swapText(title, t, !enter); swapText(sub, s2 || tt("feedback.2"), !enter); cancelBtn?.classList.remove("sn-off"); openBtn?.classList.add("sn-off");
      if (enter && !reduced()) pc.animate([{ opacity: 0, transform: "translateY(8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: ENTER });
    },
    set(p, s2) { p = Math.max(0, Math.min(1, p)); bar.style.width = p * 100 + "%"; num.textContent = Math.round(p * 100) + "%"; if (s2 != null && sub?.lastElementChild) sub.lastElementChild.textContent = s2; },
    finish(t, s2) { pc.classList.add("sn-done"); sw?.classList.add("sn-on"); swapText(title, t); swapText(sub, s2); cancelBtn?.classList.add("sn-off"); openBtn?.classList.remove("sn-off"); },
    cancel(t, s2) { pc.classList.add("sn-canceled"); swapText(title, t || tt("feedback.3")); swapText(sub, s2 || ""); cancelBtn?.classList.add("sn-off"); },
  };
  cancelBtn?.addEventListener("click", () => onCancel?.(api));
  openBtn?.addEventListener("click", () => onOpen?.(api));
  return (pc._pc = api);
}
// 展示页接线（demo/）要用的内部名字
export { reduced };
