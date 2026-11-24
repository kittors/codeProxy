// 主题定制面板：主色、状态色、字体、字号、圆角、线条质感、过渡节奏，改了马上生效（所有组件只认 CSS 变量）。展示页顶栏和官网共用这一份。
// 颜色选择使用 Satin 原生风格自定义取色器（2D 饱和度/明度画布 + 色相条 + HEX 精准输入 + 屏幕吸管 + 精选色板 + 对比度提示），告别浏览器原生硬边框弹窗。
import * as T from "./theme.js";
import { scoped, onLocaleChange } from "./i18n.js";
import { initSeg as coreInitSeg, injectIcons as coreInjectIcons, hideTip } from "./core.js";
import { defineComponent } from "./lifecycle.js";
import { hitAny, pushDismiss, dropDismiss } from "./dismiss.js";
import { computeFloating } from "./floating.js";
import I18N_DEFAULTS from "./locales/zh-CN/theme-panel.js";

const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);

const STATE_DEFAULTS = { success: "#248a3d", warning: "#b25000", danger: "#d92d20" };
const PRESET_SWATCHES = {
  custom: ["#0a66d9", "#4f46e5", "#7c3aed", "#0d9488", "#18794e", "#b45309", "#d6245b", "#334155"],
  success: ["#15803d", "#248a3d", "#18794e", "#0d9488", "#16a34a", "#059669"],
  warning: ["#b25000", "#b45309", "#c2410c", "#a16207", "#d97706", "#9a3412"],
  danger: ["#d92d20", "#dc2626", "#e11d48", "#be123c", "#b91c1c", "#c81e1e"],
};

const EYE_SVG = '<svg class="sn-ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.4 3.6a2.1 2.1 0 0 1 3 3l-2.6 2.6-3-3 2.6-2.6Z"/><path d="m14.2 5.4 4.4 4.4"/><path d="m16.2 9.2-8.1 8.1a2 2 0 0 1-1 .55l-3.2.65.65-3.2a2 2 0 0 1 .55-1l8.1-8.1"/></svg>';
const CLOSE_SVG = '<svg class="sn-ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

// ———— 色彩换算工具（纯数学、零依赖、保留黑白色下的色相记忆） ————
const clamp01 = (n) => Math.max(0, Math.min(1, n));
function parseHex(str) {
  const s = String(str || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) return "#" + s.split("").map((c) => c + c).join("").toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toLowerCase();
  return null;
}
function hexToRgb(h) {
  const n = parseHex(h) || "#0a66d9";
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function hexToHsv(h, fallbackHue = 212) {
  const [r0, g0, b0] = hexToRgb(h).map((v) => v / 255);
  const max = Math.max(r0, g0, b0), min = Math.min(r0, g0, b0), d = max - min;
  let hue = fallbackHue;
  if (d > 1e-6) {
    if (max === r0) hue = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) * 60;
    else if (max === g0) hue = ((b0 - r0) / d + 2) * 60;
    else hue = ((r0 - g0) / d + 4) * 60;
  }
  return { h: Math.round(hue) % 360, s: max > 1e-6 ? d / max : 0, v: max };
}
function hsvToHex(h, s, v) {
  const hh = ((h % 360) + 360) % 360, c = v * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
function contrastRatio(hexA, hexB) {
  const x = T.luminance(hexA), y = T.luminance(hexB);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ———— 自定义颜色选择器浮层（挂在 body，不裁切、不误关外层面板，支持指针捕获与键盘微调） ————
let activePicker = null;

function createColorPopover({ anchor, key, title, value, defaultValue, hasCustom, swatches, onChange, onReset, onClose }) {
  activePicker?.close(false);
  hideTip();

  const pop = document.createElement("div");
  pop.className = "sn-pop sn-cp-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", title);
  pop.tabIndex = -1;

  const canDropper = typeof window !== "undefined" && typeof window.EyeDropper === "function";
  pop.innerHTML =
    `<div class="sn-cp-hd">` +
      `<span class="sn-cp-title"></span>` +
      `<span class="sn-cp-ratio" data-cp-ratio></span>` +
      `<button type="button" class="sn-cp-reset" data-cp-reset>${tt("theme-panel.18")}</button>` +
      `<button type="button" class="sn-cp-x" data-cp-close aria-label="${tt("theme-panel.19")}">${CLOSE_SVG}</button>` +
    `</div>` +
    `<div class="sn-cp-sv" role="slider" tabindex="0" aria-label="${tt("theme-panel.13")}" aria-valuemin="0" aria-valuemax="100"><span class="sn-cp-cur"></span></div>` +
    `<div class="sn-cp-hue" role="slider" tabindex="0" aria-label="${tt("theme-panel.14")}" aria-valuemin="0" aria-valuemax="360"><span class="sn-cp-thumb"></span></div>` +
    `<div class="sn-cp-row">` +
      `<span class="sn-cp-swatch"></span>` +
      `<label class="sn-cp-hex"><span class="sn-cp-hash" aria-hidden="true">#</span><input type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${tt("theme-panel.15")}"></label>` +
      (canDropper ? `<button type="button" class="sn-cp-eye" data-cp-eye aria-label="${tt("theme-panel.16")}" data-tip="${tt("theme-panel.16")}">${EYE_SVG}</button>` : "") +
    `</div>` +
    `<div class="sn-cp-sw" role="group" aria-label="${tt("theme-panel.17")}">` +
      swatches.map((c) => `<button type="button" class="sn-cp-dot" data-sw="${c}" style="--sn-c:${c}" aria-label="${c}"></button>`).join("") +
    `</div>`;

  pop.querySelector(".sn-cp-title").textContent = title;
  document.body.appendChild(pop);

  const svEl = pop.querySelector(".sn-cp-sv");
  const curEl = pop.querySelector(".sn-cp-cur");
  const hueEl = pop.querySelector(".sn-cp-hue");
  const thumbEl = pop.querySelector(".sn-cp-thumb");
  const swBox = pop.querySelector(".sn-cp-swatch");
  const hexIn = pop.querySelector(".sn-cp-hex input");
  const ratioEl = pop.querySelector("[data-cp-ratio]");
  const resetBtn = pop.querySelector("[data-cp-reset]");
  const closeBtn = pop.querySelector("[data-cp-close]");
  const eyeBtn = pop.querySelector("[data-cp-eye]");
  const swBtns = [...pop.querySelectorAll(".sn-cp-dot")];

  let curHex = parseHex(value) || parseHex(defaultValue) || "#0a66d9";
  let hsv = hexToHsv(curHex);
  let customized = !!hasCustom;
  let closed = false;

  const paintUI = (syncInput = true) => {
    const pureHue = `hsl(${hsv.h} 100% 50%)`;
    svEl.style.setProperty("--sn-cp-h", String(hsv.h));
    curEl.style.left = `${(hsv.s * 100).toFixed(2)}%`;
    curEl.style.top = `${((1 - hsv.v) * 100).toFixed(2)}%`;
    curEl.style.background = curHex;
    svEl.setAttribute("aria-valuenow", String(Math.round(hsv.s * 100)));
    svEl.setAttribute("aria-valuetext", `${curHex.toUpperCase()}`);

    thumbEl.style.left = `${((hsv.h / 360) * 100).toFixed(2)}%`;
    thumbEl.style.background = pureHue;
    hueEl.setAttribute("aria-valuenow", String(Math.round(hsv.h)));

    swBox.style.background = curHex;
    if (syncInput && document.activeElement !== hexIn) hexIn.value = curHex.slice(1).toUpperCase();
    resetBtn.hidden = !customized;

    for (const b of swBtns) b.setAttribute("aria-pressed", String(b.dataset.sw.toLowerCase() === curHex));

    // 显示当前浅/深主题背景下的实际生效对比度，帮助判断文字可读性
    const dark = document.documentElement.dataset.theme === "dark";
    const bg = dark ? "#1c1c1e" : "#ffffff";
    const effective = T.vars({ ...T.get(), [key === "custom" ? "custom" : key]: curHex }, dark)[key === "custom" ? "--sn-accent" : `--sn-${key}`] || curHex;
    const ratio = contrastRatio(effective, bg);
    const fitted = effective.toLowerCase() !== curHex.toLowerCase();
    ratioEl.textContent = `${ratio >= 4.5 ? "AA" : ""} ${ratio.toFixed(1)}:1`.trim();
    ratioEl.classList.toggle("sn-cp-fit", fitted);
    if (fitted) ratioEl.dataset.tip = tt("theme-panel.23");
    else delete ratioEl.dataset.tip;
  };

  const commit = (nextHex, syncInput = true) => {
    curHex = nextHex;
    customized = true;
    paintUI(syncInput);
    onChange(nextHex);
  };

  const place = () => {
    if (closed || !anchor.isConnected) { close(false); return; }
    const ar = anchor.getBoundingClientRect();
    if (ar.width === 0 && ar.height === 0) { close(false); return; }
    const preferRight = ar.left + ar.width / 2 > innerWidth / 2;
    const pos = computeFloating(pop, anchor, { align: preferRight ? "end" : "start", gap: 8, margin: 12 });
    pop.style.left = `${pos.left}px`;
    pop.style.top = `${pos.top}px`;
    pop.classList.toggle("sn-up", pos.up);
    pop.style.transformOrigin = `${pos.ox}px ${pos.oy}px`;
  };

  // 2D 饱和度/明度画布拖拽
  const pickSV = (e) => {
    const r = svEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    hsv.s = clamp01((e.clientX - r.left) / r.width);
    hsv.v = clamp01(1 - (e.clientY - r.top) / r.height);
    commit(hsvToHex(hsv.h, hsv.s, hsv.v));
  };
  let dragSV = false;
  svEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragSV = true;
    svEl.classList.add("sn-cp-drag");
    svEl.setPointerCapture?.(e.pointerId);
    svEl.focus({ preventScroll: true });
    pickSV(e);
  });
  svEl.addEventListener("pointermove", (e) => { if (dragSV) pickSV(e); });
  const endSV = () => { if (!dragSV) return; dragSV = false; svEl.classList.remove("sn-cp-drag"); };
  svEl.addEventListener("pointerup", endSV);
  svEl.addEventListener("pointercancel", endSV);
  svEl.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowRight") hsv.s = clamp01(hsv.s + step);
    else if (e.key === "ArrowLeft") hsv.s = clamp01(hsv.s - step);
    else if (e.key === "ArrowUp") hsv.v = clamp01(hsv.v + step);
    else if (e.key === "ArrowDown") hsv.v = clamp01(hsv.v - step);
    else return;
    e.preventDefault();
    commit(hsvToHex(hsv.h, hsv.s, hsv.v));
  });

  // 色相条拖拽
  const pickHue = (e) => {
    const r = hueEl.getBoundingClientRect();
    if (!r.width) return;
    hsv.h = Math.round(clamp01((e.clientX - r.left) / r.width) * 359);
    commit(hsvToHex(hsv.h, hsv.s, hsv.v));
  };
  let dragHue = false;
  hueEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragHue = true;
    hueEl.classList.add("sn-cp-drag");
    hueEl.setPointerCapture?.(e.pointerId);
    hueEl.focus({ preventScroll: true });
    pickHue(e);
  });
  hueEl.addEventListener("pointermove", (e) => { if (dragHue) pickHue(e); });
  const endHue = () => { if (!dragHue) return; dragHue = false; hueEl.classList.remove("sn-cp-drag"); };
  hueEl.addEventListener("pointerup", endHue);
  hueEl.addEventListener("pointercancel", endHue);
  hueEl.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 15 : 3;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") hsv.h = (hsv.h + step) % 360;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") hsv.h = (hsv.h - step + 360) % 360;
    else return;
    e.preventDefault();
    commit(hsvToHex(hsv.h, hsv.s, hsv.v));
  });

  // HEX 精准输入
  hexIn.addEventListener("input", () => {
    const clean = hexIn.value.replace(/[^0-9a-fA-F#]/g, "");
    const p = parseHex(clean);
    hexIn.parentElement.classList.toggle("sn-cp-bad", clean.length > 0 && !p);
    if (p) {
      hsv = hexToHsv(p, hsv.h);
      commit(p, false);
    }
  });
  hexIn.addEventListener("blur", () => {
    hexIn.parentElement.classList.remove("sn-cp-bad");
    hexIn.value = curHex.slice(1).toUpperCase();
  });
  hexIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); hexIn.blur(); }
  });

  // 屏幕吸管（支持 EyeDropper API 的浏览器自动启用；吸管期间窗口失焦不误关面板）
  let pickingEye = false;
  eyeBtn?.addEventListener("click", async () => {
    pickingEye = true;
    try {
      const res = await new window.EyeDropper().open();
      const p = parseHex(res?.sRGBHex);
      if (p && !closed) { hsv = hexToHsv(p, hsv.h); commit(p); }
    } catch { /* 用户按 Esc 取消吸管，无需报错 */ }
    finally { pickingEye = false; }
  });

  // 精选快捷色卡
  pop.addEventListener("click", (e) => {
    const b = e.target.closest(".sn-cp-dot");
    if (!b) return;
    const p = parseHex(b.dataset.sw);
    if (p) { hsv = hexToHsv(p, hsv.h); commit(p); }
  });

  // 还原此项默认色 / 关闭
  resetBtn.addEventListener("click", () => {
    customized = false;
    curHex = parseHex(defaultValue) || "#0a66d9";
    hsv = hexToHsv(curHex, hsv.h);
    onReset();
    paintUI();
  });
  closeBtn.addEventListener("click", () => close(true));

  // 外部点击、Esc、焦点移出与窗口失焦统一交由 dismiss.js 协同（不误关外层主题面板或抽屉）
  const onViewport = () => place();
  const dismissLayer = pushDismiss({
    panel: pop,
    trigger: anchor,
    close: (refocus) => close(refocus),
    contains: (t, path) => hitAny(t, path, [pop, anchor]),
    blur: () => !pickingEye,
  });

  addEventListener("resize", onViewport);
  addEventListener("scroll", onViewport, { passive: true, capture: true });
  addEventListener("satin-reposition", onViewport);

  paintUI();
  place();
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("sn-is-open");
  requestAnimationFrame(() => { if (!closed) pop.classList.add("sn-open"); });

  function close(refocus = false) {
    if (closed) return;
    closed = true;
    if (activePicker === api) activePicker = null;
    dropDismiss(dismissLayer);
    removeEventListener("resize", onViewport);
    removeEventListener("scroll", onViewport, { capture: true });
    removeEventListener("satin-reposition", onViewport);
    anchor.setAttribute("aria-expanded", "false");
    anchor.classList.remove("sn-is-open");
    pop.classList.remove("sn-open");
    setTimeout(() => pop.remove(), 180);
    onClose?.();
    if (refocus && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  const api = {
    anchor,
    key,
    close,
    syncFromTheme() {
      if (closed) return;
      const t = T.get();
      const val = key === "custom" ? t.custom : t[key];
      customized = !!val;
      const next = parseHex(val) || parseHex(defaultValue) || curHex;
      if (next !== curHex) { curHex = next; hsv = hexToHsv(next, hsv.h); }
      paintUI();
    },
  };
  activePicker = api;
  return api;
}

export function themePanelHTML() {
  const t = T.get();
  return `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.0")}</span><div class="sn-th-sw" role="radiogroup" aria-label="${tt("theme-panel.0")}">`
    + T.ACCENTS.map((a) => `<button type="button" class="sn-th-dot${a.id === "ink" ? " sn-ink" : ""}" data-accent="${a.id}" role="radio" aria-checked="${!t.custom && t.accent === a.id}" aria-label="${a.name}" data-tip="${a.name}"${a.light ? ` style="--sn-c:${a.light};--sn-c-d:${a.dark}"` : ""}></button>`).join("")
    + `<button type="button" class="sn-th-dot sn-th-custom" data-custom-pick role="radio" aria-checked="${!!t.custom}" aria-haspopup="dialog" aria-expanded="false" aria-label="${tt("theme-panel.2")}" data-tip="${tt("theme-panel.1")}"${t.custom ? ` style="--sn-c:${t.custom}"` : ""}><span data-i="plus"></span></button></div></div>`
    + `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.3")}</span><div class="sn-th-st">`
    + [["success", tt("theme-panel.4")], ["warning", tt("theme-panel.5")], ["danger", tt("theme-panel.6")]].map(([k, n]) => `<button type="button" class="sn-th-pick" data-state-pick="${k}" aria-haspopup="dialog" aria-expanded="false"><i style="--sn-c:var(--sn-${k})"></i><span>${n}</span></button>`).join("")
    + `</div></div>`
    + `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.7")}</span><div class="sn-seg sn-sm" data-th="font"><span class="sn-thumb"></span>${T.FONTS.map((f) => `<button type="button" data-v="${f.id}">${f.name}</button>`).join("")}</div></div>`
    + `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.8")}</span><div class="sn-seg sn-sm" data-th="scale"><span class="sn-thumb"></span>${T.SCALES.map((s) => `<button type="button" data-v="${s.id}">${s.name}</button>`).join("")}</div></div>`
    + `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.9")}</span><div class="sn-seg sn-sm" data-th="radius"><span class="sn-thumb"></span>${T.RADII.map((r) => `<button type="button" data-v="${r.id}">${r.name}</button>`).join("")}</div></div>`
    + `<div class="sn-th-grid">`
    + `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.11")}</span><div class="sn-seg sn-sm" data-th="line"><span class="sn-thumb"></span>${T.LINES.map((l) => `<button type="button" data-v="${l.id}">${l.name}</button>`).join("")}</div></div>`
    + `<div class="sn-th-sec"><span class="sn-th-h">${tt("theme-panel.12")}</span><div class="sn-seg sn-sm" data-th="motion"><span class="sn-thumb"></span>${T.MOTIONS.map((m) => `<button type="button" data-v="${m.id}">${m.name}</button>`).join("")}</div></div>`
    + `</div>`
    + `<div class="sn-th-foot"><button type="button" class="sn-textbtn" data-th-reset>${tt("theme-panel.10")}</button></div>`;
}

// 挂到一个容器上：生成面板内容、接上交互；返回 { sync()（外面改了主题时刷新选中状态）, destroy() }。
// 第二个参数不用给（分段控件、图标都从库里取）；以前要手动传进来的 { initSeg, injectIcons } 仍然接受
export function mountThemePanel(box, { initSeg = coreInitSeg, injectIcons = coreInjectIcons } = {}) {
  let segs = {}, own = false, ownPicker = null;
  const setOwn = (patch) => { own = true; T.set(patch); own = false; };
  const closeOwnPicker = () => { if (ownPicker) { const p = ownPicker; ownPicker = null; p.close(false); } };

  const wire = () => {
    const t = T.get();
    segs = {
      font: initSeg(box.querySelector('[data-th="font"]'), (v) => setOwn({ font: v }), Math.max(0, T.FONTS.findIndex((f) => f.id === t.font))),
      scale: initSeg(box.querySelector('[data-th="scale"]'), (v) => setOwn({ scale: v }), Math.max(0, T.SCALES.findIndex((s) => s.id === t.scale))),
      radius: initSeg(box.querySelector('[data-th="radius"]'), (v) => setOwn({ radius: v }), Math.max(0, T.RADII.findIndex((r) => r.id === t.radius))),
      line: initSeg(box.querySelector('[data-th="line"]'), (v) => setOwn({ line: v }), Math.max(0, T.LINES.findIndex((l) => l.id === t.line))),
      motion: initSeg(box.querySelector('[data-th="motion"]'), (v) => setOwn({ motion: v }), Math.max(0, T.MOTIONS.findIndex((m) => m.id === t.motion))),
    };
  };

  const render = () => {
    closeOwnPicker();
    box.innerHTML = themePanelHTML();
    injectIcons?.(box);
    wire();
  };

  const sync = () => {
    const t = T.get();
    for (const b of box.querySelectorAll("[data-accent]")) b.setAttribute("aria-checked", String(!t.custom && t.accent === b.dataset.accent));
    const cu = box.querySelector(".sn-th-custom");
    if (cu) {
      cu.setAttribute("aria-checked", String(!!t.custom));
      if (t.custom) cu.style.setProperty("--sn-c", t.custom);
      else cu.style.removeProperty("--sn-c");
    }
    ownPicker?.syncFromTheme();
    if (own) return;
    segs.font?.go(Math.max(0, T.FONTS.findIndex((f) => f.id === t.font)), false, true);
    segs.scale?.go(Math.max(0, T.SCALES.findIndex((x) => x.id === t.scale)), false, true);
    segs.radius?.go(Math.max(0, T.RADII.findIndex((x) => x.id === t.radius)), false, true);
    segs.line?.go(Math.max(0, T.LINES.findIndex((x) => x.id === t.line)), false, true);
    segs.motion?.go(Math.max(0, T.MOTIONS.findIndex((x) => x.id === t.motion)), false, true);
  };

  const openFor = (anchor, key) => {
    if (ownPicker && ownPicker.anchor === anchor) { closeOwnPicker(); return; }
    const t = T.get();
    const isCustom = key === "custom";
    const presetAccent = T.ACCENTS.find((a) => a.id === t.accent);
    const dark = document.documentElement.dataset.theme === "dark";
    const defaultValue = isCustom ? ((dark ? presetAccent?.dark : presetAccent?.light) || "#0a66d9") : STATE_DEFAULTS[key];
    const currentVal = isCustom ? (t.custom || defaultValue) : (t[key] || defaultValue);
    const titleMap = { custom: tt("theme-panel.2"), success: tt("theme-panel.20"), warning: tt("theme-panel.21"), danger: tt("theme-panel.22") };
    ownPicker = createColorPopover({
      anchor,
      key,
      title: titleMap[key] || tt("theme-panel.1"),
      value: currentVal,
      defaultValue,
      hasCustom: isCustom ? !!t.custom : !!t[key],
      swatches: PRESET_SWATCHES[key] || PRESET_SWATCHES.custom,
      onChange: (hex) => { T.set(isCustom ? { custom: hex } : { [key]: hex }); },
      onReset: () => { T.set(isCustom ? { custom: "" } : { [key]: "" }); },
      onClose: () => { ownPicker = null; },
    });
  };

  const onClick = (e) => {
    const a = e.target.closest("[data-accent]");
    if (a) { closeOwnPicker(); T.set({ accent: a.dataset.accent, custom: "" }); sync(); return; }
    const cu = e.target.closest("[data-custom-pick]");
    if (cu) { openFor(cu, "custom"); return; }
    const st = e.target.closest("[data-state-pick]");
    if (st) { openFor(st, st.dataset.statePick); return; }
    if (e.target.closest("[data-th-reset]")) { closeOwnPicker(); T.reset(); render(); sync(); }
  };

  render();
  box.addEventListener("click", onClick);
  const offTheme = T.onChange(sync);
  const offLocale = onLocaleChange(() => { render(); sync(); });

  return {
    sync,
    destroy() {
      closeOwnPicker();
      box.removeEventListener("click", onClick);
      offTheme();
      offLocale();
    },
  };
}

// createThemePanel(空容器) → { sync, destroy, ... }：统一的组件写法；destroy 时退订主题变化、撤掉监听、清空容器
export const createThemePanel = /* @__PURE__ */ defineComponent({
  name: "theme-panel",
  html: () => `<div class="sn-th-panel"></div>`,
  mount(el) { return mountThemePanel(el); },
});
